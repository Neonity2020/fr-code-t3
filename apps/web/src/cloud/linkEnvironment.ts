import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient } from "effect/http";
import {
  EnvironmentCloudEndpointUnavailableError,
  type EnvironmentCloudLinkStateResult,
  EnvironmentHttpBadRequestError,
  EnvironmentHttpConflictError,
  EnvironmentHttpForbiddenError,
  EnvironmentHttpInternalServerError,
  EnvironmentHttpUnauthorizedError,
  EnvironmentId,
  WS_METHODS,
} from "@t3tools/contracts";
import {
  type RelayEnvironmentLinkResponse,
  type RelayManagedEndpointProviderKind,
} from "@t3tools/contracts/relay";
import { EnvironmentRegistry } from "@t3tools/client-runtime/connection";
import { request, runStream } from "@t3tools/client-runtime/rpc";
import { makeEnvironmentHttpApiClient } from "@t3tools/client-runtime/rpc";
import { ManagedRelay, relayProtectedErrorMessage } from "@t3tools/client-runtime/relay";

import * as PrimaryEnvironmentHttpLayer from "../environments/primary/httpLayer";
import { resolveCloudPublicConfig } from "./publicConfig";
import {
  finishRelayClientInstall,
  reportRelayClientInstallProgress,
  requestRelayClientInstallConfirmation,
} from "./relayClientInstallDialog";

function relayUrl(): string | null {
  return resolveCloudPublicConfig().relayUrl;
}

export class CloudEnvironmentLinkError extends Data.TaggedError("CloudEnvironmentLinkError")<{
  readonly message: string;
  readonly cause?: unknown;
  readonly traceId?: string;
}> {}

const relayClientRpcError = (message: string) => (cause: unknown) =>
  new CloudEnvironmentLinkError({
    message,
    cause,
  });

function ensureRelayClientAvailable(
  environmentId: EnvironmentId,
): Effect.Effect<void, CloudEnvironmentLinkError, EnvironmentRegistry.EnvironmentRegistry> {
  return Effect.gen(function* () {
    const registry = yield* EnvironmentRegistry.EnvironmentRegistry;
    const status = yield* registry
      .run(environmentId, request(WS_METHODS.cloudGetRelayClientStatus, {}))
      .pipe(Effect.mapError(relayClientRpcError("无法检查中继客户端是否可用。")));
    if (status.status === "available") return;
    if (status.status === "unsupported") {
      return yield* new CloudEnvironmentLinkError({
        message: `FR Code 无法在 ${status.platform}-${status.arch} 上自动安装中继客户端。`,
      });
    }

    const confirmed = yield* Effect.tryPromise({
      try: () => requestRelayClientInstallConfirmation(status.version),
      catch: relayClientRpcError("无法确认中继客户端安装状态。"),
    });
    if (!confirmed) {
      return yield* new CloudEnvironmentLinkError({
        message: "中继客户端安装已取消。",
      });
    }

    const installed = yield* registry
      .runStream(
        environmentId,
        runStream(WS_METHODS.cloudInstallRelayClient, {}).pipe(
          Stream.tap((event) => Effect.sync(() => reportRelayClientInstallProgress(event))),
        ),
      )
      .pipe(
        Stream.runLast,
        Effect.mapError(relayClientRpcError("无法安装中继客户端。")),
        Effect.ensuring(Effect.sync(finishRelayClientInstall)),
      );
    if (Option.isNone(installed) || installed.value.type !== "complete") {
      return yield* new CloudEnvironmentLinkError({
        message: "中继客户端安装结束，但未返回最终状态。",
      });
    }
    const installedStatus = installed.value.status;
    if (installedStatus.status !== "available") {
      return yield* new CloudEnvironmentLinkError({
        message:
          installedStatus.status === "unsupported"
            ? `FR Code 无法在 ${installedStatus.platform}-${installedStatus.arch} 上自动安装中继客户端。`
            : "安装后中继客户端仍不可用。",
      });
    }
  });
}

const isEnvironmentCloudApiError = Schema.is(
  Schema.Union([
    EnvironmentHttpBadRequestError,
    EnvironmentHttpUnauthorizedError,
    EnvironmentHttpForbiddenError,
    EnvironmentHttpConflictError,
    EnvironmentHttpInternalServerError,
    EnvironmentCloudEndpointUnavailableError,
  ]),
);

