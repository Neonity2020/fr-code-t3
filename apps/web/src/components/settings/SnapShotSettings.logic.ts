import type { ClientSettingsPatch, DesktopSnapShotState, SnapShotSound } from "@t3tools/contracts";
import {
  captureSetupBackend,
  captureSetupDesktopName,
  captureSetupAccessReady,
  captureSetupMacPermissionsReady,
} from "./SnapShotSetupDialog.logic";

export function snapShotStatus(state: DesktopSnapShotState | null, enabled: boolean): string {
  if (!state) return "Checking snapshots…";
  if (state.mode === "unavailable") return state.message ?? "Not supported on this platform.";
  if (!enabled) return "Turn this on to set up snapshots.";
  return snapShotSetupSummary(state, enabled);
}

export function snapShotSetupSummary(state: DesktopSnapShotState, enabled: boolean): string {
  if (state.message) return "捕获需要处理";
  if (state.linuxBackend === "hyprland" && state.hyprlandHelper?.status !== "ready")
    return state.hyprlandHelper?.status === "error"
      ? "在设置中检查捕获权限"
      : "安装捕获辅助程序以继续";
  if (captureSetupBackend(state) === "gnome" && state.gnomeExtension?.status !== "enabled")
    return "设置当前窗口快照";
  if (captureSetupBackend(state) === "kde" && state.kdeHelper?.status !== "ready")
    return state.kdeHelper?.status === "error" ? "在设置中检查捕获权限" : "安装捕获辅助程序以继续";
  if (captureSetupBackend(state) === "picker") return "仅手动捕获 — 每次需选择窗口";
  if (!enabled) return "启用捕获以继续";
  if (state.shortcutPending)
    return state.linuxBackend === "hyprland" ? "正在连接快捷键…" : "正在等待快捷键权限";
  if (state.shortcutVerified) return "已可捕获";
  if (state.linuxBackend === "niri" && state.shortcutBinding) return "在其他应用中使用快捷键";
  if (state.linuxBackend === "hyprland" && state.shortcutActionRegistered)
    return "在其他应用中使用快捷键";
  if (state.shortcutRegistered) return state.shortcutLabel ? "已可捕获" : "快捷键已保存";
  return "完成快捷键设置";
}

export function snapShotShortcutStatus(state: DesktopSnapShotState | null): string | null {
  if (!state) return null;
  if (state.linuxBackend === "hyprland") return state.shortcutMessage;
  if (state.shortcutPending) return "Approve the shortcut permission prompt to continue.";
  if (state.shortcutRegistered) return state.mode === "portal" ? null : "Shortcut saved.";
  return state.shortcutMessage;
}

export function snapShotSetupButtonLabel(state: DesktopSnapShotState | null): string {
  if (!state) return "继续设置";
  if (captureSetupAccessReady(state)) return "管理捕获";
  const desktop = captureSetupDesktopName(state);
  return desktop ? `设置 ${desktop} 捕获` : "继续设置";
}

// Windows needs no permissions or setup: turning capture on is enough. macOS setup
// has nothing left to manage once permissions and the shortcut are in place; the
// shortcut row stays editable inline. Revoking a permission brings the button back
// as "Continue setup" through the state message.
export function snapShotSetupComplete(
  state: DesktopSnapShotState | null,
  includeAccessibility: boolean,
): boolean {
  if (state?.windows) return true;
  return (
    state?.macPermissions !== undefined &&
    captureSetupAccessReady(state) &&
    captureSetupMacPermissionsReady(state, includeAccessibility) &&
    state.shortcutRegistered
  );
}

export type SnapShotSoundSelection = SnapShotSound | "off";

export function snapShotFeedbackUnavailableMessage(
  state: DesktopSnapShotState | null,
): string | undefined {
  if (state?.mode !== "portal" || state.linuxFeedbackAvailable) return undefined;
  if (state.linuxBackend === "hyprland")
    return state.hyprlandHelper?.status === "ready"
      ? "此桌面不支持捕获效果。"
      : "安装或更新捕获辅助程序以启用效果。";
  if (state.linuxBackend === "niri") return "Niri 不支持捕获效果。";
  if (state.linuxBackend === "kde")
    return state.kdeHelper?.status === "ready"
      ? "此桌面不支持捕获效果。"
      : "安装或更新捕获辅助程序以启用效果。";
  return state.linuxBackend === "gnome-extension"
    ? "更新 GNOME 扩展，然后注销并重新登录以启用效果。"
    : captureSetupBackend(state) === "gnome"
      ? "完成扩展设置以启用效果。"
      : "此桌面不支持捕获效果。";
}

export function snapShotDescription(state: DesktopSnapShotState | null): string {
  return state?.mode === "portal" && captureSetupBackend(state) === "picker"
    ? "此处不支持自动捕获。请选择一个窗口。"
    : "捕获窗口并附加到当前草稿。";
}

export function snapShotAccessibilityUnavailableMessage(
  state: DesktopSnapShotState | null,
): string | undefined {
  if (state?.mode !== "portal") return undefined;
  if (state.linuxBackend === "picker" || state.linuxBackend === "screenshot-portal")
    return "此桌面仅支持截图。";
  return undefined;
}

export function snapShotUnavailableMessage(hasBridge: boolean): string | undefined {
  if (hasBridge) return undefined;
  return typeof window !== "undefined" && window.desktopBridge
    ? "更新桌面应用以使用快照。"
    : "仅桌面应用可用。";
}

export function snapShotSoundPatch(sound: SnapShotSoundSelection): ClientSettingsPatch {
  return sound === "off"
    ? { snapShotPlaySound: false }
    : { snapShotPlaySound: true, snapShotSound: sound };
}

export function createRecordingRequestTracker() {
  let currentRequest: symbol | null = null;

  return {
    tryBegin() {
      if (currentRequest) return null;
      currentRequest = Symbol();
      return currentRequest;
    },
    clear() {
      currentRequest = null;
    },
    owns(request: symbol) {
      return currentRequest === request;
    },
  };
}
