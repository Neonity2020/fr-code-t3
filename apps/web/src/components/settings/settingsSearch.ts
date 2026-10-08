import { isElectron } from "~/env";
import { isMacPlatform, isWindowsPlatform, normalizeSearchText } from "~/lib/utils";
import { STATIC_KEYBINDING_COMMANDS, type KeybindingCommand } from "@t3tools/contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import { DEFAULT_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { commandLabel } from "./KeybindingsSettings.logic";
import {
  validateSettingsScopeSearch,
  type ResolvedSettingsScope,
  type SettingsScopeSearch,
} from "./settingsScope";

export type SettingsPath =
  | "/settings/projects"
  | "/settings/general"
  | "/settings/appearance"
  | "/settings/keybindings"
  | "/settings/snap-shot"
  | "/settings/providers"
  | "/settings/integrations"
  | "/settings/scheduled-tasks"
  | "/settings/source-control"
  | "/settings/storage"
  | "/settings/connections"
  | "/settings/archived";

/**
 * Where a setting can be edited. Device-local rows have no scope: they render
 * at every selection. `project-defaults` rows accept project overrides, so
 * they are reachable from any server-backed selection.
 */
export type SettingsSearchScope =
  | "environment"
  | "environment-defaults"
  | "project-defaults"
  | "project"
  | "checkout"
  | "connections";

export interface SettingsSearchItem {
  readonly id: string;
  readonly title: string;
  readonly to: SettingsPath;
  readonly targetId?: string;
  /** Descriptions, option labels, and aliases people may remember instead of the title. */
  readonly searchTerms?: ReadonlyArray<string>;
  readonly scope?: SettingsSearchScope;
  // Its row only renders in the desktop app, so a browser result would land on
  // an anchor that isn't there.
  readonly desktopOnly?: boolean;
  readonly macOnly?: boolean;
  // Its row only renders on Windows desktop, so other desktop platforms must
  // not expose a result that points to a missing anchor.
  readonly windowsOnly?: boolean;
  readonly cloudOnly?: boolean;
  readonly environmentOnly?: boolean;
  readonly providerSettingsOnly?: boolean;
  readonly macProviderSettingsOnly?: boolean;
  readonly localBackendManagementOnly?: boolean;
  readonly localEnvironmentOnly?: boolean;
  readonly wslAvailableOnly?: boolean;
  // Its row only renders while this environment's T3 Connect managed tunnel is on.
  readonly managedTunnelOnly?: boolean;
  /**
   * Sorts after every other match. Keybinding commands mirror rows on other
   * surfaces, so "model" must still lead with Default model, not Model Picker.
   */
  readonly secondary?: boolean;
  readonly requiresThreadAutoSettlement?: boolean;
}

export interface SettingsSearchAvailability {
  readonly localEnvironmentDisabled?: boolean;
  readonly hasCloudPublicConfig: boolean;
  readonly hasEnvironment: boolean;
  readonly hasProviderSettingsEnvironment: boolean;
  readonly hasMacProviderSettingsEnvironment: boolean;
  readonly canManageLocalBackend: boolean;
  readonly isWslSettingsRowVisible: boolean;
  readonly hasThreadAutoSettlement: boolean;
  readonly managedTunnelActive?: boolean;
}

/**
 * Section labels in sidebar order. The sidebar nav and the search-result
 * subtitles both render from this record, so each label exists once.
 */
export const SETTINGS_SECTION_LABELS: Readonly<Record<SettingsPath, string>> = {
  "/settings/projects": "项目",
  "/settings/general": "常规",
  "/settings/appearance": "外观",
  "/settings/keybindings": "快捷键",
  "/settings/snap-shot": "快照",
  "/settings/providers": "提供方",
  "/settings/integrations": "集成",
  "/settings/scheduled-tasks": "定时任务",
  "/settings/source-control": "版本控制",
  "/settings/storage": "存储",
  "/settings/connections": "连接",
  "/settings/archived": "归档",
};

/** Anchor id of the first row bound to `command` on the Keybindings page. */
export function keybindingSearchAnchorId<Command extends KeybindingCommand>(command: Command) {
  return `keybinding-${command}` as const;
}

