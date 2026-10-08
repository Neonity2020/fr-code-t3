import type { DesktopUpdateActionResult, DesktopUpdateState } from "@t3tools/contracts";

export type DesktopUpdateButtonAction = "download" | "install" | "none";

const DESKTOP_RELEASE_HISTORY_URL = "https://github.com/pingdotgg/t3code/releases";
const DESKTOP_RELEASE_TAG_URL = `${DESKTOP_RELEASE_HISTORY_URL}/tag`;

/**
 * The main process fills `downloadedVersion` from the updater's `update-downloaded`
 * event, which is dispatched on its own fiber. A download RPC can therefore resolve
 * before that write lands, so fall back to the version the download was started for.
 */
export function getDesktopUpdateDownloadedVersion(state: DesktopUpdateState): string | null {
  return state.downloadedVersion ?? state.availableVersion;
}

/** Release notes for an exact downloaded build; nightly suffixes are part of the tag. */
export function getDesktopUpdateReleaseUrl(version: string | null): string | null {
  const normalizedVersion = version?.trim();
  if (!normalizedVersion) return null;
  return `${DESKTOP_RELEASE_TAG_URL}/v${encodeURIComponent(normalizedVersion)}`;
}

export function getDesktopUpdateReleaseHistoryUrl(): string {
  return DESKTOP_RELEASE_HISTORY_URL;
}

export function resolveDesktopUpdateButtonAction(
  state: DesktopUpdateState,
): DesktopUpdateButtonAction {
  if (
    state.downloadedVersion &&
    (state.status === "downloaded" ||
      (state.status === "error" &&
        (state.errorContext === null || state.errorContext === "install")))
  ) {
    return "install";
  }
  if (state.status === "available") {
    return "download";
  }
  if (state.status === "error") {
    if (state.errorContext === "download" && state.availableVersion) {
      return "download";
    }
  }
  return "none";
}

export function shouldShowArm64IntelBuildWarning(state: DesktopUpdateState | null): boolean {
  return state?.hostArch === "arm64" && state.appArch === "x64";
}

export function isDesktopUpdateButtonDisabled(state: DesktopUpdateState | null): boolean {
  return state?.status === "downloading";
}

export function getArm64IntelBuildWarningDescription(state: DesktopUpdateState): string {
  if (!shouldShowArm64IntelBuildWarning(state)) {
    return "此安装版本使用了正确的架构。";
  }

  const action = resolveDesktopUpdateButtonAction(state);
  if (action === "download") {
    return "此 Mac 使用 Apple 芯片，但 FR Code 仍通过 Rosetta 运行 Intel 版本。请下载可用更新以切换到原生 Apple 芯片版本。";
  }
  if (action === "install") {
    return "此 Mac 使用 Apple 芯片，但 FR Code 仍通过 Rosetta 运行 Intel 版本。请重启以安装已下载的 Apple 芯片版本。";
  }
  return "此 Mac 使用 Apple 芯片，但 FR Code 仍通过 Rosetta 运行 Intel 版本。下次应用更新会替换为原生 Apple 芯片版本。";
}

export function getDesktopUpdateButtonTooltip(state: DesktopUpdateState): string {
  if (state.status === "available") {
    return `更新 ${state.availableVersion ?? "available"} 已可下载`;
  }
  if (state.status === "downloading") {
    const progress =
      typeof state.downloadPercent === "number" ? ` (${Math.floor(state.downloadPercent)}%)` : "";
    return `正在下载更新${progress}`;
  }
  if (state.status === "downloaded") {
    return `更新 ${state.downloadedVersion ?? state.availableVersion ?? "ready"} 已下载，点击重启并安装。`;
  }
  if (state.status === "error") {
    if (state.errorContext === "download" && state.availableVersion) {
      return `下载 ${state.availableVersion} 失败，点击重试。`;
    }
    if (state.errorContext === "install" && state.downloadedVersion) {
      return `安装 ${state.downloadedVersion} 失败，点击重试。`;
    }
    if (state.downloadedVersion) {
      return `更新 ${state.downloadedVersion} 已下载，点击重启并安装。`;
    }
    return state.message ?? "更新失败";
  }
  return "已是最新版本";
}

export function getDesktopUpdateInstallConfirmationMessage(
  state: Pick<DesktopUpdateState, "availableVersion" | "downloadedVersion">,
): string {
  const version = state.downloadedVersion ?? state.availableVersion;
  return `安装更新${version ? ` ${version}` : ""}并重启 FR Code？\n\n运行中的任务将被中断，请确认已准备好再继续。`;
}

export function getDesktopUpdateActionError(result: DesktopUpdateActionResult): string | null {
  if (!result.accepted || result.completed) return null;
  if (typeof result.state.message !== "string") return null;
  const message = result.state.message.trim();
  return message.length > 0 ? message : null;
}

export function shouldToastDesktopUpdateActionResult(result: DesktopUpdateActionResult): boolean {
  return getDesktopUpdateActionError(result) !== null;
}

export function canCheckForUpdate(state: DesktopUpdateState | null): boolean {
  if (!state || !state.enabled) return false;
  return (
    state.status !== "checking" && state.status !== "downloading" && state.status !== "disabled"
  );
}
