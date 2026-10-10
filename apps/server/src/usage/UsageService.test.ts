// @effect-diagnostics nodeBuiltinImport:off - the suite seeds and grows real
// transcript trees on disk, outside the service's Effect FileSystem.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { HostProcessEnvironment, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { mergeUsage } from "@t3tools/shared/usageMerge";
import { EnvironmentId, UsageDay, type UsageSummaryInput } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Scheduler from "effect/Scheduler";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as UsageService from "./UsageService.ts";
const encodeUnknownJsonString = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

function piLine(id: number, outputTokens: number, model = "claude-fable-5"): string {
  return `${JSON.stringify({ type: "session", id: "session-1" })}\n${JSON.stringify({
    type: "message",
    id: `pi_${id}`,
    timestamp: "2026-08-01T10:00:00Z",
    requestId: `req_${id}`,
    sessionId: "session-1",
    message: {
      role: "assistant",
      provider: "anthropic",
      model,
      usage: { input: 10, output: outputTokens, cacheRead: 0, cacheWrite: 0 },
    },
  })}\n`;
}

const WINDOW: UsageSummaryInput = {
  timeZone: "UTC",
  sinceDay: UsageDay.make("2026-07-31"),
  untilDay: UsageDay.make("2026-08-02"),
};

const setup = Effect.gen(function* () {
  const home = yield* Effect.promise(() =>
    NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "usage-service-test-")),
  );
  yield* Effect.addFinalizer(() =>
    Effect.promise(() => NodeFSP.rm(home, { recursive: true, force: true })),
  );
  const transcriptDir = NodePath.join(home, "pi", "sessions", "proj");
  yield* Effect.promise(() => NodeFSP.mkdir(transcriptDir, { recursive: true }));
  return {
    home,
    transcript: NodePath.join(transcriptDir, "session.jsonl"),
    settings: {
      providers: { pi: {} },
    },
  };
});

const layerService = (input: {
  readonly prefix: string;
  readonly home: string;
  readonly settings: Parameters<typeof ServerSettings.layerTest>[0];
  readonly onRatesFetch?: () => void;
  /** Defaults to an unparsable document so every scan retries the fetch. */
  readonly ratesDocument?: unknown;
  readonly environment?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}) =>
  ServerConfig.layerTest(process.cwd(), { prefix: input.prefix }).pipe(
    Layer.provideMerge(NodeServices.layer),
    Layer.provideMerge(Layer.succeed(HostProcessPlatform, input.platform ?? "linux")),
    Layer.provideMerge(ServerSettings.layerTest(input.settings)),
    Layer.provideMerge(
      Layer.succeed(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.sync(() => {
            input.onRatesFetch?.();
            // Unparsable rates: every scan retries the fetch, which makes the
            // fetch count a boundary-level observation of how many scans ran.
            return HttpClientResponse.fromWeb(request, Response.json(input.ratesDocument ?? {}));
          }),
        ),
      ),
    ),
    Layer.provideMerge(
      Layer.succeed(HostProcessEnvironment, {
        HOME: input.home,
        PI_CODING_AGENT_DIR: NodePath.join(input.home, "pi"),
        GROK_HOME: NodePath.join(input.home, "grok"),
        OPENCODE_DATA_DIR: NodePath.join(input.home, "opencode"),
        ANTIGRAVITY_DATA_DIR: NodePath.join(input.home, "antigravity"),
        XDG_CONFIG_HOME: NodePath.join(input.home, "config"),
        APPDATA: NodePath.join(input.home, "config"),
        ...input.environment,
      }),
    ),
  );

/** Outside `NARROW_WINDOW`, inside `WINDOW`. Seconds, as `utimes` takes them. */
const BEFORE_NARROW_WINDOW = Date.parse("2026-08-01T10:00:00Z") / 1000;
const NARROW_WINDOW: UsageSummaryInput = {
  timeZone: "UTC",
  sinceDay: UsageDay.make("2026-09-01"),
  untilDay: UsageDay.make("2026-09-02"),
};

/**
 * A FIFO named like a transcript. A scan's read of it waits in `open` until
 * `openGate`, then fails at once, so a gate holds that scan's directory reads
 * in flight. Each waiting gate holds one libuv pool thread; keep at most three.
 */
