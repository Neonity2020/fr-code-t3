import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  ANTIGRAVITY_AUTH_METHODS,
  type AntigravityAuthMethod,
  type EnvironmentId,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { useRef, useState } from "react";
import { Trash2Icon } from "lucide-react";

import { ensureLocalApi } from "../../localApi";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SettingsRow } from "./settingsLayout";
import { ProviderAuthenticationSection } from "./ProviderAuthenticationSection";

interface ProviderSetupSectionProps {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly instanceId: ProviderInstanceId;
  readonly provider: ServerProvider | undefined;
  readonly binaryPath?: string | undefined;
  readonly authMethod?: AntigravityAuthMethod | undefined;
  readonly enabled: boolean;
  readonly readOnly: boolean;
  readonly onEnable: () => void;
}

/** Read the configured method from the instance config. Unknown values fall back to personal. */
export function readAntigravityAuthMethod(config: unknown): AntigravityAuthMethod {
  const value =
    config !== null && typeof config === "object" && "authMethod" in config
      ? config.authMethod
      : undefined;
  return (
    ANTIGRAVITY_AUTH_METHODS.find((method) => method.value === value)?.value ?? "oauth-personal"
  );
}

/** Setup state belongs to the selected environment and is never saved in client settings. */
export function ProviderSetupSection(props: ProviderSetupSectionProps) {
  return (
    <section
      aria-label="Antigravity 设置"
      className="@container/setup divide-y divide-border/50 text-xs"
    >
      <SettingsRow
        className="@max-lg/setup:[&>div:first-child]:flex @max-lg/setup:[&>div:first-child]:items-stretch @max-lg/setup:[&>div:first-child]:gap-3"
        title="环境"
        description="运行此提供方的设备。"
        control={
          <div className="flex min-w-0 flex-col gap-2 sm:items-end">
            <span className="text-muted-foreground [overflow-wrap:anywhere]">
              {props.environmentLabel}
            </span>
            {!props.enabled && !props.readOnly ? (
              <Button size="sm" variant="outline" onClick={props.onEnable}>
                启用 Antigravity
              </Button>
            ) : null}
          </div>
        }
      />
      {props.readOnly ? (
        <SettingsRow title="设置不可用" description="提供方设置为只读。" />
      ) : props.provider?.setup === undefined ? (
        <SettingsRow title="需要更新" description="更新此环境以管理 Antigravity。" />
      ) : (
        <ProviderSetupActions
          key={`${props.environmentId}:${props.instanceId}`}
          environmentId={props.environmentId}
          environmentLabel={props.environmentLabel}
          instanceId={props.instanceId}
          provider={props.provider}
          binaryPath={props.binaryPath}
          authMethod={props.authMethod ?? "oauth-personal"}
          enabled={props.enabled}
        />
      )}
    </section>
  );
}

