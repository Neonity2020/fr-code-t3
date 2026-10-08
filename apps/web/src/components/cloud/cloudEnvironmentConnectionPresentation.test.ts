import type { EnvironmentConnectionPresentation } from "@t3tools/client-runtime/connection";
import { describe, expect, it } from "vite-plus/test";

import { presentSavedCloudEnvironmentConnection } from "./cloudEnvironmentConnectionPresentation";

function connection(
  phase: EnvironmentConnectionPresentation["phase"],
  error: string | null = null,
): EnvironmentConnectionPresentation {
  return { phase, error, traceId: null };
}

describe("saved cloud environment connection presentation", () => {
  it("only labels a live connection as connected", () => {
    expect(presentSavedCloudEnvironmentConnection(connection("connected"))).toEqual({
      buttonLabel: "已连接",
      statusText: "已连接",
      tone: "connected",
    });

    expect(presentSavedCloudEnvironmentConnection(connection("connecting"))).toEqual({
      buttonLabel: "正在连接…",
      statusText: "正在连接…",
      tone: "connecting",
    });
  });

  it("surfaces a failed attempt while the supervisor reconnects", () => {
    expect(
      presentSavedCloudEnvironmentConnection(
        connection("reconnecting", "Relay environment endpoint is unavailable."),
      ),
    ).toEqual({
      buttonLabel: "正在重新连接…",
      statusText: "连接失败。正在重新连接…原因：Relay environment endpoint is unavailable.",
      tone: "connecting",
    });
  });

  it.each([
    ["error", "连接失败", "连接失败。原因：Access denied.", "error"],
    ["unsupported", "不支持此客户端", "不支持此客户端", "idle"],
    ["offline", "离线", "离线", "idle"],
    ["available", "未连接", "可连接", "idle"],
  ] as const)(
    "presents %s without claiming the environment is connected",
    (phase, buttonLabel, statusText, tone) => {
      expect(
        presentSavedCloudEnvironmentConnection(
          connection(phase, phase === "error" ? "Access denied." : null),
        ),
      ).toEqual({ buttonLabel, statusText, tone });
    },
  );
});
