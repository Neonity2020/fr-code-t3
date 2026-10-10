import { expect, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  PiSettings,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { deriveProviderInstanceConfigMap } from "./ProviderInstanceRegistryHydration.ts";
import { makeProviderInstanceRegistry } from "./ProviderInstanceRegistry.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "./ProviderDriver.ts";
import { makeManualOnlyProviderMaintenanceCapabilities } from "./providerMaintenance.ts";

const pi = ProviderDriverKind.make("pi");
const decodePiSettings = Schema.decodeSync(PiSettings);
const fixtureDriver = (released: string[]): ProviderDriver<PiSettings> => ({
  driverKind: pi,
  metadata: { displayName: "Pi" },
  configSchema: PiSettings,
  defaultConfig: () => decodePiSettings({}),
  create: (input) =>
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          released.push(input.instanceId);
        }),
      );
      const snapshot = {
        instanceId: input.instanceId,
        driver: pi,
        enabled: input.enabled,
        installed: false,
        version: null,
        status: "disabled" as const,
        auth: { status: "unknown" as const },
        checkedAt: "2026-08-01T00:00:00.000Z",
        models: [],
        slashCommands: [],
        skills: [],
      };
      return {
        instanceId: input.instanceId,
        driverKind: pi,
        continuationIdentity: defaultProviderContinuationIdentity({
          instanceId: input.instanceId,
          driverKind: pi,
        }),
        displayName: input.displayName,
        enabled: input.enabled,
        snapshot: {
          getSnapshot: Effect.succeed(snapshot),
          refresh: Effect.succeed(snapshot),
          streamChanges: Stream.empty,
          applyUsageLimits: () => Effect.void,
          resolveMaintenance: () =>
            Effect.succeed(
              makeManualOnlyProviderMaintenanceCapabilities({ provider: pi, packageName: null }),
            ),
        },
        // Registry tests never execute a turn or generation; those are covered by Pi integration tests.
        orchestrationAdapter: {} as ProviderInstance["orchestrationAdapter"],
        textGeneration: {} as ProviderInstance["textGeneration"],
      };
    }),
});
it.effect("routes multiple Pi instances and tears down only the changed instance", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const released: string[] = [];
      const config = {
        pi_work: { driver: pi, config: { enabled: false } },
        pi_personal: { driver: pi, config: {} },
      };
      const { registry, mutator } = yield* makeProviderInstanceRegistry({
        drivers: [fixtureDriver(released)],
        configMap: config,
      });
      const before = yield* registry.getInstance(ProviderInstanceId.make("pi_personal"));
      expect((yield* registry.listInstances).map((instance) => instance.instanceId)).toEqual([
        "pi_work",
        "pi_personal",
      ]);
      expect((yield* registry.getInstance(ProviderInstanceId.make("pi_work")))?.enabled).toBe(
        false,
      );
      yield* mutator.reconcile({ [ProviderInstanceId.make("pi_personal")]: config.pi_personal });
      expect(released).toEqual(["pi_work"]);
      expect(yield* registry.getInstance(ProviderInstanceId.make("pi_personal"))).toBe(before);
    }),
  ),
);
it.effect(
  "keeps removed drivers and invalid Pi configs unavailable without running factories",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { registry } = yield* makeProviderInstanceRegistry({
          drivers: [fixtureDriver([])],
          configMap: {
            [ProviderInstanceId.make("old")]: {
              driver: ProviderDriverKind.make("codex"),
              config: {},
            },
            [ProviderInstanceId.make("invalid")]: { driver: pi, config: { binaryPath: 42 } },
          },
        });
        expect(yield* registry.listInstances).toEqual([]);
        expect((yield* registry.listUnavailable).map((snapshot) => snapshot.instanceId)).toEqual([
          "old",
          "invalid",
        ]);
      }),
    ),
);

it.effect("does not route a retired default-slot instance to Pi", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { registry } = yield* makeProviderInstanceRegistry({
        drivers: [fixtureDriver([])],
        configMap: deriveProviderInstanceConfigMap({
          ...DEFAULT_SERVER_SETTINGS,
          providerInstances: {
            [ProviderInstanceId.make("pi")]: {
              driver: ProviderDriverKind.make("retired-driver"),
              config: {},
            },
          },
        }),
      });
      expect(yield* registry.listInstances).toEqual([]);
    }),
  ),
);
