import type { ClientConnectionMethod, EnvironmentId } from "@t3tools/contracts";
import type { RelayProtectedError } from "@t3tools/contracts/relay";
import type { ManagedRelayClientError } from "../relay/managedRelay.ts";
import { dpopFailureMessage, relayProtectedErrorMessage } from "../relay/errorPresentation.ts";
import type { RemoteEnvironmentAuthError } from "../authorization/remote.ts";
import { NETWORK_BLOCKING_HINT } from "../errors/network.ts";
import {
  ConnectionBlockedError,
  type ConnectionAttemptError,
  ConnectionTransientError,
} from "./model.ts";

export function profileMissingError(connectionId: string): ConnectionBlockedError {
  return new ConnectionBlockedError({
    reason: "configuration",
    detail: `连接配置 ${connectionId} 不可用。`,
  });
}

export function credentialMissingError(connectionId: string): ConnectionBlockedError {
  return new ConnectionBlockedError({
    reason: "authentication",
    detail: `连接凭据 ${connectionId} 不可用。`,
  });
}

export function environmentMismatchError(input: {
  readonly expected: EnvironmentId;
  readonly actual: EnvironmentId;
}): ConnectionBlockedError {
  return new ConnectionBlockedError({
    reason: "configuration",
    detail: `已连接环境 ${input.actual} 与 ${input.expected} 不匹配。`,
  });
}

function relayProtectedError(error: RelayProtectedError): ConnectionAttemptError {
  switch (error._tag) {
    case "RelayAuthInvalidError":
    case "RelayEnvironmentLinkProofExpiredError":
    case "RelayAgentActivityPublishProofExpiredError":
    case "RelayAgentActivityPublishProofInvalidError":
      return new ConnectionBlockedError({
        reason: "authentication",
        detail: relayProtectedErrorMessage(error),
        traceId: error.traceId,
      });
    case "RelayEnvironmentConnectNotAuthorizedError":
    case "RelayEnvironmentLinkProofInvalidError":
    case "RelayEnvironmentLinkLimitExceededError":
      return new ConnectionBlockedError({
        reason: "permission",
        detail: relayProtectedErrorMessage(error),
        traceId: error.traceId,
      });
    case "RelayEnvironmentEndpointTimedOutError":
      return new ConnectionTransientError({
        reason: "timeout",
        detail: relayProtectedErrorMessage(error),
        traceId: error.traceId,
      });
    case "RelayEnvironmentEndpointUnavailableError":
    case "RelayEnvironmentLinkUnavailableError":
      return new ConnectionTransientError({
        reason: "endpoint-unavailable",
        detail: relayProtectedErrorMessage(error),
        traceId: error.traceId,
      });
    case "RelayEnvironmentLinkFailedError":
    case "RelayInternalError":
      return new ConnectionTransientError({
        reason: "relay-unavailable",
        detail: relayProtectedErrorMessage(error),
        traceId: error.traceId,
      });
  }
}

export function mapManagedRelayError(error: ManagedRelayClientError): ConnectionAttemptError {
  switch (error._tag) {
    case "ManagedRelayRequestFailedError":
      if (error.relayError) {
        return relayProtectedError(error.relayError);
      }
      return new ConnectionTransientError({
        reason: "relay-unavailable",
        detail: error.message,
        ...(error.traceId ? { traceId: error.traceId } : {}),
      });
    case "ManagedRelayRequestTimeoutError":
      return new ConnectionTransientError({
        reason: "timeout",
        detail: error.message,
      });
    case "ManagedRelayUrlInvalidError":
      return new ConnectionBlockedError({
        reason: "configuration",
        detail: error.message,
      });
    case "ManagedRelayAccessTokenScopesUnexpectedError":
      return new ConnectionBlockedError({
        reason: "permission",
        detail: error.message,
      });
    case "ManagedRelayDpopKeyLoadError":
    case "ManagedRelayTokenProofCreationError":
    case "ManagedRelayRequestProofCreationError":
      return new ConnectionBlockedError({
        reason: "authentication",
        detail: error.message,
      });
  }
}

export function mapRemoteEnvironmentError(
  error: RemoteEnvironmentAuthError,
  connectionMethod: ClientConnectionMethod = "direct",
): ConnectionAttemptError {
  const networkHint = connectionMethod === "relay" ? ` ${NETWORK_BLOCKING_HINT}` : "";
  switch (error._tag) {
    case "EnvironmentAuthInvalidError":
      return new ConnectionBlockedError({
        reason: "authentication",
        detail: "环境凭据无效。",
        traceId: error.traceId,
      });
    case "EnvironmentScopeRequiredError":
    case "EnvironmentOperationForbiddenError":
      return new ConnectionBlockedError({
        reason: "permission",
        detail: "环境凭据未授予所需权限。",
        traceId: error.traceId,
      });
    case "EnvironmentRequestInvalidError":
      return new ConnectionBlockedError({
        reason: "configuration",
        detail: "环境拒绝了身份验证请求。",
        traceId: error.traceId,
      });
    case "EnvironmentResourceNotFoundError":
      // Not expected during connection authorization, but the shared request
      // error type now includes it (used by resource fetches like the thread
      // snapshot). Treat it as a configuration issue with the endpoint.
      return new ConnectionBlockedError({
        reason: "configuration",
        detail: "找不到环境端点。",
        traceId: error.traceId,
      });
    case "RemoteEnvironmentAuthTimeoutError":
      return new ConnectionTransientError({
        reason: "timeout",
        detail: `${error.message}${networkHint}`,
      });
    case "RemoteEnvironmentAuthFetchError":
      return new ConnectionTransientError({
        reason: "network",
        detail: `${error.message}${networkHint}`,
      });
    case "EnvironmentInternalError":
      return new ConnectionTransientError({
        reason: "remote-unavailable",
        detail: "环境无法授权连接。",
        traceId: error.traceId,
      });
    case "RemoteEnvironmentAuthInvalidJsonError":
    case "RemoteEnvironmentAuthUndeclaredStatusError":
      return new ConnectionTransientError({
        reason: "remote-unavailable",
        detail: error.message,
      });
  }
}

/**
 * Map an environment error from a request that used DPoP authentication. An
 * older environment server reports a DPoP clock failure as the same generic
 * invalid-credential response as other failures, so keep the compatibility
 * hint cautious when the server omits the category. Newer servers can identify
 * clock and non-clock proof failures precisely.
 */
export function mapRemoteDpopEnvironmentError(
  error: RemoteEnvironmentAuthError,
): ConnectionAttemptError {
  if (error._tag === "EnvironmentAuthInvalidError" && error.reason === "invalid_credential") {
    return new ConnectionBlockedError({
      reason: "authentication",
      detail: dpopFailureMessage("环境凭据无效。", error.dpopFailureReason),
      traceId: error.traceId,
    });
  }
  return mapRemoteEnvironmentError(error, "relay");
}