const makeGate = (path: string, lastWriteSeconds?: number) =>
  Effect.promise(async () => {
    NodeChildProcess.execFileSync("mkfifo", [path]);
    if (lastWriteSeconds !== undefined) {
      await NodeFSP.utimes(path, lastWriteSeconds, lastWriteSeconds);
    }
  });

/**
 * Returns once a scan has opened the gate. A scan opens every file of a
 * directory at once, so it then holds the directory's transcripts open too.
 */
const openGate = (path: string) =>
  Effect.promise(async () => (await NodeFSP.open(path, "w")).close());

/** Replaces a file by rename, so a scan holding the old one keeps reading it. */
const replaceFile = (path: string, content: string) =>
  Effect.promise(async () => {
    await NodeFSP.writeFile(path + ".next", content);
    await NodeFSP.rename(path + ".next", path);
  });

function totalOutputTokens(summary: { buckets: readonly { totals: { outputTokens: number } }[] }) {
  return summary.buckets.reduce((sum, bucket) => sum + bucket.totals.outputTokens, 0);
}

describe("UsageService", () => {
  it.live("reprices unchanged transcripts when custom prices are added, edited, or removed", () =>
    Effect.gen(function* () {
      const { transcript, settings, home } = yield* setup;
      yield* Effect.promise(() => NodeFSP.writeFile(transcript, piLine(1, 5, "example-model")));

      yield* Effect.gen(function* () {
        const settingsService = yield* ServerSettings.ServerSettingsService;
        const service = yield* UsageService.make;

        const original = yield* service.readSummary(WINDOW);
        assert.strictEqual(original.buckets[0]?.costUsd, 0);
        assert.strictEqual(original.buckets[0]?.unpricedRecords, 1);

        yield* settingsService.updateSettings({
          usagePriceOverrides: {
            "example-model": { inputCostPerMillionTokens: 2, outputCostPerMillionTokens: 8 },
          },
        });
        const overridden = yield* service.readSummary(WINDOW);
        assert.closeTo(overridden.buckets[0]?.costUsd ?? -1, 0.00006, 1e-12);
        assert.strictEqual(overridden.buckets[0]?.costSource, "modelPriced");
        assert.strictEqual(overridden.buckets[0]?.unpricedRecords, 0);
        assert.deepStrictEqual(overridden.buckets[0]?.totals, original.buckets[0]?.totals);

        yield* settingsService.updateSettings({
          usagePriceOverrides: {
            "example-model": { inputCostPerMillionTokens: 4, outputCostPerMillionTokens: 16 },
          },
        });
        const edited = yield* service.readSummary(WINDOW);
        assert.closeTo(edited.buckets[0]?.costUsd ?? -1, 0.00012, 1e-12);

        yield* settingsService.updateSettings({ usagePriceOverrides: { "example-model": null } });
        const restored = yield* service.readSummary(WINDOW);
        assert.deepStrictEqual(restored.buckets, original.buckets);
      }).pipe(
        Effect.provide(
          layerService({ prefix: "usage-service-price-overrides-test", home, settings }),
        ),
      );
    }).pipe(Effect.scoped),
  );

  it.live("counts appended usage on a rescan of a grown transcript", () =>
    Effect.gen(function* () {
      const { transcript, settings, home } = yield* setup;
      yield* Effect.promise(() => NodeFSP.writeFile(transcript, piLine(1, 5)));

      const service = yield* UsageService.make.pipe(
        Effect.provide(layerService({ prefix: "usage-service-grow-test", home, settings })),
      );

      const first = yield* service.readSummary(WINDOW);
      assert.strictEqual(totalOutputTokens(first), 5);

      yield* Effect.promise(() => NodeFSP.appendFile(transcript, piLine(2, 7)));
      const second = yield* service.readSummary(WINDOW);
      assert.strictEqual(totalOutputTokens(second), 12);
    }).pipe(Effect.scoped),
  );

  it.live(
    "keeps large-record totals and costs exact through append, dedupe, restart and cleanup",
    () =>
      Effect.gen(function* () {
        const { transcript, settings, home } = yield* setup;
        const large = piLine(1, 9900).replace(
          '"message":',
          '"padding":' + encodeUnknownJsonString("x".repeat(9 * 1024 * 1024)) + ',"message":',
        );
        yield* Effect.promise(() => NodeFSP.writeFile(transcript, large));
        yield* Effect.gen(function* () {
          const service = yield* UsageService.make;
          const first = yield* service.readSummary(WINDOW);
          assert.strictEqual(totalOutputTokens(first), 9900);
          assert.closeTo(
            first.buckets.reduce((sum, bucket) => sum + bucket.costUsd, 0),
            0.4951,
            1e-12,
          );
          const warm = yield* service.readSummary(WINDOW);
          assert.deepStrictEqual(warm.buckets, first.buckets);
          // The repeated content block has the same message/request identity.
          yield* Effect.promise(() => NodeFSP.appendFile(transcript, large + piLine(2, 100)));
          const appended = yield* service.readSummary(WINDOW);
          assert.strictEqual(totalOutputTokens(appended), 10000);
          assert.strictEqual(
            appended.buckets.reduce((sum, bucket) => sum + bucket.totals.uncachedInputTokens, 0),
            20,
          );
          const restarted = yield* UsageService.make;
          const restored = yield* restarted.readSummary(WINDOW);
          assert.deepStrictEqual(restored.buckets, appended.buckets);
          yield* Effect.promise(() => NodeFSP.rm(transcript));
          const afterCleanup = yield* UsageService.make;
          assert.deepStrictEqual(
            (yield* afterCleanup.readSummary(WINDOW)).buckets,
            appended.buckets,
          );
        }).pipe(
          Effect.provide(
            layerService({
              prefix: "usage-service-large-record-test",
              home,
              settings,
              ratesDocument: {
                "claude-fable-5": { input_cost_per_token: 1e-5, output_cost_per_token: 5e-5 },
              },
            }),
          ),
        );
      }).pipe(Effect.scoped),
  );

  it.live("preserves saved tokens, costs and sessions after transcript cleanup and restart", () =>
    Effect.gen(function* () {
      const { transcript, settings, home } = yield* setup;
      const alias = NodePath.join(home, "claude-alias");
      yield* Effect.promise(() => NodeFSP.symlink(NodePath.join(home, "pi"), alias, "junction"));
      const content = piLine(1, 5);
      yield* Effect.promise(() => NodeFSP.writeFile(transcript, content));
      yield* Effect.gen(function* () {
        const service = yield* UsageService.make;
        const first = yield* service.readSummary(WINDOW);
        assert.strictEqual(totalOutputTokens(first), 5);
        assert.isAbove(first.buckets[0]?.costUsd ?? 0, 0);

        yield* Effect.promise(() => NodeFSP.rm(transcript));
        const deleted = yield* service.readSummary(WINDOW);
        assert.deepStrictEqual(deleted.buckets, first.buckets);
        assert.deepStrictEqual(deleted.sources, first.sources);

        const restarted = yield* UsageService.make;
        const restored = yield* restarted.readSummary(WINDOW);
        assert.deepStrictEqual(restored.buckets, first.buckets);
        assert.deepStrictEqual(restored.sources, first.sources);

        // A moved transcript must not count the saved usage twice.
        yield* Effect.promise(() => NodeFSP.writeFile(transcript + ".jsonl", content));
        const moved = yield* restarted.readSummary(WINDOW);
        assert.deepStrictEqual(moved.buckets, first.buckets);
        assert.strictEqual(moved.sources[0]?.distinctSessions, 1);

        const replacementProjects = NodePath.join(home, "replacement-projects");
        yield* Effect.promise(() => NodeFSP.mkdir(replacementProjects));
        yield* Effect.promise(() =>
          NodeFSP.rm(NodePath.join(home, "pi", "sessions"), { recursive: true }),
        );
        const afterRootCleanup = yield* UsageService.make;
        const missingRoot = yield* afterRootCleanup.readSummary(WINDOW);
        assert.deepStrictEqual(missingRoot.buckets, first.buckets);
        assert.strictEqual(missingRoot.sources[0]?.distinctSessions, 1);
        assert.strictEqual(missingRoot.sources[0]?.status, "ok");
        assert.deepStrictEqual(missingRoot.sources[0]?.fingerprint, first.sources[0]?.fingerprint);
        yield* Effect.promise(async () => {
          const projects = NodePath.join(home, "pi", "sessions");
          await NodeFSP.rename(replacementProjects, projects);
          await NodeFSP.writeFile(NodePath.join(projects, "new.jsonl"), piLine(2, 7));
        });
        const recreated = yield* afterRootCleanup.readSummary(WINDOW);
        assert.strictEqual(totalOutputTokens(recreated), 12);
        assert.deepStrictEqual(recreated.sources[0]?.fingerprint, first.sources[0]?.fingerprint);

        const merged = mergeUsage(
          [
            {
              environmentId: EnvironmentId.make("cleanup-test"),
              label: "test",
              summary: recreated,
            },
            {
              environmentId: EnvironmentId.make("other-environment"),
              label: "before cleanup",
              summary: first,
            },
          ],
          missingRoot.contractVersion,
        );
        assert.strictEqual(merged.outputTokens, 12);
        assert.strictEqual(merged.sessions, 1);
        assert.strictEqual(merged.costUsd, recreated.buckets[0]?.costUsd);

        const outsideWindow = yield* restarted.readSummary({
          ...WINDOW,
          sinceDay: UsageDay.make("2026-08-02"),
        });
        assert.deepStrictEqual(outsideWindow.buckets, []);
        assert.strictEqual(outsideWindow.sources[0]?.distinctSessions, 0);
      }).pipe(
        Effect.provide(
          layerService({
            prefix: "usage-service-cleanup-test",
            home,
            settings,
            environment: { PI_CODING_AGENT_DIR: alias },
            ratesDocument: {
              "claude-fable-5": { input_cost_per_token: 1e-5, output_cost_per_token: 5e-5 },
            },
          }),
        ),
      );
    }).pipe(Effect.scoped),
  );

  it.live("credits the same copy of a duplicate after its transcripts are deleted", () =>
    Effect.gen(function* () {
      const { transcript, settings, home } = yield* setup;
      const dir = NodePath.dirname(transcript);
      // The walk-first file is the original, padded so it finishes parsing
      // after the small fork copy that repeats its record under a new session.
      const [first = "", second = ""] = yield* Effect.promise(async () => {
        await NodeFSP.writeFile(NodePath.join(dir, "a.jsonl"), "");
        await NodeFSP.writeFile(NodePath.join(dir, "b.jsonl"), "");
        return (await NodeFSP.readdir(dir)).map((name) => NodePath.join(dir, name));
      });
      const forked = (line: string) => line.replace('"session-1"', '"session-2"');
      yield* Effect.promise(async () => {
        await NodeFSP.writeFile(
          first,
          piLine(1, 5).replace(
            '"message":',
            '"padding":' + encodeUnknownJsonString("x".repeat(9 * 1024 * 1024)) + ',"message":',
          ),
        );
        await NodeFSP.writeFile(second, forked(piLine(1, 5)) + forked(piLine(2, 7)));
      });
      yield* Effect.gen(function* () {
        const service = yield* UsageService.make;
        const live = yield* service.readSummary(WINDOW);
        assert.strictEqual(live.buckets[0]?.sessions, 2);

        yield* Effect.promise(() => Promise.all([NodeFSP.rm(first), NodeFSP.rm(second)]));
        const saved = yield* service.readSummary(WINDOW);
        assert.deepStrictEqual(saved.buckets, live.buckets);
        assert.deepStrictEqual(saved.sources, live.sources);
        const restored = yield* (yield* UsageService.make).readSummary(WINDOW);
        assert.deepStrictEqual(restored.buckets, live.buckets);
      }).pipe(
        Effect.provide(layerService({ prefix: "usage-service-copy-order-test", home, settings })),
      );
    }).pipe(Effect.scoped),
  );

  it.live.skipIf(HostProcessPlatform.defaultValue() === "win32")(
    "keeps a newer cached read when a slower scan of another window finishes later",
    () =>
      Effect.gen(function* () {
        const { transcript, settings, home } = yield* setup;
        const dir = NodePath.dirname(transcript);
        const probe = NodePath.join(dir, "probe.jsonl");
        const hold = NodePath.join(dir, "hold.jsonl");
        yield* Effect.promise(() => NodeFSP.writeFile(transcript, piLine(1, 5)));
        yield* makeGate(probe, BEFORE_NARROW_WINDOW);
        yield* makeGate(hold, BEFORE_NARROW_WINDOW);
        yield* Effect.gen(function* () {
          const service = yield* UsageService.make;
          const wide = yield* service.readSummary(WINDOW).pipe(Effect.forkChild);
          yield* openGate(probe);
          yield* replaceFile(transcript, piLine(1, 5) + piLine(2, 7));
          // The narrow scan caches the newer read while the wide one waits.
          yield* service.readSummary(NARROW_WINDOW);
          yield* openGate(hold);
          yield* Fiber.join(wide);

          yield* Effect.promise(() =>
            Promise.all([transcript, probe, hold].map((path) => NodeFSP.rm(path))),
          );
          assert.strictEqual(totalOutputTokens(yield* service.readSummary(WINDOW)), 12);
        }).pipe(
          Effect.provide(layerService({ prefix: "usage-service-stale-read-test", home, settings })),
        );
      }).pipe(Effect.scoped),
  );

  it.live.skipIf(HostProcessPlatform.defaultValue() === "win32")(
    "keeps the later read when a scan that read earlier finishes first",
    () =>
      Effect.gen(function* () {
        const { transcript, settings, home } = yield* setup;
        const dir = NodePath.dirname(transcript);
        const gate = (name: string) => NodePath.join(dir, `${name}.jsonl`);
        const wideProbe = gate("wide-probe");
        const wideHold = gate("wide-hold");
        const narrowProbe = gate("narrow-probe");
        const narrowHold = gate("narrow-hold");
        yield* Effect.promise(() => NodeFSP.writeFile(transcript, piLine(1, 5)));
        yield* makeGate(wideProbe, BEFORE_NARROW_WINDOW);
        yield* makeGate(wideHold, BEFORE_NARROW_WINDOW);
        yield* Effect.gen(function* () {
          const service = yield* UsageService.make;
          const wide = yield* service.readSummary(WINDOW).pipe(Effect.forkChild);
          yield* openGate(wideProbe);
          yield* replaceFile(transcript, piLine(1, 5) + piLine(2, 7));
          // Made after the wide scan's walk, so only the narrow scan waits on them.
          yield* makeGate(narrowProbe);
          yield* makeGate(narrowHold);
          const narrow = yield* service.readSummary(NARROW_WINDOW).pipe(Effect.forkChild);
          yield* openGate(narrowProbe);
          // Both scans started from an empty cache entry; the earlier read lands first.
          yield* openGate(wideHold);
          yield* Fiber.join(wide);
          yield* openGate(narrowHold);
          yield* Fiber.join(narrow);

          yield* Effect.promise(() =>
            Promise.all(
              [transcript, wideProbe, wideHold, narrowProbe, narrowHold].map((path) =>
                NodeFSP.rm(path),
              ),
            ),
          );
          assert.strictEqual(totalOutputTokens(yield* service.readSummary(WINDOW)), 12);
        }).pipe(
          Effect.provide(layerService({ prefix: "usage-service-late-read-test", home, settings })),
        );
      }).pipe(Effect.scoped),
  );

  it.live("reports saved usage of a removed directory only for windows it reaches", () =>
    Effect.gen(function* () {
      const { transcript, settings, home } = yield* setup;
      yield* Effect.promise(async () => {
        await NodeFSP.writeFile(transcript, piLine(1, 5));
        const lastWrite = Date.parse("2026-08-01T10:00:00Z") / 1000;
        await NodeFSP.utimes(transcript, lastWrite, lastWrite);
      });
      const service = yield* UsageService.make.pipe(
        Effect.provide(layerService({ prefix: "usage-service-saved-window-test", home, settings })),
      );
      const first = yield* service.readSummary(WINDOW);
      yield* Effect.promise(() =>
        NodeFSP.rm(NodePath.join(home, "pi", "sessions"), { recursive: true }),
      );

      const reached = yield* service.readSummary(WINDOW);
      assert.deepStrictEqual(reached.buckets, first.buckets);
      assert.strictEqual(reached.sources[0]?.status, "ok");

      // A missing source cannot claim this directory from another environment
      // that still reads it, so it adds nothing to a window after its last write.
      const later = yield* service.readSummary({
        timeZone: "UTC",
        sinceDay: UsageDay.make("2026-08-10"),
        untilDay: UsageDay.make("2026-08-12"),
      });
      assert.deepStrictEqual(later.buckets, []);
      assert.strictEqual(later.sources[0]?.status, "missing");
      assert.strictEqual(later.sources[0]?.scannedFiles, 0);
    }).pipe(Effect.scoped),
  );

  it.live("does not share an in-flight scan after custom prices change", () =>
    Effect.gen(function* () {
      const { transcript, settings, home } = yield* setup;
      yield* Effect.promise(() => NodeFSP.writeFile(transcript, piLine(1, 5, "example-model")));
      const transcriptDir = yield* Effect.promise(() =>
        NodeFSP.realpath(NodePath.join(home, "pi", "sessions")),
      );

      yield* Effect.gen(function* () {
        const settingsService = yield* ServerSettings.ServerSettingsService;
        const fileSystem = yield* FileSystem.FileSystem;
        const firstScanStarted = yield* Deferred.make<void>();
        const secondScanStarted = yield* Deferred.make<void>();
        const releaseRates = yield* Deferred.make<void>();
        let homeProbes = 0;
        const service = yield* UsageService.make.pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fileSystem,
            exists: (path) =>
              fileSystem.exists(path).pipe(
                Effect.tap(() => {
                  if (path !== transcriptDir) return Effect.void;
                  homeProbes += 1;
                  return Deferred.succeed(
                    homeProbes === 1 ? firstScanStarted : secondScanStarted,
                    undefined,
                  );
                }),
              ),
          }),
          Effect.provideService(
            HttpClient.HttpClient,
            HttpClient.make((request) =>
              Deferred.await(releaseRates).pipe(
                Effect.as(HttpClientResponse.fromWeb(request, Response.json({}))),
              ),
            ),
          ),
        );

        const first = yield* service.readSummary(WINDOW).pipe(Effect.forkChild);
        yield* Deferred.await(firstScanStarted);
        yield* settingsService.updateSettings({
          usagePriceOverrides: {
            "example-model": { inputCostPerMillionTokens: 2, outputCostPerMillionTokens: 8 },
          },
        });
        const second = yield* service.readSummary(WINDOW).pipe(Effect.forkChild);
        yield* Deferred.await(secondScanStarted);
        yield* Deferred.succeed(releaseRates, undefined);

        const original = yield* Fiber.join(first);
        const updated = yield* Fiber.join(second);
        assert.strictEqual(original.buckets[0]?.costUsd, 0);
        assert.closeTo(updated.buckets[0]?.costUsd ?? -1, 0.00006, 1e-12);
      }).pipe(
        Effect.provide(layerService({ prefix: "usage-service-price-race-test", home, settings })),
      );
    }).pipe(Effect.scoped),
  );

  it.live("shares one scan between concurrent identical requests", () =>
    Effect.gen(function* () {
      const { transcript, settings, home } = yield* setup;
      yield* Effect.promise(() => NodeFSP.writeFile(transcript, piLine(1, 5)));

      let ratesFetches = 0;
      const service = yield* UsageService.make.pipe(
        Effect.provide(
          layerService({
            prefix: "usage-service-flight-test",
            home,
            settings,
            onRatesFetch: () => {
              ratesFetches += 1;
            },
          }),
        ),
      );

      const [first, second] = yield* Effect.all(
        [service.readSummary(WINDOW), service.readSummary(WINDOW)],
        { concurrency: 2 },
      );
      assert.deepStrictEqual(first, second);
      assert.strictEqual(ratesFetches, 1);

      // A later request is fresh work again, not a stale cached answer.
      yield* service.readSummary(WINDOW);
      assert.strictEqual(ratesFetches, 2);
    }).pipe(Effect.scoped),
  );

  it.live("refetches a rate table inside its TTL only when the client asks", () =>
    Effect.gen(function* () {
      const { transcript, settings, home } = yield* setup;
      yield* Effect.promise(() => NodeFSP.writeFile(transcript, piLine(1, 5)));

      let ratesFetches = 0;
      const service = yield* UsageService.make.pipe(
        Effect.provide(
          layerService({
            prefix: "usage-service-rates-refresh-test",
            home,
            settings,
            ratesDocument: {
              "claude-fable-5": { input_cost_per_token: 1e-5, output_cost_per_token: 5e-5 },
            },
            onRatesFetch: () => {
              ratesFetches += 1;
            },
          }),
        ),
      );

      const first = yield* service.readSummary(WINDOW);
      assert.strictEqual(ratesFetches, 1);
      assert.strictEqual(first.pricing.status, "fresh");

      // Inside the daily TTL a plain rescan keeps the cached table.
      yield* TestClock.adjust(Duration.minutes(2));
      yield* service.readSummary(WINDOW);
      assert.strictEqual(ratesFetches, 1);

      // An explicit refresh fetches again so a newly listed model gets priced.
      // A burst of refreshes shares that one fetch.
      const [refreshed] = yield* Effect.all([service.refreshRates, service.refreshRates], {
        concurrency: 2,
      });
      assert.strictEqual(ratesFetches, 2);
      assert.strictEqual(refreshed.status, "fresh");
      assert.strictEqual(refreshed.knownModels, 1);
    }).pipe(Effect.scoped, Effect.provide(TestClock.layer())),
  );

  it.live("does not orphan an in-flight scan when its first caller is interrupted", () =>
    Effect.gen(function* () {
      const { settings, home } = yield* setup;
      const service = yield* UsageService.make.pipe(
        Effect.provide(layerService({ prefix: "usage-service-interruption-test", home, settings })),
      );

      let orphanedAt: number | undefined;
      for (let interruptAt = 1; interruptAt <= 31; interruptAt += 1) {
        const tasks: Array<() => void> = [];
        const dispatcher: Scheduler.SchedulerDispatcher = {
          scheduleTask: (task) => tasks.push(task),
          flush: () => {
            let task: (() => void) | undefined;
            while ((task = tasks.shift()) !== undefined) task();
          },
        };

        let requestFiber: Fiber.Fiber<unknown, unknown> | undefined;
        let requestChecks = 0;
        const scheduler: Scheduler.Scheduler = {
          executionMode: "async",
          makeDispatcher: () => dispatcher,
          shouldYield: (fiber) => {
            if (fiber !== requestFiber) return false;
            requestChecks += 1;
            if (requestChecks !== interruptAt) return false;
            fiber.interruptUnsafe();
            return true;
          },
        };

        // Each candidate needs a distinct key because the broken case leaves
        // its entry in the service's private in-flight map. The invalid window
        // keeps the real scan synchronous once its detached fiber starts.
        const input: UsageSummaryInput = {
          ...WINDOW,
          sinceDay: UsageDay.make("2026-09-01"),
          untilDay: UsageDay.make(`2026-08-${String(interruptAt).padStart(2, "0")}`),
        };
        const first = yield* service
          .readSummary(input)
          .pipe(
            Effect.exit,
            Effect.provideService(Scheduler.Scheduler, scheduler),
            Effect.forkChild,
          );
        requestFiber = first;
        yield* Effect.yieldNow;
        dispatcher.flush();

        const second = yield* service.readSummary(input).pipe(
          Effect.match({
            onFailure: (error) => error.reason,
            onSuccess: () => "success" as const,
          }),
          Effect.provideService(Scheduler.Scheduler, scheduler),
          Effect.forkChild,
        );
        yield* Effect.yieldNow;
        dispatcher.flush();
        const secondExit = second.pollUnsafe();
        if (secondExit === undefined) {
          second.interruptUnsafe();
          orphanedAt = interruptAt;
          break;
        }
        if (Exit.isFailure(secondExit)) {
          assert.fail("the matching request fiber was interrupted");
        }
        assert.strictEqual(secondExit.value, "invalidWindow");
      }

      assert.isUndefined(
        orphanedAt,
        `interruption left the next matching request pending at scheduler check ${orphanedAt}`,
      );
    }).pipe(Effect.scoped),
  );
});
