import {
  isModifierPairShortcut,
  type DesktopCaptureConfigApplied,
  type DesktopCaptureConfigPreview,
  type DesktopSnapShotState,
} from "@t3tools/contracts";
import { parseKeybindingShortcut } from "@t3tools/shared/keybindings";
import { FileDiff } from "@pierre/diffs/react";
import { parseDiffFromFile } from "@pierre/diffs";
import { useMemo, useState } from "react";
import { getDesktopSnapShotBridge } from "../../lib/desktopSnapShot";
import { resolveDiffThemeName } from "../../lib/diffRendering";
import { useTheme } from "../../hooks/useTheme";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { shortcutToKeybindingInput } from "./KeybindingsSettings.logic";
import { useSnapShotShortcutRecorder } from "./useSnapShotShortcutRecorder";

const DEFAULT_SHORTCUT = parseKeybindingShortcut("Ctrl+Shift+2")!;

/** Wizard-owned config review; config contents never leave the desktop bridge. */
export function CaptureShortcutConfig({
  state,
  disabled = false,
  onBusyChange,
  onSaved,
  onComplete,
}: {
  state: DesktopSnapShotState;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onSaved?: () => Promise<unknown>;
  onComplete?: () => Promise<void>;
}) {
  const bridge = getDesktopSnapShotBridge();
  const { resolvedTheme } = useTheme();
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [preview, setPreview] = useState<DesktopCaptureConfigPreview | null>(null);
  const [result, setResult] = useState<DesktopCaptureConfigApplied | null>(null);
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  const [working, setWorking] = useState<"reading" | "writing" | null>(null);
  const [keys, setKeys] = useState<string | null>(null);
  const [customFile, setCustomFile] = useState(false);
  const busy = disabled || working !== null;
  const supported = Boolean(bridge?.previewSnapShotConfig && bridge.applySnapShotConfig);
  const changed = preview !== null && preview.before !== preview.after;
  const niri = state.linuxBackend === "niri";
  const desktop = niri ? "Niri" : "Hyprland";
  const shortcutKeys = (keys ?? preview?.shortcut)?.trim();
  const recorder = useSnapShotShortcutRecorder({
    shortcut: shortcutKeys
      ? (parseKeybindingShortcut(shortcutKeys.replace(/super/gi, "meta")) ?? DEFAULT_SHORTCUT)
      : DEFAULT_SHORTCUT,
    disabled: busy,
    allowModifierPairs: false,
    onStart: () => setError(null),
    onError: (message) => setError({ message }),
    onRecord: (shortcut) => {
      if (isModifierPairShortcut(shortcut)) return;
      setKeys(
        shortcutToKeybindingInput({
          ...shortcut,
          ctrlKey: shortcut.ctrlKey || shortcut.modKey,
          modKey: false,
        }),
      );
      setPreview(null);
      setError(null);
    },
  });
  const actionBusy = busy || recorder.recording;
  const diff = useMemo(
    () =>
      preview && changed
        ? parseDiffFromFile(
            { name: preview.path, contents: preview.before },
            { name: preview.path, contents: preview.after },
          )
        : null,
    [preview, changed],
  );
  const begin = (phase: "reading" | "writing") => {
    setWorking(phase);
    onBusyChange?.(true);
    setError(null);
  };
  const end = () => {
    setWorking(null);
    onBusyChange?.(false);
  };
  const read = async (chooseFile = customFile, operation: "install" | "remove" = "install") => {
    if (actionBusy || !bridge?.previewSnapShotConfig) return;
    begin("reading");
    setPreview(null);
    setResult(null);
    setCustomFile(chooseFile);
    try {
      setPreview(
        await bridge.previewSnapShotConfig({
          operation,
          chooseFile,
          ...(keys?.trim() ? { shortcut: keys.trim() } : {}),
        }),
      );
    } catch (cause) {
      setError({
        message: "无法准备更改。请查看高级设置获取帮助。",
        ...(cause instanceof Error ? { detail: cause.message } : {}),
      });
    } finally {
      end();
    }
  };
  const apply = async () => {
    if (actionBusy || !preview || !bridge?.applySnapShotConfig) return;
    begin("writing");
    try {
      const applied = await bridge.applySnapShotConfig(preview.id);
      setResult(applied);
      await onSaved?.();
      if (!applied.warning && preview.operation === "install" && onComplete) {
        toastManager.add({
          type: "success",
          title: "快捷键已保存",
          description: `可在其他应用中使用 ${preview.shortcut}。`,
        });
        await onComplete();
      }
    } catch (cause) {
      setError({
        message: "无法保存快捷键。请检查更改后重试。",
        ...(cause instanceof Error ? { detail: cause.message } : {}),
      });
      setPreview(null);
    } finally {
      end();
    }
  };

  return (
    <div className="space-y-4 text-sm">
      {!result ? (
        <div className="flex items-center justify-between gap-3">
          <span>快捷键</span>
          {recorder.input}
        </div>
      ) : null}
      {recorder.recording ? (
        <p role="status" className="text-xs text-muted-foreground">
          请按下快捷键，按 Esc 取消。
        </p>
      ) : null}
      {result ? (
        <p role="status">
          {result.warning
            ? "已保存，但快捷键需要处理。请查看高级设置获取帮助。"
            : preview?.operation === "remove"
              ? "快捷键已移除。"
              : `可在其他应用中使用 ${preview?.shortcut} 捕获窗口。`}
        </p>
      ) : preview ? (
        <>
          <p className="text-muted-foreground">
            {changed
              ? preview.operation === "remove"
                ? "检查下方更改以移除快捷键。"
                : "检查下方更改后保存快捷键。"
              : preview.operation === "remove"
                ? "没有可移除的捕获快捷键。"
                : "此快捷键已设置。"}
          </p>
          {diff ? (
            <div
              className="max-h-80 overflow-auto rounded-lg border text-xs"
              aria-label="快捷键更改"
            >
              <FileDiff
                fileDiff={diff}
                options={{
                  diffStyle: "unified",
                  theme: resolveDiffThemeName(resolvedTheme),
                  overflow: "wrap",
                }}
              />
            </div>
          ) : null}
          {changed ? (
            <p className="text-xs text-muted-foreground">仅保存这些更改，并保留备份。</p>
          ) : null}
          <div className="flex gap-2">
            {changed || preview.operation === "install" ? (
              <Button
                disabled={
                  actionBusy ||
                  (preview.operation === "install" && state.shortcutActionRegistered === false)
                }
                aria-busy={working === "writing"}
                onClick={() => void apply()}
              >
                {working === "writing"
                  ? "正在保存…"
                  : changed
                    ? preview.operation === "install"
                      ? "保存快捷键"
                      : "移除快捷键"
                    : "完成"}
              </Button>
            ) : null}
            <Button variant="ghost" disabled={actionBusy} onClick={() => setPreview(null)}>
              取消
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-muted-foreground">
            允许 FR Code 读取桌面设置。保存前，您可在此检查全部更改。
          </p>
          <Button
            disabled={actionBusy || !supported}
            aria-busy={working === "reading"}
            onClick={() => void read()}
          >
            {working === "reading" ? "正在准备更改…" : "检查更改"}
          </Button>
          {!supported ? (
            <p className="text-xs text-muted-foreground">请更新 FR Code 以完成快捷键配置。</p>
          ) : null}
        </>
      )}
      {error ? (
        <p role="alert" className="text-destructive">
          {error.message}
        </p>
      ) : null}
      {state.shortcutActionRegistered === false && state.shortcutMessage ? (
        <p role="status" className="text-muted-foreground">
          {state.shortcutPending ? "正在连接桌面端…" : "重启 FR Code 以完成快捷键连接。"}
        </p>
      ) : null}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">高级</summary>
        <div className="mt-3 space-y-3">
          {error?.detail || result?.warning ? (
            <div className="space-y-1">
              <p className="font-medium text-foreground">故障排查</p>
              <p className="break-words">{error?.detail ?? result?.warning}</p>
            </div>
          ) : null}
          <div className="space-y-1">
            <p className="font-medium text-foreground">设置文件</p>
            <p className="break-all font-mono">
              {preview?.path ??
                state.shortcutConfigPath ??
                (niri ? "~/.config/niri/config.kdl" : "~/.config/hypr/hyprland.conf")}
            </p>
            {niri ? <p>FR Code 也会读取此文件引用的其他文件。</p> : null}
            {preview && preview.resolvedPath !== preview.path ? (
              <p className="break-all">关联到 {preview.resolvedPath}。关联将被保留。</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={actionBusy || !supported}
              onClick={() => void read(true)}
            >
              选择其他文件…
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={actionBusy || !supported}
              onClick={() => void read(customFile, "remove")}
            >
              移除快捷键…
            </Button>
            {result ? (
              <Button
                size="sm"
                variant="outline"
                disabled={actionBusy || !supported}
                onClick={() => void read()}
              >
                检查更改
              </Button>
            ) : null}
          </div>
          <p>
            使用桌面环境的快捷键设置文件。{" "}
            {niri
              ? "自定义 --config 或 NIRI_CONFIG 可更改其位置。"
              : "在 Omarchy 上，请使用自己的快捷键文件。"}
          </p>
          {result?.backupPath ? <p className="break-all">备份： {result.backupPath}</p> : null}
          <p className="font-medium text-foreground">手动配置</p>
          <p>
            {niri
              ? "将此内容粘贴到 Niri 配置中的 binds { … } 内，然后保存。"
              : "将此快捷键添加到 Hyprland 配置，然后保存。"}{" "}
            可按需更改按键。
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-muted/50 p-3">
            {state.shortcutBinding}
          </pre>
          <Button
            size="sm"
            variant="outline"
            disabled={actionBusy || !state.shortcutBinding}
            onClick={() => {
              if (state.shortcutBinding) copyToClipboard(state.shortcutBinding);
            }}
          >
            {isCopied ? "已复制" : "复制快捷键"}
          </Button>
          <p>
            在 FR Code 中关闭截图可停止该功能。要释放按键，请从以下位置移除快捷键： {desktop} 。
          </p>
          {state.shortcutActionRegistered === false ? (
            <p role="status">{state.shortcutMessage}</p>
          ) : null}
          {onComplete ? (
            <Button
              size="sm"
              variant="outline"
              disabled={actionBusy || state.shortcutActionRegistered === false}
              onClick={() => void onComplete()}
            >
              我已添加快捷键
            </Button>
          ) : null}
        </div>
      </details>
    </div>
  );
}
