import { useState } from "react";
import * as Option from "effect/Option";
import type { SshDeviceHostConfig } from "@t3tools/contracts";
import { CheckIcon, MonitorIcon, XIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { DeviceHostAvailability } from "../device/DeviceHostAvailability";
import { useHostConnectionChecks } from "./useHostConnectionChecks";
import {
  deviceHostConnectionKey,
  parseDeviceHostDraft,
  type DeviceHostCheckTarget,
} from "./deviceHostConnectionChecks";

export function DeviceHostEditor({
  host,
  isNew,
  targets,
  busy,
  onSave,
  onClose,
}: {
  host: SshDeviceHostConfig;
  isNew: boolean;
  targets: ReadonlyArray<DeviceHostCheckTarget>;
  busy: boolean;
  onSave: (host: SshDeviceHostConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(host);
  const { checks, testConnection } = useHostConnectionChecks(targets);
  const results = checks[deviceHostConnectionKey(draft)];
  const checking = Object.values(results ?? {}).some((check) => check.status === "pending");
  const input = parseDeviceHostDraft({ ...draft, label: draft.label.trim() || draft.target });
  const valid = Option.isSome(input);
  const failed = Object.values(results ?? {}).filter((check) => check.status === "failed").length;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogPopup
        showCloseButton={!busy}
        render={
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (Option.isSome(input) && draft.label.trim() && !busy && !checking)
                onSave(input.value);
            }}
          />
        }
      >
        <DialogHeader>
          <DialogTitle>{isNew ? "添加设备主机" : "编辑设备主机"}</DialogTitle>
          <DialogDescription>
            {targets.length === 1
              ? `从 ${targets[0]?.label} 连接。`
              : `从 ${targets.length} 个所选环境连接。`}{" "}
            同一机器上的主机会被跳过。
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <label className="block space-y-1.5 text-sm">
            <span>名称</span>
            <Input
              autoFocus
              required
              value={draft.label}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              placeholder="Mac mini"
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span>SSH 目标</span>
            <Input
              required
              value={draft.target}
              disabled={busy}
              onChange={(event) => setDraft({ ...draft, target: event.target.value })}
              placeholder="user@host 或 SSH 别名"
            />
          </label>
          <details
            open={host.port !== undefined || host.identityFile !== undefined || undefined}
            className="text-sm"
          >
            <summary className="cursor-pointer text-muted-foreground">SSH 选项</summary>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <label className="block space-y-1.5">
                <span>身份文件</span>
                <Input
                  value={draft.identityFile ?? ""}
                  disabled={busy}
                  onChange={(event) => {
                    const { identityFile: _, ...rest } = draft;
                    setDraft(
                      event.target.value ? { ...rest, identityFile: event.target.value } : rest,
                    );
                  }}
                  placeholder="SSH 配置默认值"
                />
              </label>
              <label className="block space-y-1.5">
                <span>端口</span>
                <Input
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.port ?? ""}
                  disabled={busy}
                  onChange={(event) => {
                    const { port: _, ...rest } = draft;
                    setDraft(
                      event.target.value ? { ...rest, port: Number(event.target.value) } : rest,
                    );
                  }}
                  placeholder="默认"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">可选。在每个环境中分别解析。</p>
          </details>
          <div className="rounded-lg border border-border/60">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <p role="status" className="text-xs text-muted-foreground">
                {checking
                  ? "正在检查环境…"
                  : results
                    ? failed
                      ? `${targets.length} 项中有 ${failed} 项失败`
                      : "连接检查已通过"
                    : "保存前检查访问权限"}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || checking || !valid}
                onClick={() => {
                  if (Option.isSome(input)) void testConnection(input.value);
                }}
              >
                {checking ? <Spinner size="xs" /> : null} 测试连接
              </Button>
            </div>
            {results ? (
              <ul className="border-t border-border/60 divide-y divide-border/40">
                {targets.map((target) => {
                  const result = results[target.environmentId];
                  if (!result) return null;
                  return (
                    <li key={target.environmentId} className="px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate font-medium">{target.label}</span>
                        <span
                          className={`flex shrink-0 items-center gap-1.5 ${result.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {result.status === "pending" ? (
                            <>
                              <Spinner size="xs" /> 正在检查…
                            </>
                          ) : result.status === "local" ? (
                            <>
                              <MonitorIcon className="size-3" /> 本地已可用
                            </>
                          ) : result.status === "failed" ? (
                            <>
                              <XIcon className="size-3" /> 失败
                            </>
                          ) : (
                            <>
                              <CheckIcon className="size-3" /> 已连接
                            </>
                          )}
                        </span>
                      </div>
                      {result.status === "connected" ? (
                        <div className="mt-1.5">
                          <DeviceHostAvailability platforms={result.platforms} />
                        </div>
                      ) : null}
                      {result.status === "failed" ? (
                        <details className="mt-1.5 text-muted-foreground">
                          <summary className="cursor-pointer">显示错误</summary>
                          <p className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words">
                            {result.error}
                          </p>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={busy || checking || !valid || !draft.label.trim()}>
            {busy ? <Spinner size="xs" /> : null} 保存主机
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
