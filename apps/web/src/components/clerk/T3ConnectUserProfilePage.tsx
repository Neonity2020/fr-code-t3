import { findErrorTraceId } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import type { RelayClientEnvironmentRecord } from "@t3tools/contracts/relay";
import { ServerIcon } from "lucide-react";
import { useRef, useState } from "react";

import {
  deregisterManagedRelayEnvironmentCommand,
  useManagedRelayEnvironments,
} from "../../cloud/managedRelayState";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { toastManager } from "../ui/toast";
import {
  ClerkUserProfilePage,
  ClerkUserProfileRefreshButton,
  ClerkUserProfileRow,
} from "./ClerkUserProfilePage";

const linkedAtFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function linkedAtLabel(value: string): string {
  const linkedAt = new Date(value);
  return Number.isNaN(linkedAt.getTime())
    ? "关联日期不可用"
    : `关联于 ${linkedAtFormatter.format(linkedAt)}`;
}

function endpointLabel(environment: RelayClientEnvironmentRecord): string {
  return environment.endpoint.providerKind === "cloudflare_tunnel" ? "托管隧道" : "仅发布活动";
}

export function T3ConnectEnvironmentRow(props: {
  readonly environment: RelayClientEnvironmentRecord;
  readonly confirmationOpen: boolean;
  readonly mutationPending: boolean;
  readonly onConfirmationChange: (open: boolean) => void;
  readonly onDeregister: (environment: RelayClientEnvironmentRecord) => void;
}) {
  const { environment } = props;
  return (
    <ClerkUserProfileRow icon={<ServerIcon className="size-4" />}>
      <Collapsible open={props.confirmationOpen} onOpenChange={props.onConfirmationChange}>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm leading-4.5 font-medium text-foreground">
              {environment.label}
            </h3>
            <p className="mt-1 text-xs leading-4.5 text-muted-foreground">
              {linkedAtLabel(environment.linkedAt)} · {endpointLabel(environment)}
            </p>
          </div>
          <CollapsibleTrigger
            render={
              <Button size="sm" variant="destructive-outline" disabled={props.mutationPending}>
                注销
              </Button>
            }
          />
        </div>

        <CollapsiblePanel>
          <div className="pt-3">
            <div
              className="rounded-lg border border-input bg-muted/32 px-5 py-4 shadow-xs/5"
              role="group"
              aria-label={`确认注销 ${environment.label}`}
            >
              <h4 className="text-sm leading-4.5 font-semibold text-foreground">注销服务器</h4>
              <p className="mt-1 text-xs leading-4.5 text-muted-foreground">
                “{environment.label}”将从此账号移除。
              </p>
              <p className="mt-4 max-w-xl text-xs leading-4.5 text-muted-foreground">
                T3 Connect
                访问权限将被撤销，托管隧道将被移除，并释放一个主机名额。此操作不会更改设备上的本地连接。
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={props.mutationPending}
                  onClick={() => props.onConfirmationChange(false)}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={props.mutationPending}
                  onClick={() => props.onDeregister(environment)}
                >
                  {props.mutationPending ? "正在注销…" : "注销"}
                </Button>
              </div>
            </div>
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </ClerkUserProfileRow>
  );
}