function decodedRelayClientError(message: string) {
  return (cause: ManagedRelay.ManagedRelayClientError) => {
    const relayError =
      cause._tag === "ManagedRelayRequestFailedError" ? cause.relayError : undefined;
    const traceId = cause._tag === "ManagedRelayRequestFailedError" ? cause.traceId : undefined;
    const detail = relayError ? relayProtectedErrorMessage(relayError) : null;
    return new CloudEnvironmentLinkError({
      message: detail ? `${message}: ${detail}` : message,
      cause,
      ...(traceId ? { traceId } : {}),
    });
  };
}

function findEnvironmentCloudApiError(cause: unknown): { readonly message: string } | null {
  if (isEnvironmentCloudApiError(cause)) {
    return cause;
  }
  if (typeof cause !== "object" || cause === null) {
    return null;
  }
  return "cause" in cause ? findEnvironmentCloudApiError(cause.cause) : null;
}

const environmentApiError = (message: string) => (cause: unknown) => {
  const environmentError = findEnvironmentCloudApiError(cause);
  return new CloudEnvironmentLinkError({
    message: environmentError
      ? `${message.replace(/[.:]$/, "")}: ${environmentError.message}`
      : message,
    cause,
  });
};

function endpointOrigin(httpBaseUrl: string) {
  const url = new URL(httpBaseUrl);
  return {
    localHttpHost: "127.0.0.1",
    localHttpPort: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
  };
}

const MANAGED_ENDPOINT_PROVIDER_KIND =
  "cloudflare_tunnel" satisfies RelayManagedEndpointProviderKind;

function ensureLinkedEnvironmentMatches(input: {
  readonly expectedEnvironmentId: string;
  readonly expectedProviderKind: RelayManagedEndpointProviderKind;
  readonly link: RelayEnvironmentLinkResponse;
}): Effect.Effect<void, CloudEnvironmentLinkError> {
  if (input.link.environmentId !== input.expectedEnvironmentId) {
    return new CloudEnvironmentLinkError({
      message: "中继返回了其他环境的凭据。",
    });
  }
  if (input.link.endpoint.providerKind !== input.expectedProviderKind) {
    return new CloudEnvironmentLinkError({
      message: "中继返回了其他端点提供方的凭据。",
    });
  }
  return Effect.void;
}

export interface CloudLinkTarget {
  readonly environmentId: string;
  readonly label: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
}

export type CloudLinkState = EnvironmentCloudLinkStateResult;

export function readPrimaryCloudLinkState(input: {
  readonly target: CloudLinkTarget;
}): Effect.Effect<CloudLinkState | null, CloudEnvironmentLinkError, HttpClient.HttpClient> {
  return Effect.gen(function* () {
    const client = yield* makeEnvironmentHttpApiClient(input.target.httpBaseUrl);
    return yield* client.connect
      .linkState({ headers: {} })
      .pipe(Effect.mapError(environmentApiError("无法读取环境的云连接状态。")));
  }).pipe(Effect.provide(PrimaryEnvironmentHttpLayer.layer));
}

export function updatePrimaryCloudPreferences(input: {
  readonly target: CloudLinkTarget;
  readonly publishAgentActivity: boolean;
  readonly holdWebhooksWhileOffline?: boolean;
}): Effect.Effect<CloudLinkState, CloudEnvironmentLinkError, HttpClient.HttpClient> {
  return Effect.gen(function* () {
    const client = yield* makeEnvironmentHttpApiClient(input.target.httpBaseUrl);
    const { target: _target, ...payload } = input;
    return yield* client.connect
      .preferences({
        headers: {},
        payload,
      })
      .pipe(Effect.mapError(environmentApiError("无法更新环境的云服务偏好。")));
  }).pipe(Effect.provide(PrimaryEnvironmentHttpLayer.layer));
}

export function unlinkPrimaryEnvironmentFromCloud(input: {
  readonly target: CloudLinkTarget;
  readonly clerkToken: string | null;
}): Effect.Effect<
  void,
  CloudEnvironmentLinkError,
  HttpClient.HttpClient | ManagedRelay.ManagedRelayClient
