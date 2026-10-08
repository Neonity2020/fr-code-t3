import type { ExecutionEnvironmentPlatformOs, FileManagerRevealKind } from "@t3tools/contracts";

export function revealInFileExplorerLabel(platform: string): string {
  const normalized = platform.toLowerCase();
  if (normalized.includes("mac")) return "在访达中显示";
  if (normalized.includes("win")) return "在文件资源管理器中显示";
  return "在文件管理器中显示";
}

/** Same wording keyed by an environment's reported OS rather than a
    navigator platform string, for actions that reveal on the server machine. */
export function revealInFileExplorerLabelForOs(os: ExecutionEnvironmentPlatformOs): string {
  if (os === "darwin") return "在访达中显示";
  if (os === "windows") return "在文件资源管理器中显示";
  return "在文件管理器中显示";
}

/** Server-selected wording, including Windows File Explorer reached from WSL. */
export function revealInFileExplorerLabelForKind(kind: FileManagerRevealKind): string {
  if (kind === "finder") return "在访达中显示";
  if (kind === "file-explorer") return "在文件资源管理器中显示";
  return "在文件管理器中显示";
}
