import {
  connectionStatusText,
  type EnvironmentConnectionPresentation,
} from "@t3tools/client-runtime/connection";

export interface SavedCloudEnvironmentConnectionPresentation {
  readonly buttonLabel: string;
  readonly statusText: string;
  readonly tone: "connected" | "connecting" | "error" | "idle";
}

/**
 * Present the live supervisor state for an environment that is already in the
 * connection catalog. Catalog membership only means the environment is saved;
 * it does not mean the connection attempt succeeded.
 */
export function presentSavedCloudEnvironmentConnection(
  connection: EnvironmentConnectionPresentation,
): SavedCloudEnvironmentConnectionPresentation {
  switch (connection.phase) {
    case "connected":
      return {
        buttonLabel: "已连接",
        statusText: connectionStatusText(connection),
        tone: "connected",
      };
    case "connecting":
      return {
        buttonLabel: "正在连接…",
        statusText: connectionStatusText(connection),
        tone: "connecting",
      };
    case "reconnecting":
      return {
        buttonLabel: "正在重新连接…",
        statusText: connectionStatusText(connection),
        tone: "connecting",
      };
    // Not a failure: the machine is fine, this build just cannot talk to it.
    case "unsupported":
      return {
        buttonLabel: "不支持此客户端",
        statusText: connectionStatusText(connection),
        tone: "idle",
      };
    case "error":
      return {
        buttonLabel: "连接失败",
        statusText: connectionStatusText(connection),
        tone: "error",
      };
    case "offline":
      return {
        buttonLabel: "离线",
        statusText: connectionStatusText(connection),
        tone: "idle",
      };
    case "available":
      return {
        buttonLabel: "未连接",
        statusText: connectionStatusText(connection),
        tone: "idle",
      };
  }
}
