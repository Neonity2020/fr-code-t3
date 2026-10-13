import { describe, expect, it } from "vite-plus/test";
import type { DesktopUpdateState } from "@t3tools/contracts";

import { getDesktopUpdateNotificationKey } from "./desktopUpdateNotification.logic";

const baseState: DesktopUpdateState = {
  enabled: true,
  status: "idle",
  channel: "latest",
  currentVersion: "1.0.0",
  hostArch: "arm64",
  appArch: "arm64",
  runningUnderArm64Translation: false,
  availableVersion: null,
  downloadedVersion: null,
  releaseNotes: [],
  omittedReleaseCount: 0,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: false,
};

describe("getDesktopUpdateNotificationKey", () => {
  it("identifies an available release by its channel and version", () => {
    expect(
      getDesktopUpdateNotificationKey({
        ...baseState,
        status: "available",
        channel: "nightly",
        availableVersion: "1.1.0-nightly.1",
      }),
    ).toBe("nightly:1.1.0-nightly.1");
  });

  it("does not notify for a check state or an incomplete release event", () => {
    expect(getDesktopUpdateNotificationKey({ ...baseState, status: "checking" })).toBeNull();
    expect(getDesktopUpdateNotificationKey({ ...baseState, status: "available" })).toBeNull();
  });
});