> {
  return Effect.gen(function* () {
    const client = yield* makeEnvironmentHttpApiClient(input.target.httpBaseUrl);
    yield* client.connect
      .unlink({ headers: {} })
      .pipe(Effect.mapError(environmentApiError("无法断开环境与云服务的连接。")));

    const configuredRelayUrl = relayUrl();
    if (configuredRelayUrl && input.clerkToken) {
      const relayClient = yield* ManagedRelay.ManagedRelayClient;
      yield* relayClient
        .unlinkEnvironment({
          clerkToken: input.clerkToken,
          environmentId: EnvironmentId.make(input.target.environmentId),
        })
        .pipe(
          Effect.catch((cause) =>
            Effect.logWarning("Could not revoke cloud environment link after local unlink.", {
              cause,
            }),
          ),
        );
    }
  }).pipe(Effect.provide(PrimaryEnvironmentHttpLayer.layer));
}

// "publish_only" links the environment to the relay for agent-activity
// publishing alone: no managed tunnel is provisioned, so it can be toggled
// independently of T3 Connect while clients reach the environment out of band.
export type CloudLinkMode = "managed" | "publish_only";

const PUBLISH_ONLY_PROVIDER_KIND = "manual" satisfies RelayManagedEndpointProviderKind;

export function linkPrimaryEnvironmentToCloud(input: {
  readonly target: CloudLinkTarget;
  readonly clerkToken: string;
  readonly mode?: CloudLinkMode;
}): Effect.Effect<
  void,
  CloudEnvironmentLinkError,
  EnvironmentRegistry.EnvironmentRegistry | HttpClient.HttpClient | ManagedRelay.ManagedRelayClient
> {
  return Effect.gen(function* () {
    const configuredRelayUrl = relayUrl();
    if (!configuredRelayUrl) {
      return yield* new CloudEnvironmentLinkError({
        message: "尚未配置 T3CODE_RELAY_URL。",
      });
    }
    const managedTunnelsEnabled = (input.mode ?? "managed") === "managed";
    const providerKind = managedTunnelsEnabled
      ? MANAGED_ENDPOINT_PROVIDER_KIND
      : PUBLISH_ONLY_PROVIDER_KIND;
    const relayClient = yield* ManagedRelay.ManagedRelayClient;
    const environmentClient = yield* makeEnvironmentHttpApiClient(input.target.httpBaseUrl);
    if (managedTunnelsEnabled) {
      yield* ensureRelayClientAvailable(EnvironmentId.make(input.target.environmentId));
    }

    const challenge = yield* relayClient
      .createEnvironmentLinkChallenge({
        clerkToken: input.clerkToken,
        payload: {
          notificationsEnabled: true,
          liveActivitiesEnabled: true,
          managedTunnelsEnabled,
        },
      })
      .pipe(
        Effect.mapError(
          decodedRelayClientError(
            `${configuredRelayUrl}/v1/client/environment-link-challenges failed`,
          ),
        ),
      );
    const proof = yield* environmentClient.connect
      .linkProof({
        headers: {},
        payload: {
          challenge: challenge.challenge,
          relayIssuer: configuredRelayUrl,
          endpoint: {
            httpBaseUrl: input.target.httpBaseUrl,
            wsBaseUrl: input.target.wsBaseUrl,
            providerKind,
          },
          origin: endpointOrigin(input.target.httpBaseUrl),
        },
      })
      .pipe(Effect.mapError(environmentApiError("无法获取环境连接凭证。")));
    const link = yield* relayClient
      .linkEnvironment({
        clerkToken: input.clerkToken,
        payload: {
          proof,
          notificationsEnabled: true,
          liveActivitiesEnabled: true,
          managedTunnelsEnabled,
        },
      })
      .pipe(
        Effect.mapError(
          decodedRelayClientError(`${configuredRelayUrl}/v1/client/environment-links failed`),
        ),
      );
    yield* ensureLinkedEnvironmentMatches({
      expectedEnvironmentId: input.target.environmentId,
      expectedProviderKind: providerKind,
      link,
    });

    yield* environmentClient.connect
      .relayConfig({
        headers: {},
        payload: {
          relayUrl: configuredRelayUrl,
          relayIssuer: link.relayIssuer,
          cloudUserId: link.cloudUserId,
          environmentCredential: link.environmentCredential,
          cloudMintPublicKey: link.cloudMintPublicKey,
          endpointRuntime: link.endpointRuntime,
        },
      })
      .pipe(Effect.mapError(environmentApiError("无法配置环境的中继访问。")));
  }).pipe(Effect.provide(PrimaryEnvironmentHttpLayer.layer));
}
