import { DeviceToolVersions } from "../device/DeviceToolVersions";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { AppleIcon, AndroidIcon } from "../Icons";
import { Spinner } from "../ui/spinner";
import type { EnvironmentId, SshDeviceHostConfig } from "@t3tools/contracts";
import { randomUUID } from "../../lib/utils";
import { useState } from "react";
import { deviceEnvironment, useDeviceState } from "../../state/device";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { MoreVertical, PlusIcon } from "lucide-react";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { SettingsRow } from "./settingsLayout";

import { useSettingsScope } from "./SettingsScopeContext";
import { toastManager } from "../ui/toast";
import { updateDeviceHosts } from "./deviceHostsSettings.logic";
import { DeviceHostEditor } from "./DeviceHostEditor";
import { useHostConnectionChecks } from "./useHostConnectionChecks";
import { deviceHostConnectionKey } from "./deviceHostConnectionChecks";

export function DeviceHostsSettings(props: { environmentId: EnvironmentId | null }) {
  const { scope, environments, connectedEnvironments } = useSettingsScope();
  const projectScope = scope.kind === "project" || scope.kind === "checkout";
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const [editing, setEditing] = useState<SshDeviceHostConfig | null>(null);
  const [originalHost, setOriginalHost] = useState<SshDeviceHostConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const targets = environments.map((environment) => ({
    environmentId: environment.environmentId,
    label: environment.label,
    connected: environment.connection.phase === "connected",
  }));
  const { checks, testConnection } = useHostConnectionChecks(targets);
  const save = async (host: SshDeviceHostConfig, remove = false, original = host) => {
    if (!props.environmentId || projectScope) return;
    setBusy(true);
    try {
      const results = await Promise.allSettled(
        environments.map(async (environment) => {
          if (environment.connection.phase !== "connected" || !environment.serverConfig) {
            throw new Error("环境已断开");
          }
          return update({
            environmentId: environment.environmentId,
            input: {
              patch: {
                deviceHosts: updateDeviceHosts(
                  environment.serverConfig.settings.deviceHosts,
                  host,
                  remove,
                  original,
                ),
              },
            },
          });
        }),
      );
      const failed = environments.filter((_, index) => {
        const result = results[index];
        return result?.status !== "fulfilled" || result.value._tag === "Failure";
      });
      if (failed.length === 0) {
        setEditing(null);
      } else {
        toastManager.add({
          type: "error",
          title: "设备主机未保存到所有环境",
          description: `无法更新 ${failed.map((environment) => environment.label).join(", ")}。`,
        });
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsRow
      id="device-hosts"
      title="设备主机"
      serverScoped
      settingKeys={["deviceHosts"]}
      description="添加已安装模拟器运行时的远程计算机，所选环境会通过 SSH 连接并自动设置设备工具。"
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={projectScope || busy || !props.environmentId || editing !== null}
          onClick={() => {
            setOriginalHost(null);
            setEditing({ id: randomUUID(), label: "", target: "" });
          }}
        >
          <PlusIcon className="size-3.5" /> 添加主机
        </Button>
      }
    >
      <div className="pt-3 pb-2">
        {!props.environmentId ? (
          <p className="text-sm text-muted-foreground">连接所选环境以管理设备主机。</p>
        ) : (
          <>
            {connectedEnvironments.map((environment) => (
              <div key={environment.environmentId}>
                {connectedEnvironments.length > 1 ? (
                  <p className="pt-3 pb-1 text-xs font-medium text-muted-foreground">
                    {environment.label}
                  </p>
                ) : null}
                <DeviceHostList
                  environmentLabel={environment.label}
                  environmentId={environment.environmentId}
                  hosts={environment.serverConfig?.settings.deviceHosts ?? []}
                  busy={projectScope || busy}
                  checks={checks}
                  testConnection={async (host) => {
                    const results = await testConnection(host);
                    if (!results) return;
                    const failed = targets.filter(
                      (target) => results[target.environmentId]?.status === "failed",
                    );
                    toastManager.add({
                      type: failed.length ? "error" : "success",
                      title: failed.length
                        ? `${host.label}：${targets.length} 个环境中有 ${failed.length} 个失败`
                        : `${host.label}：连接检查已通过`,
                      description: failed.length
                        ? `无法从 ${failed.map((target) => target.label).join(", ")} 连接。`
                        : "每个所选环境均已连接或已可在本地访问。",
                    });
                    return results;
                  }}
                  onEdit={(host) => {
                    setOriginalHost(host);
                    setEditing(host);
                  }}
                  onRemove={(host) => void save(host, true)}
                />
              </div>
            ))}
            {editing ? (
              <DeviceHostEditor
                key={editing.id}
                host={editing}
                isNew={originalHost === null}
                targets={targets}
                busy={busy}
                onSave={(host) => void save(host, false, originalHost ?? host)}
                onClose={() => setEditing(null)}
              />
            ) : null}
          </>
        )}
      </div>
    </SettingsRow>
  );
}

function DeviceHostList({
  environmentLabel,
  environmentId,
  hosts,
  busy,
  onEdit,
  onRemove,
  checks,
  testConnection,
}: {
  environmentLabel: string;
  environmentId: EnvironmentId;
  hosts: ReadonlyArray<SshDeviceHostConfig>;
  busy: boolean;
  onEdit: (host: SshDeviceHostConfig) => void;
  onRemove: (host: SshDeviceHostConfig) => void;
  checks: ReturnType<typeof useHostConnectionChecks>["checks"];
  testConnection: ReturnType<typeof useHostConnectionChecks>["testConnection"];
}) {
  const { state } = useDeviceState(environmentId);
  const retry = useAtomCommand(deviceEnvironment.list);
  const [retrying, setRetrying] = useState<string | null>(null);
  return (
    <>
      {hosts.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">没有设备主机。</p>
      ) : null}
      {hosts.map((host) => {
        const status = state.hostStatuses[host.id];
        const check = checks[deviceHostConnectionKey(host)]?.[environmentId];
        const platforms =
          (check?.status === "connected" ? check.platforms : undefined) ??
          state.hosts.find((value) => value.id === host.id)?.platforms ??
          [];
        const progress =
          check?.status === "pending"
            ? "正在检查连接…"
            : status?.status === "installing"
              ? "正在安装设备支持…"
              : status?.status === "starting"
                ? "Connecting…"
                : null;
        const error =
          check?.status === "failed"
            ? check.error
            : check?.status === "local"
              ? undefined
              : status?.status === "failed"
                ? status.detail
                : undefined;
        return (
          <div key={host.id} className="flex items-center gap-2 border-t border-border/50 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-medium">{host.label}</p>
                {platforms
                  .filter((platform) => platform.available)
                  .map((platform) => (
                    <Tooltip key={platform.platform}>
                      <TooltipTrigger
                        render={
                          <span
                            tabIndex={0}
                            role="img"
                            aria-label={platform.platform === "ios" ? "支持 iOS" : "支持 Android"}
                            className="shrink-0 text-muted-foreground"
                          />
                        }
                      >
                        {platform.platform === "ios" ? (
                          // The Apple mark is bottom-heavy; lift it so it does not dip under the label.
                          <AppleIcon className="size-3.5 -translate-y-px" />
                        ) : (
                          <AndroidIcon className="size-3.5" />
                        )}
                      </TooltipTrigger>
                      <TooltipPopup>
                        {platform.platform === "ios" ? "支持 iOS" : "支持 Android"}
                      </TooltipPopup>
                    </Tooltip>
                  ))}
              </div>
              <p className="truncate text-xs text-muted-foreground">{host.target}</p>
              <DeviceToolVersions
                owner={environmentLabel}
                error={state.hosts.find((value) => value.id === host.id)?.toolInspectionError}
                tools={
                  state.hosts.find((value) => value.id === host.id)?.tools ??
                  (check?.status === "connected" ? check.tools : undefined)
                }
              />
              {check?.status === "local" ? (
                <p className="mt-1 text-xs text-muted-foreground">本地已可用</p>
              ) : null}
              {error ? (
                <div className="mt-1" role="status">
                  <details className="text-xs text-destructive">
                    <summary>连接失败</summary>
                    <p className="mt-1 whitespace-pre-wrap break-words">{error}</p>
                  </details>
                </div>
              ) : null}
            </div>
            {progress ? (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Spinner size="xs" />
                {progress}
              </span>
            ) : null}
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost-muted"
                    disabled={busy}
                    aria-label={host.label + " options"}
                  />
                }
              >
                <MoreVertical />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem
                  onClick={() => {
                    onEdit(host);
                  }}
                >
                  编辑
                </MenuItem>
                <MenuItem variant="destructive" onClick={() => onRemove(host)}>
                  移除
                </MenuItem>
              </MenuPopup>
            </Menu>
            {status?.status === "failed" &&
            state.supportsHostRetry &&
            state.hostStatus !== "disabled" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || retrying !== null}
                onClick={() => {
                  setRetrying(host.id);
                  void retry({ environmentId, input: { retryHostId: host.id } }).finally(() =>
                    setRetrying(null),
                  );
                }}
              >
                {retrying === host.id ? "正在重试…" : "重试"}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy || progress !== null}
                onClick={() => void testConnection(host)}
              >
                测试连接
              </Button>
            )}
          </div>
        );
      })}
    </>
  );
}