export function T3ConnectUserProfilePage() {
  const environmentsState = useManagedRelayEnvironments();
  const deregisterEnvironment = useAtomCommand(deregisterManagedRelayEnvironmentCommand, {
    reportFailure: false,
  });
  const [deregisteringEnvironmentId, setDeregisteringEnvironmentId] =
    useState<EnvironmentId | null>(null);
  const [confirmingEnvironmentId, setConfirmingEnvironmentId] = useState<EnvironmentId | null>(
    null,
  );
  const mutationPendingRef = useRef(false);
  const [removedEnvironments, setRemovedEnvironments] = useState<{
    readonly accountId: string | null;
    readonly linkedAtById: ReadonlyMap<EnvironmentId, string>;
  }>({ accountId: null, linkedAtById: new Map() });

  const handleDeregister = async (environment: RelayClientEnvironmentRecord) => {
    const accountId = environmentsState.accountId;
    if (!accountId || mutationPendingRef.current) return;

    mutationPendingRef.current = true;
    setDeregisteringEnvironmentId(environment.environmentId);
    const result = await deregisterEnvironment({
      accountId,
      environmentId: environment.environmentId,
    });
    mutationPendingRef.current = false;
    setDeregisteringEnvironmentId(null);

    if (result._tag === "Success") {
      setConfirmingEnvironmentId(null);
      setRemovedEnvironments((current) => {
        const linkedAtById = new Map(current.accountId === accountId ? current.linkedAtById : []);
        linkedAtById.set(environment.environmentId, environment.linkedAt);
        return { accountId, linkedAtById };
      });
      environmentsState.refresh();
      toastManager.add({
        type: "success",
        title: "服务器已注销",
        description: "T3 Connect 访问权限已撤销，已释放一个主机名额。",
      });
      return;
    }
    if (isAtomCommandInterrupted(result)) return;

    const cause = squashAtomCommandFailure(result);
    const message = cause instanceof Error ? cause.message : "无法注销服务器。";
    const traceId = findErrorTraceId(cause);
    console.error("[t3-connect] Could not deregister environment", {
      environmentId: environment.environmentId,
      message,
      traceId,
      cause,
    });
    toastManager.add({
      type: "error",
      title: "无法注销服务器",
      description: message,
      data: traceId
        ? {
            secondaryActionProps: {
              children: "复制追踪 ID",
              onClick: () => void navigator.clipboard?.writeText(traceId),
            },
          }
        : undefined,
    });
  };

  const removedEnvironmentLinkedAt =
    removedEnvironments.accountId === environmentsState.accountId
      ? removedEnvironments.linkedAtById
      : new Map<EnvironmentId, string>();
  const environments = (environmentsState.data ?? []).filter(
    (environment) =>
      removedEnvironmentLinkedAt.get(environment.environmentId) !== environment.linkedAt,
  );
  const isInitialLoad =
    !environmentsState.accountId || (environmentsState.data === null && !environmentsState.error);

  return (
    <ClerkUserProfilePage
      title="T3 Connect"
      description="账号中注册的环境。此设备上的连接在设置中管理。"
      action={
        <ClerkUserProfileRefreshButton
          disabled={deregisteringEnvironmentId !== null}
          isPending={environmentsState.isPending}
          onClick={environmentsState.refresh}
        />
      }
    >
      <div>
        {environmentsState.error ? (
          <div className="mb-4 border-t border-destructive/35 py-3 text-xs" role="alert">
            <p className="font-medium text-destructive-foreground">无法加载 T3 Connect 环境</p>
            <p className="mt-1 text-xs text-muted-foreground">{environmentsState.error}</p>
          </div>
        ) : null}

        {isInitialLoad ? (
          <p className="border-t py-4 text-xs text-muted-foreground" role="status">
            正在加载环境…
          </p>
        ) : environments.length > 0 ? (
          <ul className="border-t">
            {environments.map((environment) => (
              <T3ConnectEnvironmentRow
                key={environment.environmentId}
                environment={environment}
                confirmationOpen={confirmingEnvironmentId === environment.environmentId}
                mutationPending={deregisteringEnvironmentId !== null}
                onConfirmationChange={(open) =>
                  setConfirmingEnvironmentId(open ? environment.environmentId : null)
                }
                onDeregister={(selected) => void handleDeregister(selected)}
              />
            ))}
          </ul>
        ) : environmentsState.error ? null : (
          <div className="border-t">
            <Empty size="compact">
              <EmptyMedia variant="icon">
                <ServerIcon />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>没有 T3 Connect 环境</EmptyTitle>
                <EmptyDescription>
                  在环境的本地设置中关联 T3 Connect，使其可通过 T3 Connect 访问。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </div>
    </ClerkUserProfilePage>
  );
}
