import { describe, expect, it } from "vite-plus/test";

import {
  formatDuration,
  deriveActiveWorkStartedAt,
  deriveSubagentElapsedMs,
} from "./orchestrationTiming.ts";

describe("formatDuration", () => {
  it.each([
    [0, "1 毫秒"],
    [250, "250 毫秒"],
    [1_500, "1.5 秒"],
    [9_950, "10 秒"],
    [22_000, "22 秒"],
    [60_000, "1 分钟"],
    [65_000, "1 分钟 5 秒"],
    [119_500, "2 分钟"],
    [3_599_499, "59 分钟 59 秒"],
    [3_599_500, "1 小时"],
    [3_600_000, "1 小时"],
    [3_601_000, "1 小时 1 秒"],
    [3_660_000, "1 小时 1 分钟"],
    [3_661_000, "1 小时 1 分钟 1 秒"],
    [7_199_500, "2 小时"],
    [25_190_000, "6 小时 59 分钟 50 秒"],
    [90_061_000, "25 小时 1 分钟 1 秒"],
  ])("formats %d ms as %s", (durationMs, expected) => {
    expect(formatDuration(durationMs)).toBe(expected);
  });

  it.each([-1, NaN, Infinity, -Infinity])("handles invalid durations: %s", (durationMs) => {
    expect(formatDuration(durationMs)).toBe("0 毫秒");
  });
});

describe("deriveActiveWorkStartedAt", () => {
  it.each([null, "2026-09-06T23:34:00.000Z"])(
    "does not time a superseded turn when the active turn differs",
    (sendStartedAt) => {
      expect(
        deriveActiveWorkStartedAt(
          {
            runId: "old",
            requestedAt: "2026-09-06T23:33:00.000Z",
            startedAt: null,
            completedAt: null,
          },
          { orchestrationStatus: "running", activeRunId: "new" },
          sendStartedAt,
        ),
      ).toBe(sendStartedAt);
    },
  );

  it("stops timing a turn that failed before its provider started", () => {
    expect(
      deriveActiveWorkStartedAt(
        {
          runId: "turn-1",
          requestedAt: "2026-09-06T23:33:00.000Z",
          startedAt: null,
          completedAt: "2026-09-06T23:33:05.000Z",
        },
        { orchestrationStatus: "error", activeRunId: null },
        null,
      ),
    ).toBeNull();
  });
  // The gap this closes. The projector stamps startedAt in the same update
  // that moves the session to "running", so during provider spin-up the turn
  // is requested with no startedAt and the session is "starting". Returning
  // null there blinks the working indicator out between "Setting up
  // worktree..." and "Working for 0s".
  it("counts from requestedAt while the provider is still starting", () => {
    expect(
      deriveActiveWorkStartedAt(
        {
          runId: "turn-1",
          requestedAt: "2026-09-06T23:33:00.000Z",
          startedAt: null,
          completedAt: null,
        },
        { orchestrationStatus: "starting", activeRunId: null },
        null,
      ),
    ).toBe("2026-09-06T23:33:00.000Z");
  });

  it("prefers the turn's own startedAt once the provider reports it", () => {
    expect(
      deriveActiveWorkStartedAt(
        {
          runId: "turn-1",
          requestedAt: "2026-09-06T23:33:00.000Z",
          startedAt: "2026-09-06T23:33:05.000Z",
          completedAt: null,
        },
        { orchestrationStatus: "running", activeRunId: "turn-1" },
        null,
      ),
    ).toBe("2026-09-06T23:33:05.000Z");
  });

  // requestedAt must not leak past the end of the work.
  it("stops counting once the turn has settled", () => {
    expect(
      deriveActiveWorkStartedAt(
        {
          runId: "turn-1",
          requestedAt: "2026-09-06T23:33:00.000Z",
          startedAt: "2026-09-06T23:33:05.000Z",
          completedAt: "2026-09-06T23:33:09.000Z",
        },
        { orchestrationStatus: "idle", activeRunId: null },
        null,
      ),
    ).toBeNull();
  });

  // A session restarting with no new turn must not resurrect the old one.
  it("does not count a settled turn while a session is starting again", () => {
    expect(
      deriveActiveWorkStartedAt(
        {
          runId: "turn-1",
          requestedAt: "2026-09-06T23:33:00.000Z",
          startedAt: "2026-09-06T23:33:05.000Z",
          completedAt: "2026-09-06T23:33:09.000Z",
        },
        { orchestrationStatus: "starting", activeRunId: null },
        null,
      ),
    ).toBeNull();
  });

  it("falls back to the caller's send timestamp when there is no turn yet", () => {
    expect(deriveActiveWorkStartedAt(null, null, "2026-09-06T23:33:00.000Z")).toBe(
      "2026-09-06T23:33:00.000Z",
    );
  });
});

describe("deriveSubagentElapsedMs", () => {
  const startedAt = "2026-09-21T12:00:00.000Z";
  const completedAt = "2026-09-21T12:00:10.000Z";
  const now = Date.parse("2026-09-21T13:00:00.000Z");
  it.each(["idle", "completed", "failed", "cancelled", "interrupted"] as const)(
    "does not count the age of %s work with unknown completion timing",
    (status) => {
      expect(deriveSubagentElapsedMs({ status, startedAt, completedAt: null }, now)).toBeNull();
      expect(deriveSubagentElapsedMs({ status, startedAt, completedAt }, now)).toBe(10_000);
    },
  );
  it("counts a resumed activation despite a stale previous completion timestamp", () => {
    expect(deriveSubagentElapsedMs({ status: "running", startedAt, completedAt }, now)).toBe(
      3_600_000,
    );
    expect(
      deriveSubagentElapsedMs({ status: "running", startedAt: null, completedAt: null }, now),
    ).toBeNull();
  });
});
