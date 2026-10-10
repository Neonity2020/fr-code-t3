import * as NodeServices from "@effect/platform-node/NodeServices";
import { it, assert } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import * as BackgroundPolicy from "../background/BackgroundPolicy.ts";
import * as ServerConfig from "../config.ts";
import * as ServerSettingsModule from "../serverSettings.ts";
import { readProviderStatusCache, resolveProviderStatusCachePath } from "./providerStatusCache.ts";
import { COMPACT_SLASH_COMMAND } from "./providerSnapshot.ts";
import type { ProviderInstance, ProviderWorkspaceSnapshot } from "./ProviderDriver.ts";
import * as ProviderInstanceRegistry from "./ProviderInstanceRegistry.ts";
import * as ProviderRegistry from "./ProviderRegistry.ts";
import { makeManualOnlyProviderMaintenanceCapabilities } from "./providerMaintenance.ts";
const TEST_EPOCH = DateTime.makeUnsafe("1970-01-01T00:00:00.000Z");
const withBundledCompatibility = (snapshot: ServerProvider) => snapshot;

const layerBackgroundPolicyAlwaysRun = Layer.mock(BackgroundPolicy.BackgroundPolicy)({
  reportClientActivity: () => Effect.void,
  removeRpcClient: () => Effect.void,
  reportHostPowerState: () => Effect.void,
  snapshot: Effect.succeed({
    hostPower: {
      source: "unknown",
      idle: "unknown",
      idleSeconds: null,
      locked: "unknown",
      suspended: false,
      onBattery: "unknown",
      lowPowerMode: "unknown",
      thermalState: "unknown",
      stale: true,
      updatedAt: TEST_EPOCH,
    },
    leases: [],
    activeForegroundLeaseCount: 0,
    activeScopeKeys: [],
    shouldRunOpportunisticWork: true,
    updatedAt: TEST_EPOCH,
  }),
  streamChanges: Stream.empty,
  hasDemand: () => Effect.succeed(true),
  shouldRunScopeWork: () => Effect.succeed(true),
  shouldRunOpportunisticWork: Effect.succeed(true),
});

function selectDescriptor(
  id: string,
  label: string,
  options: ReadonlyArray<{ id: string; label: string; isDefault?: boolean }>,
) {
  return {
    id,
    label,
    type: "select" as const,
    options: [...options],
    ...(options.find((option) => option.isDefault)?.id
      ? { currentValue: options.find((option) => option.isDefault)?.id }
      : {}),
  };
}

function booleanDescriptor(id: string, label: string) {
  return {
    id,
    label,
    type: "boolean" as const,
  };
}

// The registry writes the status cache and only then publishes the change, so
// a subscriber that sees `checkedAt` on the stream knows the file is on disk.
// Subscribed before the publish that triggers it; a spin on the file would
// race the write and lose on a slow host.
const awaitPersistedProvider = (
  registry: ProviderRegistry.ProviderRegistry["Service"],
  checkedAt: string,
) =>
  registry.streamChanges.pipe(
    Stream.filter((providers) => providers.some((provider) => provider.checkedAt === checkedAt)),
    Stream.take(1),
    Stream.runDrain,
    Effect.forkScoped,
  );