/**
 * One result per built-in command, alphabetical by label. The anchor is
 * the command's first row; default keys are searchable so "mod+b" lands on
 * Sidebar: Toggle. A command with no default binding may have no row, so it
 * points at the section instead.
 */
const KEYBINDING_SEARCH_ITEMS = STATIC_KEYBINDING_COMMANDS.toSorted((left, right) =>
  commandLabel(left).localeCompare(commandLabel(right)),
).map((command) => {
  const defaultKeys = DEFAULT_KEYBINDINGS.filter((binding) => binding.command === command).map(
    (binding) => binding.key,
  );
  return {
    id: keybindingSearchAnchorId(command),
    title: commandLabel(command),
    to: "/settings/keybindings" as const,
    searchTerms: [command, ...defaultKeys],
    secondary: true,
    ...(defaultKeys.length === 0 ? { targetId: "keybindings" } : {}),
  };
});

/**
 * Searchable settings and stable destinations, in result order. Rows with a
 * dedicated anchor render their id and title via `searchableSetting`; items
 * that may not be mounted point at their nearest stable section instead.
 */
export const SETTINGS_SEARCH_ITEMS = [
  {
    id: "storage-worktrees",
    title: "工作树清理",
    to: "/settings/storage",
    scope: "project-defaults",
    searchTerms: [
      "disk storage delete deleted archived threads old inactive merged unchanged worktrees retention days project inherit off custom",
    ],
  },
  {
    id: "storage-worktrees-location",
    title: "工作树位置",
    to: "/settings/storage",
    scope: "environment-defaults",
    searchTerms: ["worktree location folder directory path drive external disk"],
  },
  {
    id: "storage-artifacts",
    title: "产物与日志",
    to: "/settings/storage",
    scope: "environment-defaults",
    searchTerms: ["disk storage browser screenshots captures rotated logs cleanup retention"],
  },
  {
    id: "project-defaults",
    title: "项目默认值与覆盖设置",
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["model workspace environments projects inheritance checkout"],
  },
  {
    id: "project-overview",
    title: "项目概览",
    to: "/settings/projects",
    searchTerms: ["name icon emoji image checkout remove delete"],
  },
  {
    id: "default-model",
    title: "默认模型",
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["new thread project provider reasoning effort"],
  },
  {
    id: "default-permissions",
    title: "权限",
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: [
      "new thread default runtime mode supervised approvals auto accept edits full access",
    ],
  },
  {
    id: "color-scheme",
    title: "配色方案",
    to: "/settings/appearance",
    searchTerms: ["appearance light dark system mode"],
    // The scheme tiles sit at the top of the Appearance section.
    targetId: "appearance",
  },
  {
    id: "theme",
    title: "主题",
    to: "/settings/appearance",
    searchTerms: ["appearance colors palette custom import"],
    // Theme cards live directly under the scheme tiles; the section is the
    // stable scroll destination for both.
    targetId: "appearance",
  },
  {
    // Prefixed because the slider control already owns the `appearance-contrast` id.
    id: "setting-appearance-contrast",
    title: "对比度",
    to: "/settings/appearance",
    searchTerms: ["colors borders interface"],
  },
  {
    // Prefixed because the slider control already owns the `glass-opacity` id.
    id: "setting-glass-opacity",
    title: "玻璃透明度",
    to: "/settings/appearance",
    searchTerms: ["transparent transparency solid menus dialogs composer"],
  },
  {
    id: "diff-color-scheme",
    title: "差异颜色",
    to: "/settings/appearance",
    searchTerms: ["red green blue orange additions deletions changes counts palette colorblind"],
  },
  {
    id: "chat-width",
    title: "会话宽度",
    to: "/settings/appearance",
    searchTerms: ["wide full width column layout messages composer monitor"],
  },
  {
    id: "panel-animations",
    title: "面板动画",
    to: "/settings/appearance",
  },
  {
    id: "environment-identification",
    title: "环境标识",
    to: "/settings/appearance",
    searchTerms: ["dev nightly artwork pill label hide none"],
    // The setting is stage-dependent, so its parent section is the stable destination.
    targetId: "appearance-interface",
  },
  {
    id: "interface-font",
    title: "界面字体",
    to: "/settings/appearance",
    searchTerms: ["typography family size system sans"],
  },
  {
    id: "prompt-font",
    title: "提示词字体",
    to: "/settings/appearance",
    searchTerms: ["typography family size composer input"],
  },
  {
    id: "code-font",
    title: "代码字体",
    to: "/settings/appearance",
    searchTerms: ["typography family size monospace code blocks diffs file previews"],
  },
  {
    id: "terminal-font",
    title: "终端字体",
    to: "/settings/appearance",
    searchTerms: ["typography family size monospace output"],
  },
  {
    id: "font-smoothing",
    title: "字体平滑",
    to: "/settings/appearance",
    searchTerms: ["typography text grayscale anti aliasing macos thin"],
    macOnly: true,
  },
  {
    id: "word-wrap",
    title: "自动换行",
    to: "/settings/appearance",
    searchTerms: ["long lines code blocks tables diffs file previews"],
  },
  {
    id: "composer-context",
    title: "输入框上下文",
    to: "/settings/appearance",
  },
  {
    id: "project-grouping",
    title: "项目分组",
    to: "/settings/general",
    searchTerms: ["combine matching repositories environments sidebar"],
  },
  {
    id: "project-order",
    title: "项目顺序",
    to: "/settings/general",
    searchTerms: ["sort projects sidebar manual created recent"],
  },
  {
    id: "snooze-limited-threads",
    title: "延后受限会话",
    to: "/settings/general",
    searchTerms: ["usage quota rate limit reset wake recover continue"],
  },
  {
    id: "auto-resume-limited-threads",
    title: "自动恢复受限会话",
    to: "/settings/general",
    searchTerms: ["usage quota rate limit reset recover continue"],
  },
  {
    id: "working-shelf",
    title: "工作中分区（测试版）",
    to: "/settings/general",
    searchTerms: ["hide fold running monitoring threads inbox sidebar shelf"],
  },
  {
    id: "auto-settle-inactive-threads",
    title: "自动完成无活动会话",
    to: "/settings/general",
    searchTerms: ["sidebar inactivity days no activity automatically"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "auto-settle-merged-threads",
    title: "自动完成已合并会话",
    to: "/settings/general",
    searchTerms: ["pull request merge closed automatically sidebar"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "days-before-auto-settle",
    title: "自动标记完成前的无活动天数",
    to: "/settings/general",
    targetId: "auto-settle-inactive-threads",
    searchTerms: ["thread timeout activity sidebar"],
    requiresThreadAutoSettlement: true,
    scope: "project-defaults",
  },
  {
    id: "thread-notifications",
    title: "会话通知",
    to: "/settings/general",
    searchTerms: ["notification sound alert completion input approval desktop"],
  },
  {
    id: "in-app-notifications",
    title: "应用内通知",
    to: "/settings/general",
    searchTerms: ["notification toast popup completion input approval failure"],
  },
  {
    id: "time-format",
    title: "时间格式",
    to: "/settings/general",
    searchTerms: ["timestamp clock locale system browser os 12 hour 24 hour"],
  },
  {
    id: "response-streaming",
    title: "回复流式传输",
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["output token paragraph buffered wait turn legacy"],
  },
  {
    id: "hide-whitespace-changes",
    title: "隐藏空白字符更改",
    to: "/settings/general",
    searchTerms: ["diff ignore spaces edits default"],
  },
  {
    id: "default-diff-file-state",
    title: "默认差异文件状态",
    to: "/settings/general",
    searchTerms: ["collapsed expanded collapse expand files pull request pr code tab"],
  },
  {
    id: "diff-layout",
    title: "差异布局",
    to: "/settings/general",
    searchTerms: ["stacked split side by side unified inline view"],
  },
  {
    id: "proactive-panels",
    title: "主动打开面板",
    to: "/settings/general",
    searchTerms: ["automatically open diff pull request pr right panel agent completion"],
  },
  {
    id: "skills-in-slash-menu",
    title: "在斜杠菜单中显示技能",
    to: "/settings/general",
    searchTerms: ["command menu dollar $ slash /"],
  },
  {
    id: "composer-rich-text",
    title: "富文本输入框",
    to: "/settings/general",
    searchTerms: ["composer rich text tiptap bold italic markdown styled wysiwyg"],
  },
  {
    id: "composer-collapse",
    title: "滚动时收起输入框",
    to: "/settings/general",
    searchTerms: ["composer rest resting scroll wheel conversation timeline shrink minimize"],
  },
  {
    id: "send-shortcut",
    title: "发送快捷键",
    to: "/settings/general",
    searchTerms: ["enter return command ctrl multiline prompt new line composer"],
  },
  {
    id: "follow-up-behavior",
    title: "后续消息行为",
    to: "/settings/general",
    searchTerms: ["queue steer running turn send default behavior composer"],
  },
  {
    id: "provider-update-checks",
    title: "提供方更新检查",
    to: "/settings/general",
    searchTerms: ["installed cli versions newer available codex claude cursor grok opencode"],
    scope: "environment-defaults",
  },
  {
    id: "continue-threads-after-server-update",
    title: "重启后继续会话",
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: [
      "resume running active interrupted work restart reboot machine crash desktop update automatically",
    ],
  },
  {
    id: "background-activity",
    title: "后台活动",
    to: "/settings/general",
    scope: "environment-defaults",
    searchTerms: [
      "balanced performance battery saver advanced git fetch provider health refresh host power monitor idle policy",
    ],
  },
  {
    id: "new-threads",
    title: "新会话",
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["default workspace mode draft local worktree"],
  },
  {
    id: "worktree-submodules",
    title: "子模块",
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["git submodule init recursive top-level none worktree t3.json"],
  },
  {
    id: "start-from-origin",
    title: "从远端分支开始",
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["new worktrees latest matching remote branch local"],
  },
  {
    id: "add-project-starts-in",
    title: "添加项目的起始位置",
    to: "/settings/general",
    scope: "environment-defaults",
    searchTerms: ["base directory folder browser path home"],
  },
  {
    id: "unpin-confirmation",
    title: "取消置顶确认",
    to: "/settings/general",
    searchTerms: ["ask before thread pinned section"],
  },
  {
    id: "archive-confirmation",
    title: "归档确认",
    to: "/settings/general",
    searchTerms: ["ask before thread second click inline action"],
  },
  {
    id: "delete-confirmation",
    title: "删除确认",
    to: "/settings/general",
    searchTerms: ["ask before thread chat history"],
  },
  {
    id: "quit-confirmation",
    title: "退出快捷键",
    to: "/settings/general",
    searchTerms: ["confirmation desktop app exit direct hold double click press twice"],
    desktopOnly: true,
  },
  {
    id: "text-generation-model",
    title: "文本生成模型",
    to: "/settings/general",
    scope: "project-defaults",
    searchTerms: ["generated thread titles source control content default provider"],
  },
  {
    id: "privacy-policy",
    title: "隐私政策",
    to: "/settings/general",
    searchTerms: ["telemetry analytics usage data tracking legal opt out"],
  },
  {
    id: "diagnostics",
    title: "诊断",
    to: "/settings/general",
    searchTerms: ["logs traces processes resource history failures spans cpu memory"],
  },
  {
    id: "open-source-licenses",
    title: "开源许可证",
    to: "/settings/general",
  },
  {
    id: "legacy-plan-mode",
    title: "计划模式（旧版）",
    to: "/settings/general",
    searchTerms: ["build plan composer old"],
  },
  {
    id: "legacy-context-window-indicator",
    title: "上下文窗口指示器（旧版）",
    to: "/settings/general",
    searchTerms: ["composer meter usage tokens circle old"],
  },
  {
    id: "legacy-sidebar",
    title: "侧边栏（旧版）",
    to: "/settings/general",
    searchTerms: ["project thread tree old flat list"],
  },
  {
    id: "keybindings",
    title: "快捷键",
    to: "/settings/keybindings",
    searchTerms: ["keyboard shortcuts hotkeys commands bindings json"],
  },
  ...KEYBINDING_SEARCH_ITEMS,
  {
    id: "snap-shot-enabled",
    title: "快照",
    searchTerms: ["window capture screenshot"],
    to: "/settings/snap-shot",
  },
  {
    id: "snap-shot-accessibility",
    title: "包含应用文字",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
    searchTerms: [
      "capture accessibility data text UI structure elements privacy omit agent context",
    ],
  },
  {
    id: "snap-shot-shortcut",
    title: "捕获快捷键",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-sound",
    title: "捕获声音",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-flash",
    title: "捕获闪烁",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "snap-shot-animations",
    title: "捕获动画",
    to: "/settings/snap-shot",
    targetId: "snap-shot-enabled",
  },
  {
    id: "providers",
    title: "提供方",
    to: "/settings/providers",
    searchTerms: [
      "agents cli codex claude cursor grok opencode antigravity google sign in sign out install subscription instances authentication api key models configuration binary path config directory endpoint arguments environment variables display name accent color custom favorite hidden auto compact",
    ],
  },
  {
    id: "usage-providers",
    title: "用量提供方",
    to: "/settings/providers",
    searchTerms: [
      "usage sources CLIProxyAPI CLI proxy hub quota subscription limits management key add remove",
    ],
    providerSettingsOnly: true,
  },
  {
    id: "cursor-keychain-usage",
    title: "Cursor 账户用量",
    to: "/settings/providers",
    searchTerms: ["cursor macOS keychain usage tokens cost limits permission"],
    providerSettingsOnly: true,
    macProviderSettingsOnly: true,
  },
  {
    id: "provider-health-check-interval",
    title: "健康检查间隔",
    to: "/settings/providers",
    searchTerms: ["refresh availability versions auth state models background probes seconds off"],
    providerSettingsOnly: true,
  },
  {
    id: "agent-browser-access",
    title: "智能体浏览器访问",
    to: "/settings/integrations",
    scope: "project-defaults",
    searchTerms: ["allow disable enable open drive preview tools sessions project override"],
  },
  {
    id: "device-hosts",
    title: "设备主机",
    to: "/settings/integrations",
    searchTerms: ["ssh remote simulator emulator ios android mac mini identity key connection"],
  },
  {
    id: "agent-device-access",
    title: "智能体设备访问",
    to: "/settings/integrations",
    targetId: "devices",
    searchTerms: ["allow simulator emulator ios android drive tools sessions"],
  },
  {
    id: "device-hub",
    title: "设备中心",
    to: "/settings/integrations",
    targetId: "devices",
    searchTerms: ["simulator emulator ios android install start"],
  },
  {
    id: "device-platform-support",
    title: "模拟器支持",
    to: "/settings/integrations",
    targetId: "devices",
    searchTerms: ["xcode android studio sdk avd runtime"],
  },
  {
    id: "browser-profiles",
    title: "浏览器配置文件",
    to: "/settings/integrations",
    targetId: "browser",
  },
  {
    id: "browser-default-profile",
    title: "默认浏览器配置文件",
    to: "/settings/integrations",
    targetId: "browser-profiles",
  },
  {
    id: "browser-default-viewport",
    title: "默认浏览器视口",
    to: "/settings/integrations",
    searchTerms: ["preview size width height device desktop mobile rotate"],
  },
  {
    id: "browser-default-zoom",
    title: "默认浏览器缩放",
    to: "/settings/integrations",
    searchTerms: ["preview page scale tabs percent"],
  },
  {
    id: "browser-default-appearance",
    title: "默认浏览器外观",
    to: "/settings/integrations",
    searchTerms: ["preview color scheme light dark system os"],
  },
  {
    id: "browser-recording-frame-rate",
    title: "浏览器录制帧率",
    to: "/settings/integrations",
  },
  {
    id: "browser-recording-key-presses",
    title: "在录制中显示按键",
    to: "/settings/integrations",
    searchTerms: ["browser preview keyboard shortcuts keystrokes overlay capture"],
  },
  {
    id: "browser-recording-mouse-presses",
    title: "在录制中显示鼠标点击",
    to: "/settings/integrations",
    searchTerms: ["browser preview clicks buttons drag overlay capture"],
  },
  {
    id: "browser-link-target",
    title: "链接打开位置",
    to: "/settings/integrations",
    searchTerms: ["links default browser in-app browser external open"],
  },
  {
    id: "browser-auto-show-floating-preview",
    title: "自动显示悬浮预览",
    to: "/settings/integrations",
    searchTerms: ["agent opens browser device simulator pop into view hide"],
  },
  {
    id: "automatic-pull",
    title: "自动拉取",
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: ["auto pull default branch current checkout fast forward upstream"],
  },
  {
    id: "remove-agent-credits-on-merge",
    title: "合并时移除智能体署名",
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: ["pull request github squash co-authored-by attribution claude codex generated"],
  },
  {
    id: "pull-request-merge-method",
    title: "默认合并方式",
    to: "/settings/source-control",
    scope: "project-defaults",
    searchTerms: ["pull request merge squash rebase last selected"],
  },
  {
    id: "source-control",
    title: "版本控制",
    to: "/settings/source-control",
    scope: "environment-defaults",
    searchTerms: [
      "version control git github gitlab forgejo gitea tea codeberg bitbucket azure devops hosting integrations credentials scan server environment",
    ],
  },
  {
    id: "git-fetch-interval",
    title: "Git 获取间隔",
    to: "/settings/source-control",
    searchTerms: [
      "automatic remote branch refresh background credentials security keys seconds off",
    ],
    environmentOnly: true,
    scope: "environment-defaults",
  },
  {
    id: "worktree-branch-naming",
    title: "工作树分支命名",
    to: "/settings/source-control",
    searchTerms: ["static semantic prefix custom prompt instructions feat fix refactor chore"],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "github-accounts",
    title: "GitHub 账户与令牌",
    to: "/settings/source-control",
    searchTerms: [
      "github gh account login user host enterprise ghes switch multiple accounts disable sign in token personal access token pat api key credential",
    ],
    environmentOnly: true,
    scope: "environment-defaults",
  },
  {
    id: "bitbucket-credentials",
    title: "Bitbucket 凭据",
    to: "/settings/source-control",
    searchTerms: ["bitbucket atlassian access token api token email credentials sign in"],
    environmentOnly: true,
    scope: "environment-defaults",
  },
  {
    id: "source-control-writing-style",
    title: "版本控制写作风格",
    to: "/settings/source-control",
    searchTerms: [
      "repository conventions conventional commits custom instructions change descriptions request titles",
    ],
    environmentOnly: true,
  },
  {
    id: "follow-change-request-templates",
    title: "遵循变更请求模板",
    to: "/settings/source-control",
    searchTerms: ["repository pr pull request description structure"],
    environmentOnly: true,
  },
  {
    id: "source-control-writer-model",
    title: "版本控制写作模型",
    to: "/settings/source-control",
    searchTerms: [
      "override generated commit change request pr titles descriptions branch bookmark",
    ],
    environmentOnly: true,
    scope: "project-defaults",
  },
  {
    id: "project-actions",
    title: "操作",
    to: "/settings/projects",
    searchTerms: ["commands scripts setup run dev server checkout worktree t3.json import"],
  },
  {
    id: "environment-icon",
    title: "环境图标",
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["machine glyph sidebar mac mini studio laptop desktop server cloud vm"],
    localBackendManagementOnly: true,
  },
  {
    id: "local-environment",
    title: "本地环境",
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["turn off on disable enable local server agents remote only restart"],
    desktopOnly: true,
  },
  {
    id: "network-access",
    title: "网络访问",
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["expose backend remote pairing local machine interfaces host restart"],
    localBackendManagementOnly: true,
  },
  {
    id: "tailscale-https",
    title: "Tailscale HTTPS",
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["serve magicdns endpoint remote secure network"],
    desktopOnly: true,
    localBackendManagementOnly: true,
  },
  {
    id: "wsl-backend",
    title: "WSL 后端",
    to: "/settings/connections",
    searchTerms: [
      "windows subsystem linux distro second server projects stop windows backend restart",
    ],
    desktopOnly: true,
    windowsOnly: true,
    localBackendManagementOnly: true,
    wslAvailableOnly: true,
  },
  {
    id: "t3-connect",
    localEnvironmentOnly: true,
    title: "T3 Connect",
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["managed tunnel cloud other devices remote"],
    desktopOnly: true,
    cloudOnly: true,
  },
  {
    id: "hold-webhooks-while-offline",
    localEnvironmentOnly: true,
    title: "离线时保留 Webhook",
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["webhook automations offline queue mailbox t3 connect"],
    cloudOnly: true,
    managedTunnelOnly: true,
  },
  {
    id: "publish-agent-activity",
    localEnvironmentOnly: true,
    title: "发布智能体活动",
    to: "/settings/connections",
    targetId: "connections-environment",
    searchTerms: ["mobile push notifications live activities cloud tunnel"],
    cloudOnly: true,
  },
  {
    id: "connections-environment",
    title: "此机器",
    to: "/settings/connections",
    searchTerms: [
      "connections server backend local remote access administrative permissions scope pairing links qr code authorized clients sessions revoke endpoint",
    ],
  },
  {
    id: "remote-environments",
    title: "环境",
    to: "/settings/connections",
    searchTerms: ["add pair backend host code ssh config agent tunnel saved t3 connect"],
  },
  {
    id: "load-balancing",
    title: "负载均衡",
    to: "/settings/connections",
    searchTerms: [
      "automatic machine environment resources cpu memory capacity preference weight shared projects",
    ],
  },
  {
    id: "github-routing",
    title: "GitHub 共享",
    to: "/settings/connections",
    searchTerms: ["pull request trusted environments shared credentials permissions read actions"],
  },
  {
    id: "archive",
    title: "已归档会话",
    to: "/settings/archived",
    searchTerms: ["restore reopen deleted history projects"],
  },
] as const satisfies ReadonlyArray<SettingsSearchItem>;

export type SettingsSearchItemId = (typeof SETTINGS_SEARCH_ITEMS)[number]["id"];

const SEARCH_ITEMS_BY_ID = new Map(SETTINGS_SEARCH_ITEMS.map((item) => [item.id, item] as const));

const SETTINGS_CATEGORY_SCOPES: Readonly<Record<SettingsPath, SettingsSearchScope | null>> = {
  "/settings/projects": "project",
  "/settings/general": null,
  "/settings/appearance": null,
  "/settings/snap-shot": null,
  // Keybindings fan out to the selection; Providers shows the representative
  // environment at any selection. Neither needs a particular scope to render.
  "/settings/keybindings": null,
  "/settings/providers": null,
  "/settings/integrations": null,
  "/settings/source-control": "environment-defaults",
  "/settings/storage": "project-defaults",
  "/settings/connections": "connections",
  "/settings/scheduled-tasks": null,
  "/settings/archived": "project-defaults",
};

/** Search keeps the selected target. A missing row can explain its owning scope instead. */
export function getSettingsSearchTargetScope(targetId: string) {
  const items: readonly SettingsSearchItem[] = SETTINGS_SEARCH_ITEMS;
  const item =
    items.find((candidate) => candidate.id === targetId) ??
    items.find((candidate) => candidate.targetId === targetId);
  return item
    ? {
        title: item.title,
        scope: item.scope ?? SETTINGS_CATEGORY_SCOPES[item.to],
        ...(item.requiresThreadAutoSettlement ? { requiresThreadAutoSettlement: true } : {}),
      }
    : null;
}

interface AutoSettlementSearchEnvironment {
  readonly environmentId: EnvironmentId;
  readonly connection: { readonly phase: EnvironmentConnectionPhase };
  readonly serverConfig: {
    readonly environment: {
      readonly capabilities: { readonly threadAutoSettlement?: boolean };
    };
  } | null;
}

/** Discovery needs one capable environment; the selected page needs every connected target to support it. */
export function getThreadAutoSettlementSearchAvailability(
  environments: readonly AutoSettlementSearchEnvironment[],
  scope?: Pick<ResolvedSettingsScope, "kind" | "environmentIds">,
) {
  const connected = environments.filter(
    (environment) =>
      environment.connection.phase === "connected" && environment.serverConfig !== null,
  );
  const eligibleEnvironmentIds = connected
    .filter(
      (environment) =>
        environment.serverConfig?.environment.capabilities.threadAutoSettlement === true,
    )
    .map((environment) => environment.environmentId);
  const selected = connected.filter((environment) =>
    scope?.environmentIds.includes(environment.environmentId),
  );
  return {
    eligibleEnvironmentIds,
    isTargetAvailable:
      scope !== undefined &&
      scope.kind !== "unavailable" &&
      selected.length > 0 &&
      selected.every((environment) => eligibleEnvironmentIds.includes(environment.environmentId)),
  };
}

export function isSettingsSearchScopeAvailable(
  requiredScope: SettingsSearchScope | null,
  scopeKind: ResolvedSettingsScope["kind"],
): boolean {
  switch (requiredScope) {
    case null:
    case "connections":
      return true;
    case "environment":
    case "checkout":
      return requiredScope === scopeKind;
    case "project":
      return scopeKind === "project" || scopeKind === "checkout";
    case "environment-defaults":
      return scopeKind === "environment" || scopeKind === "all";
    case "project-defaults":
      return (
        scopeKind === "environment" ||
        scopeKind === "all" ||
        scopeKind === "project" ||
        scopeKind === "checkout"
      );
  }
}

function settingsScopeKindFromSearch(search: SettingsScopeSearch): ResolvedSettingsScope["kind"] {
  const target = validateSettingsScopeSearch({ ...search });
  if (target.checkout && !target.project) return "unavailable";
  if (target.project) return target.checkout ? "checkout" : "project";
  return target.machine ? "environment" : "all";
}

export function isSettingsOverviewVisible(search: SettingsScopeSearch): boolean {
  const kind = settingsScopeKindFromSearch(search);
  return kind === "project" || kind === "checkout";
}

/**
 * `id` and `title` props for the element a search item anchors to. Panels
 * spread (or pick from) this instead of restating the strings, so the catalog
 * and the rendered settings cannot drift apart.
 */
export function searchableSetting(id: SettingsSearchItemId): {
  readonly id: string;
  readonly title: string;
} {
  const { id: anchorId, title } = SEARCH_ITEMS_BY_ID.get(id)!;
  return { id: anchorId, title };
}

export function filterAvailableSettingsSearchItems(
  availability: SettingsSearchAvailability,
): ReadonlyArray<SettingsSearchItem> {
  const items: ReadonlyArray<SettingsSearchItem> = SETTINGS_SEARCH_ITEMS;
  return items.filter(
    (item) =>
      (!item.cloudOnly || availability.hasCloudPublicConfig) &&
      (!item.environmentOnly || availability.hasEnvironment) &&
      (!item.providerSettingsOnly || availability.hasProviderSettingsEnvironment) &&
      (!item.macProviderSettingsOnly || availability.hasMacProviderSettingsEnvironment) &&
      (!item.localBackendManagementOnly || availability.canManageLocalBackend) &&
      (!item.localEnvironmentOnly || !availability.localEnvironmentDisabled) &&
      (!item.wslAvailableOnly || availability.isWslSettingsRowVisible) &&
      (!item.requiresThreadAutoSettlement || availability.hasThreadAutoSettlement) &&
      (!item.managedTunnelOnly || availability.managedTunnelActive === true),
  );
}

export function searchSettings(
  query: string,
  items: ReadonlyArray<SettingsSearchItem> = SETTINGS_SEARCH_ITEMS,
): ReadonlyArray<SettingsSearchItem> {
  const normalizedQuery = normalizeSearchText(query);
  if (normalizedQuery.length === 0) return [];
  const queryTokens = normalizedQuery.split(" ");
  const platform = typeof navigator === "undefined" ? "" : navigator.platform;

  return items
    .flatMap((item, index) => {
      if (!isElectron && item.desktopOnly === true) return [];
      if (item.macOnly && !isMacPlatform(platform)) return [];
      if (item.windowsOnly && !isWindowsPlatform(platform)) return [];

      const title = normalizeSearchText(item.title);
      const fields = [
        title,
        normalizeSearchText(SETTINGS_SECTION_LABELS[item.to]),
        ...(item.searchTerms ?? []).map(normalizeSearchText),
      ];
      if (!queryTokens.every((token) => fields.some((field) => field.includes(token)))) return [];

      const exactPhraseField = fields.findIndex((field) => field.includes(normalizedQuery));
      const rank =
        title === normalizedQuery
          ? 5
          : title.startsWith(normalizedQuery)
            ? 4
            : title.includes(normalizedQuery)
              ? 3
              : queryTokens.every((token) => title.includes(token))
                ? 2
                : exactPhraseField >= 0
                  ? 1
                  : 0;
      return [{ item, index, rank }];
    })
    .toSorted(
      (left, right) =>
        Number(left.item.secondary ?? false) - Number(right.item.secondary ?? false) ||
        right.rank - left.rank ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}