function ProviderSetupActions({
  environmentId,
  environmentLabel,
  instanceId,
  provider,
  enabled,
  binaryPath,
}: Pick<
  ProviderSetupSectionProps,
  "environmentId" | "environmentLabel" | "instanceId" | "enabled" | "binaryPath"
> & {
  readonly provider: ServerProvider;
  readonly authMethod: AntigravityAuthMethod;
}) {
  const target = { environmentId, input: { instanceId } };
  const authQuery = useEnvironmentQuery(serverEnvironment.providerAuthState(target));
  const installQuery = useEnvironmentQuery(serverEnvironment.providerInstallState(target));
  const auth = authQuery.data;
  const installation = installQuery.data;
  const commandOptions = { reportFailure: false, reportDefect: false };
  const startInstall = useAtomCommand(serverEnvironment.startProviderInstall, commandOptions);
  const cancelInstall = useAtomCommand(serverEnvironment.cancelProviderInstall, commandOptions);
  const removeInstall = useAtomCommand(
    serverEnvironment.removeProviderInstallation,
    commandOptions,
  );
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const authActive =
    auth?.phase === "starting" || auth?.phase === "waiting" || auth?.phase === "verifying";
  const installActive =
    installation?.phase === "downloading" ||
    installation?.phase === "extracting" ||
    installation?.phase === "verifying";
  const usesCustomBinary = Boolean(binaryPath?.trim());
  const installed =
    provider.installed || (!usesCustomBinary && installation?.installedVersion != null);
  const queryError = authQuery.error ?? installQuery.error;
  const actionsDisabled = pendingLabel !== null || queryError !== null;
  const installationStatusMessage =
    installation?.phase === "downloading"
      ? `正在下载 ${(installation.downloadedBytes / 1_000_000).toFixed(1)} MB${installation.totalBytes === null ? "" : `，共 ${(installation.totalBytes / 1_000_000).toFixed(1)} MB`}。`
      : installation?.phase === "extracting"
        ? "正在解压 Antigravity。"
        : installation?.phase === "verifying"
          ? "正在检查下载的运行时。"
          : installed
            ? "已安装。"
            : usesCustomBinary
              ? enabled
                ? "配置的 Antigravity 运行时不可用。"
                : "尚未检查配置的 Antigravity 运行时。"
              : installation?.totalBytes
                ? `${Math.ceil(installation.totalBytes / 1_000_000)} MB 下载大小。`
                : "未安装。";

  async function runCommand<A, E>(
    label: string,
    request: () => Promise<AtomCommandResult<A, E>>,
  ): Promise<boolean> {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPendingLabel(label);
    setError(null);
    try {
      const result = await request();
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          const failure = squashAtomCommandFailure(result);
          setError(failure instanceof Error ? failure.message : "提供方设置失败。");
        }
        return false;
      }
      return true;
    } catch {
      setError("提供方设置失败。请重试。");
      return false;
    } finally {
      pendingRef.current = false;
      setPendingLabel(null);
    }
  }

  async function removeRuntime() {
    const confirmed = await ensureLocalApi().dialogs.confirm(
      `从 ${environmentLabel} 移除已下载的 Antigravity 运行时？Google 登录状态和会话历史会保留。`,
    );
    if (confirmed) {
      await runCommand("正在移除运行时", () => removeInstall(target));
    }
  }

  return (
    <div className="divide-y divide-border/50">
      <SettingsRow
        title="运行时"
        className="@max-lg/setup:[&>div:first-child]:flex @max-lg/setup:[&>div:first-child]:items-stretch @max-lg/setup:[&>div:first-child]:gap-3"
        description="安装并管理 Antigravity。"
        status={
          <div className="space-y-2">
            {usesCustomBinary ? (
              <p className="text-muted-foreground">
                使用下方的自定义可执行文件路径，安装后保留该路径。
              </p>
            ) : null}
            {!installed && !provider.setup?.canInstall ? (
              <p className="text-muted-foreground">
                无法自动安装。请设置可执行文件路径或使用其他环境。
              </p>
            ) : null}
          </div>
        }
        control={
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-56 sm:text-right">
            <p role="status" className="min-h-4 text-muted-foreground tabular-nums">
              {installationStatusMessage}
            </p>
            <div className="h-1">
              {installation?.phase === "downloading" &&
              installation.totalBytes !== null &&
              installation.totalBytes > 0 ? (
                <progress
                  aria-label="Antigravity 下载"
                  className="block h-1 w-full accent-foreground"
                  value={installation.downloadedBytes}
                  max={installation.totalBytes}
                />
              ) : null}
            </div>
            {!installActive &&
            installation?.message &&
            installation.message !== installationStatusMessage ? (
              <p className="text-muted-foreground [overflow-wrap:anywhere]">
                {installation.message}
              </p>
            ) : null}
            <div className="grid min-h-7 grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
              <div className="col-start-2 row-start-1 grid">
                {installActive && installation.operationId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionsDisabled}
                    onClick={() => {
                      const operationId = installation.operationId;
                      if (!operationId) return;
                      void runCommand("正在取消安装", () =>
                        cancelInstall({ environmentId, input: { instanceId, operationId } }),
                      );
                    }}
                  >
                    取消安装
                  </Button>
                ) : !installActive && provider.setup?.canInstall ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionsDisabled || installation === null || authActive}
                    onClick={() => void runCommand("正在开始安装", () => startInstall(target))}
                  >
                    {installation?.installedVersion
                      ? installation.version &&
                        installation.version !== installation.installedVersion
                        ? "更新 Antigravity"
                        : "重新安装 Antigravity"
                      : installation?.phase === "failed" || installation?.phase === "cancelled"
                        ? "重试安装"
                        : installed
                          ? "安装托管运行时"
                          : "安装 Antigravity"}
                  </Button>
                ) : null}
              </div>
              {installation?.canRemove && !installActive ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="col-start-1 row-start-1"
                        aria-label="移除已下载的运行时"
                        disabled={actionsDisabled || authActive}
                        onClick={() => void removeRuntime()}
                      />
                    }
                  >
                    <Trash2Icon className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipPopup>移除已下载的运行时</TooltipPopup>
                </Tooltip>
              ) : null}
            </div>
          </div>
        }
      />

      <ProviderAuthenticationSection
        environmentId={environmentId}
        environmentLabel={environmentLabel}
        instanceId={instanceId}
        provider={provider}
        readOnly={false}
      />

      <p className="sr-only" role="status">
        {pendingLabel ? `${pendingLabel}.` : null}
      </p>
      {error || queryError ? (
        <div className="grid gap-2 px-3 py-3 sm:px-4">
          <p role="alert" className="text-destructive [overflow-wrap:anywhere]">
            {error ?? queryError}
          </p>
          {queryError ? (
            <Button
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => {
                authQuery.refresh();
                installQuery.refresh();
              }}
            >
              重试检查配置状态
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
