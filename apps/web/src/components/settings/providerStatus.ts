import type {
  ServerProvider,
  ServerProviderVersionAdvisory,
  ServerProviderCompatibilityAdvisory,
} from "@t3tools/contracts";

/**
 * Visual treatment for each server-reported provider status. Centralized so
 * the default-driver card and per-instance cards share the same language.
 */
export const PROVIDER_STATUS_STYLES = {
  disabled: {
    dot: "bg-muted-foreground/50",
  },
  error: {
    dot: "bg-destructive",
  },
  ready: {
    dot: "bg-success",
  },
  warning: {
    dot: "bg-warning",
  },
} as const;

export type ProviderStatusKey = keyof typeof PROVIDER_STATUS_STYLES;

/**
 * Derive the headline + detail copy shown under a provider's name in the
 * settings page. Prefers `provider.message` for server-supplied detail and
 * falls back to generic phrasing when the server has not yet reported any
 * state — which happens before the first probe or when an instance names a
 * driver this build does not ship. A ready provider without account metadata
 * remains available and does not imply an authentication failure.
 */
export function getProviderSummary(provider: ServerProvider | undefined) {
  if (!provider) {
    return {
      headline: "正在检查提供方状态",
      detail: "正在等待服务器报告安装和身份验证详情。",
    };
  }
  if (!provider.enabled || provider.status === "disabled") {
    return {
      headline: "已禁用",
      detail: provider.message ?? "此提供方已安装，但在 FR Code 中已禁止新建会话。",
    };
  }
  if (!provider.installed) {
    return {
      headline: "未找到",
      detail: provider.message ?? "未在 PATH 中检测到 CLI。",
    };
  }
  if (provider.auth.status === "unauthenticated") {
    const authLabel = provider.auth.label ?? provider.auth.type;
    return {
      headline: authLabel ? `未验证身份 · ${authLabel}` : "未验证身份",
      detail: provider.message ?? null,
    };
  }
  if (provider.status === "warning") {
    return {
      headline: "需要处理",
      detail: provider.message ?? "提供方已安装，但服务器无法完全验证。",
    };
  }
  if (provider.status === "error") {
    return {
      headline: "不可用",
      detail: provider.message ?? "提供方启动检查失败。",
    };
  }
  if (provider.auth.status === "authenticated") {
    const authLabel = provider.auth.label ?? provider.auth.type;
    return {
      headline: authLabel ? `已验证身份 · ${authLabel}` : "已验证身份",
      detail: provider.message ?? null,
    };
  }
  return {
    headline: "可用",
    detail: provider.message ?? null,
  };
}

/**
 * Normalize a version string for display. Adds the `v` prefix when the
 * driver reported a bare version (e.g. `1.2.3`) so cards render
 * consistently regardless of driver.
 */
export function getProviderVersionLabel(version: string | null | undefined) {
  if (!version) return null;
  // Antigravity reports a release tag such as `agy_acp_server_20260818_01_RC01`.
  // Show the date and candidate so the row title keeps room for the name.
  const antigravity = /^agy_acp_server_(\d{4})(\d{2})(\d{2})_\d+(?:_(\w+))?$/.exec(version);
  if (antigravity) {
    const [, year, month, day, candidate] = antigravity;
    return `${year}-${month}-${day}${candidate ? ` ${candidate}` : ""}`;
  }
  // Only bare semver-like versions get a `v` prefix. Other tags are shown as-is.
  return /^\d/.test(version) ? `v${version}` : version;
}

const COMPATIBILITY_TITLES = {
  graceful: "支持受限",
  unsupported: "不支持的版本",
  broken: "已知有问题的版本",
} as const;

/** Compatibility guidance shares the version popover, with safe install actions. */
export function getProviderVersionAdvisoryPresentation(
  advisory: ServerProviderVersionAdvisory | undefined,
  compatibility?: ServerProviderCompatibilityAdvisory | undefined,
  showCompatibility = true,
): {
  readonly title: string;
  readonly detail: string;
  readonly updateCommand: string | null;
  readonly emphasis: "normal" | "strong";
  readonly targetVersion: string | null;
} | null {
  const latestIsIncompatible =
    compatibility?.latestVersionStatus === "broken" ||
    compatibility?.latestVersionStatus === "unsupported";
  if (
    showCompatibility &&
    compatibility &&
    (compatibility.status === "graceful" ||
      compatibility.status === "unsupported" ||
      compatibility.status === "broken")
  ) {
    const targetVersion = compatibility.recommendedVersion;
    const recommendation = getProviderVersionLabel(targetVersion) ?? compatibility.recommendedRange;
    return {
      title: COMPATIBILITY_TITLES[compatibility.status],
      detail:
        compatibility.message ??
        (recommendation ? `使用 ${recommendation} 以获得完整支持。` : "更新以获得完整支持。"),
      updateCommand:
        targetVersion || latestIsIncompatible ? null : (advisory?.updateCommand ?? null),
      emphasis: compatibility.status === "graceful" ? "normal" : "strong",
      targetVersion,
    };
  }
  if (
    !advisory ||
    advisory.status === "current" ||
    advisory.status === "unknown" ||
    latestIsIncompatible
  ) {
    return null;
  }

  const label = "有可用更新";
  const version = advisory.latestVersion;
  const versionLabel = getProviderVersionLabel(version);

  return {
    title: label,
    detail:
      advisory.message ??
      (versionLabel ? `${label}：安装 ${versionLabel}。` : `${label}：安装最新提供方版本。`),
    updateCommand: advisory.updateCommand,
    emphasis: "normal" as const,
    targetVersion: null,
  };
}
