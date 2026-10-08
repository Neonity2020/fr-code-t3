import type { DpopFailureReason } from "@t3tools/contracts";
import type { RelayEnvironmentStatusResponse, RelayProtectedError } from "@t3tools/contracts/relay";

export const DPOP_CLOCK_HINT = "提示：请确认两台设备都已启用自动设置日期和时间，然后重试。";

/** Older servers omit the DPoP category, but newer servers can also omit it for
 * a credential failure that happens after proof verification. */
export const DPOP_UNKNOWN_HINT =
  "提示：请重试。如果仍然失败，可能是设备时间不同步；请确认两台设备都已启用自动设置日期和时间。";

export const DPOP_RETRY_HINT = "提示：请重试。如果问题仍然存在，请复制追踪 ID。";

function dpopFailureHint(reason: DpopFailureReason | undefined): string {
  if (reason === "time_window") return DPOP_CLOCK_HINT;
  if (reason === undefined) return DPOP_UNKNOWN_HINT;
  return DPOP_RETRY_HINT;
}

export function dpopFailureMessage(message: string, reason: DpopFailureReason | undefined): string {
  return `${message} ${dpopFailureHint(reason)}`;
}

export function relayProtectedErrorMessage(error: RelayProtectedError): string {
  switch (error._tag) {
    case "RelayAuthInvalidError":
      switch (error.reason) {
        case "missing_bearer":
        case "invalid_bearer":
          return "中继服务拒绝了云端会话令牌。";
        case "invalid_dpop":
          return dpopFailureMessage("中继服务拒绝了 DPoP 证明。", error.dpopFailureReason);
        case "not_authorized":
          return "中继服务拒绝了已认证的请求。";
      }
    case "RelayEnvironmentLinkProofExpiredError":
      return "中继服务拒绝了已过期的环境关联证明。";
    case "RelayEnvironmentLinkProofInvalidError":
      return `中继服务拒绝了环境关联证明（${error.reason}）。`;
    case "RelayEnvironmentConnectNotAuthorizedError":
      // "Not authorized" covers non-auth causes too; surface the reason so a
      // missing link does not read as a credential problem.
      if (error.reason === "environment_link_not_found") {
        return "中继服务尚未关联此环境。环境服务器可能还未重新建立关联。";
      }
      return error.reason
        ? `中继服务拒绝了环境连接请求（${error.reason}）。`
        : "中继服务拒绝了环境连接请求。";
    case "RelayEnvironmentEndpointUnavailableError":
      return `中继服务无法连接环境端点（${error.reason}）。`;
    case "RelayEnvironmentEndpointTimedOutError":
      return "中继服务连接环境端点时超时。";
    case "RelayEnvironmentLinkFailedError":
      return `中继服务无法关联环境（${error.reason}）。`;
    case "RelayEnvironmentLinkUnavailableError":
      return `中继服务无法配置托管端点（${error.reason}）。`;
    case "RelayEnvironmentLinkLimitExceededError":
      return `中继服务拒绝关联：此账号已达到 ${error.maxTunnels} 条托管隧道的上限。请取消一个环境的关联以释放名额。`;
    case "RelayAgentActivityPublishProofExpiredError":
      return "中继服务拒绝了已过期的智能体活动发布证明。";
    case "RelayAgentActivityPublishProofInvalidError":
      return `中继服务拒绝了智能体活动发布证明（${error.reason}）。`;
    case "RelayInternalError":
      return `中继服务发生内部错误（${error.reason}）。`;
  }
}

// A host with a current build gets a new tunnel on its own within minutes of
// coming back, which clears this reason. While it is still reported, the host
// is either still off or running a build too old to do that.
export const RELAY_TUNNEL_RELEASED_MESSAGE =
  "此环境离线时间较长，T3 Connect 隧道已被移除。请在该电脑上启动 FR Code 并更新至最新版以重新连接。";

/** User-facing text for an offline status, or null when the relay gave no known reason. */
export function relayOfflineReasonMessage(
  status: Pick<RelayEnvironmentStatusResponse, "offlineReason">,
): string | null {
  switch (status.offlineReason) {
    case "tunnel_released":
      return RELAY_TUNNEL_RELEASED_MESSAGE;
    case undefined:
      return null;
  }
}