it.layer(Layer.mergeAll(NodeServices.layer, ServerSettingsModule.layerTest()))(
  "ProviderRegistry",
  (it) => {
    it("stores workspace skills and commands without changing machine metadata", () => {
      const provider = {
        instanceId: ProviderInstanceId.make("codex"),
        driver: ProviderDriverKind.make("codex"),
        status: "ready",
        enabled: true,
        installed: true,
        auth: { status: "authenticated" },
        checkedAt: "2026-03-25T00:00:00.000Z",
        version: "1.0.0",
        models: [],
        slashCommands: [{ name: "global" }],
        skills: [{ name: "global", path: "/global/SKILL.md", enabled: true }],
      } satisfies ServerProvider;
      const scopedSnapshot = {
        ...provider,
        checkedAt: "2026-03-25T00:01:00.000Z",
        slashCommands: [{ name: "project" }],
        skills: [{ name: "project", path: "/project/SKILL.md", enabled: true }],
      } satisfies ServerProvider;

      const result = ProviderRegistry.upsertProviderWorkspaceSnapshot(
        provider,
        "/project",
        scopedSnapshot,
      );

      assert.deepStrictEqual(result.slashCommands, provider.slashCommands);
      assert.deepStrictEqual(result.skills, provider.skills);
      assert.deepStrictEqual(result.workspaceSnapshots, [
        {
          cwd: "/project",
          checkedAt: scopedSnapshot.checkedAt,
          slashCommands: scopedSnapshot.slashCommands,
          skills: scopedSnapshot.skills,
        },
      ]);

      const pendingSnapshot = {
        ...scopedSnapshot,
        slashCommands: [COMPACT_SLASH_COMMAND],
        slashCommandsPending: true,
      } satisfies ProviderWorkspaceSnapshot;
      const partial = ProviderRegistry.upsertProviderWorkspaceSnapshot(
        result,
        "/project",
        pendingSnapshot,
      );
      assert.deepStrictEqual(partial.workspaceSnapshots?.[0]?.slashCommands, [{ name: "project" }]);
      assert.strictEqual(partial.workspaceSnapshots?.[0]?.slashCommandsPending, true);
      const otherProject = ProviderRegistry.upsertProviderWorkspaceSnapshot(
        partial,
        "/other-project",
        pendingSnapshot,
      );
      assert.deepStrictEqual(otherProject.workspaceSnapshots?.[1]?.slashCommands, [
        COMPACT_SLASH_COMMAND,
      ]);
      const recovered = ProviderRegistry.upsertProviderWorkspaceSnapshot(partial, "/project", {
        ...scopedSnapshot,
        slashCommands: [COMPACT_SLASH_COMMAND, { name: "replacement" }],
      });
      assert.deepStrictEqual(recovered.workspaceSnapshots?.[0]?.slashCommands, [
        COMPACT_SLASH_COMMAND,
        { name: "replacement" },
      ]);
      assert.strictEqual(recovered.workspaceSnapshots?.[0]?.slashCommandsPending, undefined);
    });
    it("preserves previously discovered provider models when a refresh returns none", () => {
      const previousProvider = {
        instanceId: ProviderInstanceId.make("cursor"),
        driver: ProviderDriverKind.make("cursor"),
        status: "ready",
        enabled: true,
        installed: true,
        auth: { status: "authenticated" },
        checkedAt: "2026-04-14T00:00:00.000Z",
        version: "2026.04.09-f2b0fcd",
        models: [
          {
            slug: "claude-opus-4-6",
            name: "Opus 4.6",
            isCustom: false,
            capabilities: createModelCapabilities({
              optionDescriptors: [
                selectDescriptor("reasoning", "Reasoning", [
                  { id: "high", label: "High", isDefault: true },
                ]),
                booleanDescriptor("fastMode", "Fast Mode"),
                booleanDescriptor("thinking", "Thinking"),
              ],
            }),
          },
        ],
        slashCommands: [{ name: "review", description: "Review changes" }],
        skills: [
          {
            name: "typescript",
            description: "TypeScript help",
            path: "/skills/typescript/SKILL.md",
            enabled: true,
          },
        ],
      } as const satisfies ServerProvider;
      const refreshedProvider = {
        ...previousProvider,
        checkedAt: "2026-04-14T00:01:00.000Z",
        models: [],
        slashCommands: [],
        skills: [],
      } satisfies ServerProvider;

      assert.deepStrictEqual(
        ProviderRegistry.mergeProviderSnapshot(previousProvider, refreshedProvider).models,
        [...previousProvider.models],
      );
      assert.deepStrictEqual(
        ProviderRegistry.mergeProviderSnapshot(previousProvider, refreshedProvider).slashCommands,
        [],
      );
      assert.deepStrictEqual(
        ProviderRegistry.mergeProviderSnapshot(previousProvider, refreshedProvider).skills,
        [],
      );
    });
    it("drops custom models the refreshed snapshot no longer carries", () => {
      const previousProvider = {
        instanceId: ProviderInstanceId.make("claudeAgent"),
        driver: ProviderDriverKind.make("claudeAgent"),
        status: "ready",
        enabled: true,
        installed: true,
        auth: { status: "authenticated" },
        checkedAt: "2026-04-14T00:00:00.000Z",
        version: "2.1.0",
        models: [
          {
            slug: "claude-sonnet-4-6",
            name: "Sonnet 4.6",
            isCustom: false,
            capabilities: null,
          },
          {
            slug: "removed-custom",
            name: "removed-custom",
            isCustom: true,
            capabilities: null,
          },
        ],
        slashCommands: [],
        skills: [],
      } as const satisfies ServerProvider;
      const refreshedProvider = {
        ...previousProvider,
        checkedAt: "2026-04-14T00:01:00.000Z",
        models: [previousProvider.models[0]],
      } satisfies ServerProvider;

      assert.deepStrictEqual(
        ProviderRegistry.mergeProviderSnapshot(previousProvider, refreshedProvider).models,
        [...refreshedProvider.models],
      );
    });
    it("fills missing capabilities from the previous provider snapshot", () => {
      const previousProvider = {
        instanceId: ProviderInstanceId.make("cursor"),
        driver: ProviderDriverKind.make("cursor"),
        status: "ready",
        enabled: true,
        installed: true,
        auth: { status: "authenticated" },
        checkedAt: "2026-04-14T00:00:00.000Z",
        version: "2026.04.09-f2b0fcd",
        models: [
          {
            slug: "claude-opus-4-6",
            name: "Opus 4.6",
            isCustom: false,
            capabilities: createModelCapabilities({
              optionDescriptors: [
                selectDescriptor("reasoning", "Reasoning", [
                  { id: "high", label: "High", isDefault: true },
                ]),
                booleanDescriptor("fastMode", "Fast Mode"),
                booleanDescriptor("thinking", "Thinking"),
              ],
            }),
          },
        ],
        slashCommands: [],
        skills: [],
      } as const satisfies ServerProvider;
      const refreshedProvider = {
        ...previousProvider,
        checkedAt: "2026-04-14T00:01:00.000Z",
        models: [
          {
            slug: "claude-opus-4-6",
            name: "Opus 4.6",
            isCustom: false,
            capabilities: createModelCapabilities({
              optionDescriptors: [],
            }),
          },
        ],
      } satisfies ServerProvider;

      assert.deepStrictEqual(
        ProviderRegistry.mergeProviderSnapshot(previousProvider, refreshedProvider).models,
        [...previousProvider.models],
      );
    });
    it.effect("does not run provider probes during layer construction", () =>
      Effect.gen(function* () {
        const codexDriver = ProviderDriverKind.make("codex");
        const codexInstanceId = ProviderInstanceId.make("codex");
        const initialProvider = {
          instanceId: codexInstanceId,
          driver: codexDriver,
          status: "warning",
          enabled: true,
          installed: false,
          auth: { status: "unknown" },
          checkedAt: "2026-06-10T00:00:00.000Z",
          version: null,
          message: "Checking Codex provider status.",
          models: [],
          slashCommands: [],
          skills: [],
        } as const satisfies ServerProvider;
        const refreshCalls = yield* Ref.make(0);
        const instance = {
          instanceId: codexInstanceId,
          driverKind: codexDriver,
          continuationIdentity: {
            driverKind: codexDriver,
            continuationKey: "codex:instance:codex",
          },
          displayName: undefined,
          enabled: true,
          snapshot: {
            resolveMaintenance: () =>
              Effect.succeed(
                makeManualOnlyProviderMaintenanceCapabilities({
                  provider: codexDriver,
                  packageName: null,
                }),
              ),
            getSnapshot: Effect.succeed(initialProvider),
            refresh: Ref.update(refreshCalls, (count) => count + 1).pipe(
              Effect.andThen(Effect.never),
            ),
            streamChanges: Stream.empty,
            applyUsageLimits: () => Effect.void,
          },
          orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
          textGeneration: {} as ProviderInstance["textGeneration"],
        } satisfies ProviderInstance;
        const layerInstanceRegistry = Layer.succeed(
          ProviderInstanceRegistry.ProviderInstanceRegistry,
          {
            getInstance: (instanceId) =>
              Effect.succeed(instanceId === codexInstanceId ? instance : undefined),
            listInstances: Effect.succeed([instance]),
            listUnavailable: Effect.succeed([]),
            streamChanges: Stream.empty,
            subscribeChanges: Effect.flatMap(PubSub.unbounded<void>(), PubSub.subscribe),
          },
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const runtimeServices = yield* Layer.build(
          ProviderRegistry.layer.pipe(
            Layer.provideMerge(layerInstanceRegistry),
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), {
                prefix: "t3-provider-registry-background-refresh-",
              }),
            ),
            Layer.provideMerge(NodeServices.layer),
          ),
        ).pipe(Scope.provide(scope));
        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          assert.deepStrictEqual(yield* registry.getProviders, [initialProvider]);
          assert.strictEqual(yield* Ref.get(refreshCalls), 0);
        }).pipe(Effect.provide(runtimeServices));
      }),
    );
    it.effect("deduplicates cwd probes and clears snapshots when an instance rebuilds", () =>
      Effect.gen(function* () {
        const driver = ProviderDriverKind.make("codex");
        const instanceId = ProviderInstanceId.make("codex");
        const machineProvider = {
          instanceId,
          driver,
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-06-10T00:00:00.000Z",
          version: "1.0.0",
          models: [],
          slashCommands: [{ name: "global" }],
          skills: [{ name: "global", path: "/global/SKILL.md", enabled: true }],
        } as const satisfies ServerProvider;
        const scopedProvider = {
          ...machineProvider,
          checkedAt: "2026-06-10T00:01:00.000Z",
          slashCommands: [{ name: "project" }],
          skills: [{ name: "project", path: "/workspace/SKILL.md", enabled: true }],
        } as const satisfies ServerProvider;
        const pendingScopedProvider = {
          ...scopedProvider,
          status: "error",
          installed: false,
          slashCommands: [],
        } as const satisfies ServerProvider;
        const snapshotCalls = yield* Ref.make(0);
        const scopedResult = yield* Ref.make<ProviderWorkspaceSnapshot>({
          ...scopedProvider,
          status: "error",
          slashCommands: [COMPACT_SLASH_COMMAND],
          slashCommandsPending: true,
        });
        const cacheInvalidations = yield* Ref.make(0);
        const scanGate = yield* Ref.make<{
          readonly started: Deferred.Deferred<void>;
          readonly release: Deferred.Deferred<void>;
        } | null>(null);
        const returnPendingSnapshot = yield* Ref.make(true);
        const probeStarted = yield* Deferred.make<void>();
        const releaseProbe = yield* Deferred.make<void>();
        const makeInstance = (
          provider: ServerProvider,
          snapshotForCwd: NonNullable<ProviderInstance["snapshotForCwd"]>,
        ): ProviderInstance => ({
          instanceId,
          driverKind: driver,
          continuationIdentity: {
            driverKind: driver,
            continuationKey: "codex:instance:codex",
          },
          displayName: undefined,
          enabled: true,
          snapshot: {
            resolveMaintenance: () =>
              Effect.succeed(
                makeManualOnlyProviderMaintenanceCapabilities({
                  provider: driver,
                  packageName: null,
                }),
              ),
            getSnapshot: Effect.succeed(provider),
            refresh: Effect.succeed(provider),
            streamChanges: Stream.empty,
            applyUsageLimits: () => Effect.void,
          },
          snapshotForCwd,
          invalidateCaches: Ref.update(cacheInvalidations, (count) => count + 1),
          orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
          textGeneration: {} as ProviderInstance["textGeneration"],
        });
        const firstInstance = makeInstance(machineProvider, () =>
          Effect.gen(function* () {
            yield* Ref.update(snapshotCalls, (count) => count + 1);
            if (yield* Ref.get(returnPendingSnapshot)) return pendingScopedProvider;
            yield* Deferred.succeed(probeStarted, undefined);
            yield* Deferred.await(releaseProbe);
            const result = yield* Ref.get(scopedResult);
            const gate = yield* Ref.getAndSet(scanGate, null);
            if (gate) {
              yield* Deferred.succeed(gate.started, undefined);
              yield* Deferred.await(gate.release);
            }
            return result;
          }),
        );
        const rebuiltProvider = {
          ...machineProvider,
          checkedAt: "2026-06-10T00:02:00.000Z",
          status: "warning",
          installed: false,
          auth: { status: "unknown" },
        } satisfies ServerProvider;
        const rebuiltInstance = makeInstance(rebuiltProvider, () =>
          Ref.update(snapshotCalls, (count) => count + 1).pipe(Effect.as(scopedProvider)),
        );
        const registryChanges = yield* PubSub.unbounded<void>();
        const instancesRef = yield* Ref.make<ReadonlyArray<ProviderInstance>>([firstInstance]);
        const layerInstanceRegistry = Layer.succeed(
          ProviderInstanceRegistry.ProviderInstanceRegistry,
          {
            getInstance: (requestedId) =>
              Ref.get(instancesRef).pipe(
                Effect.map((instances) =>
                  instances.find((instance) => instance.instanceId === requestedId),
                ),
              ),
            listInstances: Ref.get(instancesRef),
            listUnavailable: Effect.succeed([]),
            streamChanges: Stream.fromPubSub(registryChanges),
            subscribeChanges: PubSub.subscribe(registryChanges),
          },
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const runtimeServices = yield* Layer.build(
          ProviderRegistry.layer.pipe(
            Layer.provideMerge(layerInstanceRegistry),
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), {
                prefix: "t3-provider-registry-workspace-snapshot-",
              }),
            ),
            Layer.provideMerge(NodeServices.layer),
          ),
        ).pipe(Scope.provide(scope));

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          yield* registry.refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace" });
          assert.strictEqual((yield* registry.getProviders)[0]?.workspaceSnapshots, undefined);
          yield* Ref.set(returnPendingSnapshot, false);
          const workspaceUpdate = yield* registry.streamChanges.pipe(
            Stream.runHead,
            Effect.forkChild,
          );
          yield* Effect.yieldNow;
          const firstRefresh = yield* registry
            .refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace" })
            .pipe(Effect.forkChild);
          yield* Deferred.await(probeStarted);
          const duplicateRefresh = yield* registry
            .refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace" })
            .pipe(Effect.forkChild);
          yield* Effect.yieldNow;
          assert.strictEqual(yield* Ref.get(snapshotCalls), 2);
          yield* Deferred.succeed(releaseProbe, undefined);
          yield* Fiber.join(firstRefresh);
          yield* Fiber.join(duplicateRefresh);
          const published = yield* Fiber.join(workspaceUpdate);
          assert.strictEqual(published._tag, "Some");
          const providers = yield* registry.getProviders;
          assert.deepStrictEqual(providers[0]?.skills, machineProvider.skills);
          assert.deepStrictEqual(
            providers[0]?.workspaceSnapshots?.[0]?.skills,
            scopedProvider.skills,
          );
          assert.deepStrictEqual(providers[0]?.workspaceSnapshots?.[0]?.slashCommands, [
            COMPACT_SLASH_COMMAND,
          ]);
          assert.strictEqual(providers[0]?.workspaceSnapshots?.[0]?.slashCommandsPending, true);
          yield* Ref.set(scopedResult, {
            ...scopedProvider,
            status: "error",
            slashCommandsPending: false,
          });
          yield* registry.refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace" });
          assert.strictEqual(yield* Ref.get(snapshotCalls), 3);
          assert.deepStrictEqual(
            (yield* registry.getProviders)[0]?.workspaceSnapshots?.[0]?.slashCommands,
            scopedProvider.slashCommands,
          );
          assert.strictEqual(
            (yield* registry.getProviders)[0]?.workspaceSnapshots?.[0]?.slashCommandsPending,
            undefined,
          );
          yield* registry.refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace" });
          assert.strictEqual(yield* Ref.get(snapshotCalls), 3);
          const newSkills = [
            ...scopedProvider.skills,
            { name: "added", path: "/workspace/added/SKILL.md", enabled: true },
          ];
          yield* Ref.set(scopedResult, { ...scopedProvider, skills: newSkills });
          yield* registry.refreshWorkspaceSnapshot({
            instanceId,
            cwd: "/workspace",
            fresh: true,
          });
          assert.strictEqual(yield* Ref.get(snapshotCalls), 4);
          assert.strictEqual(yield* Ref.get(cacheInvalidations), 1);
          assert.deepStrictEqual(
            (yield* registry.getProviders)[0]?.workspaceSnapshots?.map((s) => s.skills),
            [newSkills],
          );

          // A slow fresh scan that read older files must not overwrite a
          // newer scan that finished first.
          const slowStarted = yield* Deferred.make<void>();
          const releaseSlow = yield* Deferred.make<void>();
          yield* Ref.set(scanGate, { started: slowStarted, release: releaseSlow });
          yield* Ref.set(scopedResult, scopedProvider);
          const slowScan = yield* registry
            .refreshWorkspaceSnapshot({ instanceId, cwd: "/workspace", fresh: true })
            .pipe(Effect.forkChild);
          yield* Deferred.await(slowStarted);
          const latestSkills = [
            ...newSkills,
            { name: "latest", path: "/workspace/latest/SKILL.md", enabled: true },
          ];
          yield* Ref.set(scopedResult, { ...scopedProvider, skills: latestSkills });
          yield* registry.refreshWorkspaceSnapshot({
            instanceId,
            cwd: "/workspace",
            fresh: true,
          });
          yield* Deferred.succeed(releaseSlow, undefined);
          yield* Fiber.join(slowScan);
          assert.deepStrictEqual(
            (yield* registry.getProviders)[0]?.workspaceSnapshots?.map((s) => s.skills),
            [latestSkills],
          );

          yield* Ref.set(instancesRef, [rebuiltInstance]);
          yield* PubSub.publish(registryChanges, undefined);
          let rebuilt = yield* registry.getProviders;
          for (
            let attempt = 0;
            attempt < 50 && rebuilt[0]?.checkedAt !== rebuiltProvider.checkedAt;
            attempt += 1
          ) {
            yield* Effect.yieldNow;
            rebuilt = yield* registry.getProviders;
          }
          assert.strictEqual(rebuilt[0]?.checkedAt, rebuiltProvider.checkedAt);
          assert.strictEqual(rebuilt[0]?.workspaceSnapshots, undefined);
        }).pipe(Effect.provide(runtimeServices));
      }),
    );
    it("persists merged provider snapshots for the providers that were refreshed", () => {
      const previousProviders = [
        {
          instanceId: ProviderInstanceId.make("cursor"),
          driver: ProviderDriverKind.make("cursor"),
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-04-14T00:00:00.000Z",
          version: "2026.04.09-f2b0fcd",
          models: [
            {
              slug: "claude-opus-4-6",
              name: "Opus 4.6",
              isCustom: false,
              capabilities: createModelCapabilities({
                optionDescriptors: [
                  selectDescriptor("reasoning", "Reasoning", [
                    { id: "high", label: "High", isDefault: true },
                  ]),
                  booleanDescriptor("fastMode", "Fast Mode"),
                  booleanDescriptor("thinking", "Thinking"),
                ],
              }),
            },
          ],
          slashCommands: [],
          skills: [],
        },
        {
          instanceId: ProviderInstanceId.make("codex"),
          driver: ProviderDriverKind.make("codex"),
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-04-14T00:00:00.000Z",
          version: "1.0.0",
          models: [],
          slashCommands: [],
          skills: [],
        },
      ] as const satisfies ReadonlyArray<ServerProvider>;
      const refreshedCursor = {
        ...previousProviders[0],
        checkedAt: "2026-04-14T00:01:00.000Z",
        models: [],
      } satisfies ServerProvider;

      const mergedProviders = ProviderRegistry.mergeProviderSnapshots(previousProviders, [
        refreshedCursor,
      ]);
      const persistedProviders = ProviderRegistry.selectProvidersByKind(
        mergedProviders,
        new Set([ProviderDriverKind.make("cursor")]),
      );

      assert.deepStrictEqual(persistedProviders, [
        {
          ...refreshedCursor,
          models: [...previousProviders[0].models],
        },
      ]);
    });
    it.effect("persists the merged snapshot when a live update has empty models", () =>
      Effect.gen(function* () {
        const cursorDriver = ProviderDriverKind.make("cursor");
        const cursorInstanceId = ProviderInstanceId.make("cursor");
        const initialProvider = {
          instanceId: cursorInstanceId,
          driver: cursorDriver,
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-04-14T00:00:00.000Z",
          version: "2026.04.09-f2b0fcd",
          models: [
            {
              slug: "claude-opus-4-6",
              name: "Opus 4.6",
              isCustom: false,
              capabilities: createModelCapabilities({
                optionDescriptors: [
                  selectDescriptor("reasoning", "Reasoning", [
                    { id: "high", label: "High", isDefault: true },
                  ]),
                ],
              }),
            },
          ],
          slashCommands: [],
          skills: [],
        } as const satisfies ServerProvider;
        const refreshedProvider = {
          ...initialProvider,
          checkedAt: "2026-04-14T00:01:00.000Z",
          models: [],
        } satisfies ServerProvider;
        const changes = yield* PubSub.unbounded<ServerProvider>();
        const instance = {
          instanceId: cursorInstanceId,
          driverKind: cursorDriver,
          continuationIdentity: {
            driverKind: cursorDriver,
            continuationKey: "cursor:instance:cursor",
          },
          displayName: undefined,
          enabled: true,
          snapshot: {
            resolveMaintenance: () =>
              Effect.succeed(
                makeManualOnlyProviderMaintenanceCapabilities({
                  provider: cursorDriver,
                  packageName: null,
                }),
              ),
            getSnapshot: Effect.succeed(initialProvider),
            refresh: Effect.succeed(refreshedProvider),
            streamChanges: Stream.fromPubSub(changes),
            applyUsageLimits: () => Effect.void,
          },
          orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
          textGeneration: {} as ProviderInstance["textGeneration"],
        } satisfies ProviderInstance;
        const layerInstanceRegistry = Layer.succeed(
          ProviderInstanceRegistry.ProviderInstanceRegistry,
          {
            getInstance: (instanceId) =>
              Effect.succeed(instanceId === cursorInstanceId ? instance : undefined),
            listInstances: Effect.succeed([instance]),
            listUnavailable: Effect.succeed([]),
            streamChanges: Stream.empty,
            subscribeChanges: Effect.flatMap(PubSub.unbounded<void>(), (pubsub) =>
              PubSub.subscribe(pubsub),
            ),
          },
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const runtimeServices = yield* Layer.build(
          ProviderRegistry.layer.pipe(
            Layer.provideMerge(layerInstanceRegistry),
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), {
                prefix: "t3-provider-registry-merged-persist-",
              }),
            ),
            Layer.provideMerge(layerBackgroundPolicyAlwaysRun),
            Layer.provideMerge(NodeServices.layer),
          ),
        ).pipe(Scope.provide(scope));

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          const config = yield* ServerConfig.ServerConfig;
          const filePath = yield* resolveProviderStatusCachePath({
            cacheDir: config.providerStatusCacheDir,
            instanceId: cursorInstanceId,
          });

          assert.deepStrictEqual((yield* registry.getProviders)[0]?.models, [
            ...initialProvider.models,
          ]);
          const persisted = yield* awaitPersistedProvider(registry, refreshedProvider.checkedAt);
          yield* PubSub.publish(changes, refreshedProvider);
          yield* Fiber.join(persisted);
          const cachedProvider = yield* readProviderStatusCache(filePath);

          assert.deepStrictEqual(
            cachedProvider,
            withBundledCompatibility({
              ...refreshedProvider,
              models: [...initialProvider.models],
            }),
          );
        }).pipe(Effect.provide(runtimeServices));
      }),
    );
    it.effect("returns the cached provider list when a manual refresh fails", () =>
      Effect.gen(function* () {
        const codexDriver = ProviderDriverKind.make("codex");
        const codexInstanceId = ProviderInstanceId.make("codex");
        const cachedProvider = {
          instanceId: codexInstanceId,
          driver: codexDriver,
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-04-29T10:00:00.000Z",
          version: "1.0.0",
          models: [],
          slashCommands: [],
          skills: [],
        } as const satisfies ServerProvider;
        const instance = {
          instanceId: codexInstanceId,
          driverKind: codexDriver,
          continuationIdentity: {
            driverKind: codexDriver,
            continuationKey: "codex:instance:codex",
          },
          displayName: undefined,
          enabled: true,
          snapshot: {
            resolveMaintenance: () =>
              Effect.succeed(
                makeManualOnlyProviderMaintenanceCapabilities({
                  provider: codexDriver,
                  packageName: null,
                }),
              ),
            getSnapshot: Effect.succeed(cachedProvider),
            refresh: Effect.die(new Error("simulated refresh failure")),
            streamChanges: Stream.empty,
            applyUsageLimits: () => Effect.void,
          },
          orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
          textGeneration: {} as ProviderInstance["textGeneration"],
        } satisfies ProviderInstance;
        const layerInstanceRegistry = Layer.succeed(
          ProviderInstanceRegistry.ProviderInstanceRegistry,
          {
            getInstance: (instanceId) =>
              Effect.succeed(instanceId === codexInstanceId ? instance : undefined),
            listInstances: Effect.succeed([instance]),
            listUnavailable: Effect.succeed([]),
            streamChanges: Stream.empty,
            subscribeChanges: Effect.flatMap(PubSub.unbounded<void>(), (pubsub) =>
              PubSub.subscribe(pubsub),
            ),
          },
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const runtimeServices = yield* Layer.build(
          ProviderRegistry.layer.pipe(
            Layer.provideMerge(layerInstanceRegistry),
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), {
                prefix: "t3-provider-registry-refresh-failure-",
              }),
            ),
            Layer.provideMerge(layerBackgroundPolicyAlwaysRun),
            Layer.provideMerge(NodeServices.layer),
          ),
        ).pipe(Scope.provide(scope));

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;

          assert.deepStrictEqual(yield* registry.getProviders, [
            withBundledCompatibility(cachedProvider),
          ]);
          assert.deepStrictEqual(yield* registry.refresh(codexDriver), [
            withBundledCompatibility(cachedProvider),
          ]);
          assert.deepStrictEqual(yield* registry.refreshInstance(codexInstanceId), [
            withBundledCompatibility(cachedProvider),
          ]);
        }).pipe(Effect.provide(runtimeServices));
      }),
    );
    it.effect("keeps consuming registry changes after one sync fails", () =>
      Effect.gen(function* () {
        const codexDriver = ProviderDriverKind.make("codex");
        const codexInstanceId = ProviderInstanceId.make("codex");
        const claudeDriver = ProviderDriverKind.make("claudeAgent");
        const claudeInstanceId = ProviderInstanceId.make("claudeAgent");
        const codexProvider = {
          instanceId: codexInstanceId,
          driver: codexDriver,
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-04-29T10:00:00.000Z",
          version: "1.0.0",
          models: [],
          slashCommands: [],
          skills: [],
        } as const satisfies ServerProvider;
        const claudeProvider = {
          instanceId: claudeInstanceId,
          driver: claudeDriver,
          status: "ready",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          checkedAt: "2026-04-29T10:01:00.000Z",
          version: "1.0.0",
          models: [],
          slashCommands: [],
          skills: [],
        } as const satisfies ServerProvider;
        const makeInstance = (provider: ServerProvider): ProviderInstance => ({
          instanceId: provider.instanceId,
          driverKind: provider.driver,
          continuationIdentity: {
            driverKind: provider.driver,
            continuationKey: `${provider.driver}:instance:${provider.instanceId}`,
          },
          displayName: undefined,
          enabled: true,
          snapshot: {
            resolveMaintenance: () =>
              Effect.succeed(
                makeManualOnlyProviderMaintenanceCapabilities({
                  provider: provider.driver,
                  packageName: null,
                }),
              ),
            getSnapshot: Effect.succeed(provider),
            refresh: Effect.succeed(provider),
            streamChanges: Stream.empty,
            applyUsageLimits: () => Effect.void,
          },
          orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
          textGeneration: {} as ProviderInstance["textGeneration"],
        });
        const codexInstance = makeInstance(codexProvider);
        const claudeInstance = makeInstance(claudeProvider);
        const changes = yield* PubSub.unbounded<void>();
        const instancesRef = yield* Ref.make<ReadonlyArray<ProviderInstance>>([codexInstance]);
        const failNextList = yield* Ref.make(false);
        const wait = () => Effect.yieldNow;
        const layerInstanceRegistry = Layer.succeed(
          ProviderInstanceRegistry.ProviderInstanceRegistry,
          {
            getInstance: (instanceId) =>
              Ref.get(instancesRef).pipe(
                Effect.map((instances) =>
                  instances.find((instance) => instance.instanceId === instanceId),
                ),
              ),
            listInstances: Effect.gen(function* () {
              const shouldFail = yield* Ref.get(failNextList);
              if (shouldFail) {
                yield* Ref.set(failNextList, false);
                return yield* Effect.die(new Error("simulated registry list failure"));
              }
              return yield* Ref.get(instancesRef);
            }),
            listUnavailable: Effect.succeed([]),
            streamChanges: Stream.fromPubSub(changes),
            subscribeChanges: PubSub.subscribe(changes),
          },
        );
        const scope = yield* Scope.make();
        yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
        const runtimeServices = yield* Layer.build(
          ProviderRegistry.layer.pipe(
            Layer.provideMerge(layerInstanceRegistry),
            Layer.provideMerge(
              ServerConfig.layerTest(process.cwd(), {
                prefix: "t3-provider-registry-sync-failure-",
              }),
            ),
            Layer.provideMerge(layerBackgroundPolicyAlwaysRun),
            Layer.provideMerge(NodeServices.layer),
          ),
        ).pipe(Scope.provide(scope));

        yield* Effect.gen(function* () {
          const registry = yield* ProviderRegistry.ProviderRegistry;
          assert.deepStrictEqual(yield* registry.getProviders, [
            withBundledCompatibility(codexProvider),
          ]);

          yield* Ref.set(failNextList, true);
          yield* PubSub.publish(changes, undefined);

          yield* Ref.set(instancesRef, [codexInstance, claudeInstance]);
          yield* PubSub.publish(changes, undefined);

          let providers = yield* registry.getProviders;
          for (
            let attempt = 0;
            attempt < 50 && !providers.some((provider) => provider.instanceId === claudeInstanceId);
            attempt += 1
          ) {
            yield* wait();
            providers = yield* registry.getProviders;
          }

          assert.deepStrictEqual(
            providers.map((provider) => provider.instanceId).toSorted(),
            [codexInstanceId, claudeInstanceId].toSorted(),
          );
        }).pipe(Effect.provide(runtimeServices));
      }),
    );
  },
);
