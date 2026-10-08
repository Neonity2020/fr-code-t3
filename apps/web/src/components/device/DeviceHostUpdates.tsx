import type { DeviceServiceState, EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { deviceEnvironment } from "~/state/device";
import { useAtomCommand } from "~/state/use-atom-command";

/** Shared by setup, Settings, and the Device panel so automatic updates stay visible. */
export function DeviceHostUpdates({
  state,
  environmentId,
}: {
  state: DeviceServiceState;
  environmentId: EnvironmentId;
}) {
  const retry = useAtomCommand(deviceEnvironment.list);
  const [pending, setPending] = useState<string | null>(null);
  if (state.hostStatus === "disabled") return null;
  return (
    <div className="space-y-2">
      {state.hosts.map((host) => {
        const status = state.hostStatuses[host.id];
        if (!status || !["installing", "starting", "failed"].includes(status.status)) return null;
        const failed = status.status === "failed";
        return (
          <div
            key={host.id}
            role={failed ? "alert" : "status"}
            className="flex items-start gap-3 rounded-md border border-border/60 px-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{host.label}</p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">
                {status.detail ??
                  (failed
                    ? "设备支持无法启动。"
                    : status.status === "installing"
                      ? "正在安装设备工具…"
                      : "正在启动设备工具…")}
              </p>
              {failed ? (
                <p className="mt-1 text-muted-foreground">
                  请检查主机连接和网络后重试。设备设置已保存。
                </p>
              ) : null}
            </div>
            {failed && state.supportsHostRetry ? (
              <Button
                size="compact"
                variant="outline"
                disabled={pending !== null}
                onClick={() => {
                  setPending(host.id);
                  void retry({ environmentId, input: { retryHostId: host.id } }).finally(() =>
                    setPending(null),
                  );
                }}
              >
                {pending === host.id ? "正在重试…" : "重试"}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
