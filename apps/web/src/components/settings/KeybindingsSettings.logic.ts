import {
  STATIC_KEYBINDING_COMMANDS,
  type KeybindingCommand,
  type KeybindingShortcut,
  type KeybindingWhenNode,
  type ResolvedKeybindingRule,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import {
  DEFAULT_RESOLVED_KEYBINDINGS,
  parseKeybindingWhenExpression,
} from "@t3tools/shared/keybindings";

import { shortcutKeyFromEvent } from "../../keybindings";
import { isMacPlatform } from "../../lib/utils";
import { METRIC_OPTIONS, WINDOW_OPTIONS } from "../usage/usageShortcuts";

// Every usage.* command needs a rank. An unranked one falls back to the
// alphabetical compare, which makes the comparator inconsistent and the order
// depend on the input order.
const usageCommandOrder = new Map<KeybindingCommand, number>(
  [
    "usage.open" as const,
    ...[...METRIC_OPTIONS, ...WINDOW_OPTIONS].map((option) => option.command),
  ].map((command, index) => [command, index]),
);

const firstUsageCommand = METRIC_OPTIONS[0].command;

/**
 * Orders commands by `key`, except Usage page commands, which sort as one
 * block in page order where the first of them would sort. A total order, so
 * adding a binding elsewhere cannot reshuffle the Usage rows.
 */
function compareCommands(
  left: KeybindingCommand,
  right: KeybindingCommand,
  key: (command: KeybindingCommand) => string,
): number {
  const leftRank = usageCommandOrder.get(left);
  const rightRank = usageCommandOrder.get(right);
  if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
  return key(leftRank === undefined ? left : firstUsageCommand).localeCompare(
    key(rightRank === undefined ? right : firstUsageCommand),
  );
}

export type KeybindingSource = "Default" | "Custom" | "Project";

export interface KeybindingRow {
  readonly id: string;
  readonly command: KeybindingCommand;
  readonly key: string;
  readonly when: string;
  readonly source: KeybindingSource;
  readonly defaultKey: string | null;
  readonly defaultWhen: string;
  readonly binding: ResolvedKeybindingRule;
  readonly conflicts: ReadonlyArray<string>;
}

export type WhenVariableOption = string;
export type KeybindingCommandOption = KeybindingCommand;

const CORE_WHEN_VARIABLES = [
  "terminalFocus",
  "terminalOpen",
  "isWeb",
  "isDesktop",
  "true",
  "false",
] as const;

const DEFAULT_WHEN_VARIABLES = new Set<string>(CORE_WHEN_VARIABLES);
for (const binding of DEFAULT_RESOLVED_KEYBINDINGS) {
  collectWhenIdentifiersFromNode(binding.whenAst, DEFAULT_WHEN_VARIABLES);
}

export const DEFAULT_WHEN_VARIABLE =
  [...DEFAULT_WHEN_VARIABLES].find(
    (identifier) => identifier !== "true" && identifier !== "false",
  ) ?? "terminalFocus";
const KNOWN_WHEN_VARIABLES = new Set(DEFAULT_WHEN_VARIABLES);

export function shortcutToKeybindingInput(shortcut: KeybindingShortcut): string {
  const parts: string[] = [];
  if (shortcut.modKey) parts.push("mod");
  if (shortcut.metaKey) parts.push("meta");
  if (shortcut.ctrlKey) parts.push("ctrl");
  if (shortcut.altKey) parts.push("alt");
  if (shortcut.shiftKey) parts.push("shift");
  parts.push(shortcut.key === " " ? "space" : shortcut.key === "escape" ? "esc" : shortcut.key);
  return parts.join("+");
}

export function whenAstToExpression(node: KeybindingWhenNode | undefined): string {
  if (!node) return "";
  switch (node.type) {
    case "identifier":
      return node.name;
    case "not":
      return `!${wrapWhenExpression(node.node)}`;
    case "and":
      return `${wrapWhenExpression(node.left)} && ${wrapWhenExpression(node.right)}`;
    case "or":
      return `${wrapWhenExpression(node.left)} || ${wrapWhenExpression(node.right)}`;
  }
}

export function whenNodeRemoveLabel(node: KeybindingWhenNode, depth: number): string {
  if (depth === 0) return "清除所有条件";
  if (node.type === "identifier" || (node.type === "not" && node.node.type === "identifier")) {
    return "移除条件";
  }
  return "移除组及其条件";
}

function wrapWhenExpression(node: KeybindingWhenNode): string {
  if (node.type === "identifier" || node.type === "not") return whenAstToExpression(node);
  return `(${whenAstToExpression(node)})`;
}

export function parseWhenExpressionDraft(
  expression: string,
): { ok: true; value: KeybindingWhenNode | undefined } | { ok: false; message: string } {
  const trimmed = expression.trim();
  if (trimmed.length === 0) return { ok: true, value: undefined };

  const ast = parseKeybindingWhenExpression(trimmed);
  if (!ast) {
    return {
      ok: false,
      message: "使用变量、!、&&、|| 和括号。",
    };
  }

  return { ok: true, value: ast };
}

function sourceForBinding(binding: ResolvedKeybindingRule): KeybindingSource {
  if (String(binding.command).startsWith("script.")) {
    return "Project";
  }

  const bindingKey = shortcutToKeybindingInput(binding.shortcut);
  const bindingWhen = whenAstToExpression(binding.whenAst);
  const isDefault = DEFAULT_RESOLVED_KEYBINDINGS.some(
    (entry) =>
      entry.command === binding.command &&
      shortcutToKeybindingInput(entry.shortcut) === bindingKey &&
      whenAstToExpression(entry.whenAst) === bindingWhen,
  );

  return isDefault ? "Default" : "Custom";
}

function defaultBindingForBinding(
  binding: ResolvedKeybindingRule,
): ResolvedKeybindingRule | undefined {
  const bindingKey = shortcutToKeybindingInput(binding.shortcut);
  const bindingWhen = whenAstToExpression(binding.whenAst);

  return (
    DEFAULT_RESOLVED_KEYBINDINGS.find(
      (entry) =>
        entry.command === binding.command &&
        shortcutToKeybindingInput(entry.shortcut) === bindingKey &&
        whenAstToExpression(entry.whenAst) === bindingWhen,
    ) ??
    DEFAULT_RESOLVED_KEYBINDINGS.find(
      (entry) =>
        entry.command === binding.command && whenAstToExpression(entry.whenAst) === bindingWhen,
    ) ??
    DEFAULT_RESOLVED_KEYBINDINGS.find((entry) => entry.command === binding.command)
  );
}

function keybindingRowId(command: KeybindingCommand, key: string, when: string): string {
  return `${command}\u0000${key}\u0000${when}`;
}

function conflictsWithWhen(leftWhen: string, rightWhen: string): boolean {
  return leftWhen.length === 0 || rightWhen.length === 0 || leftWhen === rightWhen;
}

export function keybindingConflictLabels(
  rows: ReadonlyArray<KeybindingRow>,
  input: { readonly rowId: string; readonly key: string; readonly when: string },
): ReadonlyArray<string> {
  if (input.key.trim().length === 0) return [];
  const conflicts: Array<string> = [];
  for (const candidate of rows) {
    if (
      candidate.id !== input.rowId &&
      candidate.key === input.key &&
      conflictsWithWhen(candidate.when, input.when)
    ) {
      conflicts.push(commandLabel(candidate.command));
    }
  }
  return [...new Set(conflicts)].toSorted();
}

export function buildKeybindingRows(
  keybindings: ResolvedKeybindingsConfig,
  query: string,
): ReadonlyArray<KeybindingRow> {
  const normalizedQuery = query.trim().toLowerCase();
  const rows = keybindings.map((binding, index) => {
    const defaultBinding = defaultBindingForBinding(binding);
    const key = shortcutToKeybindingInput(binding.shortcut);
    const when = whenAstToExpression(binding.whenAst);
    return {
      id: `${keybindingRowId(binding.command, key, when)}\u0000${index}`,
      command: binding.command,
      key,
      when,
      source: sourceForBinding(binding),
      defaultKey: defaultBinding ? shortcutToKeybindingInput(defaultBinding.shortcut) : null,
      defaultWhen: whenAstToExpression(defaultBinding?.whenAst),
      binding,
      conflicts: [],
    } satisfies KeybindingRow;
  });

  const rowsWithConflicts = rows.map((row) => {
    const conflicts = keybindingConflictLabels(rows, {
      rowId: row.id,
      key: row.key,
      when: row.when,
    });
    return conflicts.length > 0
      ? Object.assign({}, row, { conflicts: [...new Set(conflicts)].toSorted() })
      : row;
  });

  rowsWithConflicts.sort((left, right) => {
    const commandCompare = compareCommands(left.command, right.command, (command) => command);
    if (commandCompare !== 0) return commandCompare;
    return left.key.localeCompare(right.key);
  });

  if (normalizedQuery.length === 0) {
    return rowsWithConflicts;
  }

  return rowsWithConflicts.filter((row) => {
    return (
      row.command.toLowerCase().includes(normalizedQuery) ||
      commandLabel(row.command).toLowerCase().includes(normalizedQuery) ||
      row.key.toLowerCase().includes(normalizedQuery) ||
      row.when.toLowerCase().includes(normalizedQuery) ||
      row.source.toLowerCase().includes(normalizedQuery)
    );
  });
}

function collectWhenIdentifiersFromNode(
  node: KeybindingWhenNode | undefined,
  identifiers: Set<string>,
): void {
  if (!node) return;
  switch (node.type) {
    case "identifier":
      identifiers.add(node.name);
      return;
    case "not":
      collectWhenIdentifiersFromNode(node.node, identifiers);
      return;
    case "and":
    case "or":
      collectWhenIdentifiersFromNode(node.left, identifiers);
      collectWhenIdentifiersFromNode(node.right, identifiers);
      return;
  }
}

export function isKnownWhenVariable(identifier: string): boolean {
  return KNOWN_WHEN_VARIABLES.has(identifier);
}

export function unknownWhenVariables(node: KeybindingWhenNode | undefined): ReadonlyArray<string> {
  const identifiers = new Set<string>();
  collectWhenIdentifiersFromNode(node, identifiers);
  return [...identifiers].filter((identifier) => !isKnownWhenVariable(identifier)).toSorted();
}

export function buildWhenVariableOptions(): ReadonlyArray<WhenVariableOption> {
  return [...KNOWN_WHEN_VARIABLES].toSorted((left, right) => {
    const leftCoreIndex = CORE_WHEN_VARIABLES.indexOf(left as (typeof CORE_WHEN_VARIABLES)[number]);
    const rightCoreIndex = CORE_WHEN_VARIABLES.indexOf(
      right as (typeof CORE_WHEN_VARIABLES)[number],
    );
    if (leftCoreIndex !== -1 || rightCoreIndex !== -1) {
      return (
        (leftCoreIndex === -1 ? Number.MAX_SAFE_INTEGER : leftCoreIndex) -
        (rightCoreIndex === -1 ? Number.MAX_SAFE_INTEGER : rightCoreIndex)
      );
    }
    return left.localeCompare(right);
  });
}

export function buildKeybindingCommandOptions(
  keybindings: ResolvedKeybindingsConfig,
): ReadonlyArray<KeybindingCommandOption> {
  const commands = new Set<KeybindingCommand>(STATIC_KEYBINDING_COMMANDS);
  for (const binding of keybindings) {
    commands.add(binding.command);
  }
  return [...commands].toSorted((left, right) => compareCommands(left, right, commandLabel));
}

const COMMAND_SEGMENT_LABELS: Readonly<Record<string, string>> = {
  sidebar: "侧边栏",
  navigation: "导航",
  back: "后退",
  forward: "前进",
  terminal: "终端",
  toggle: "切换",
  split: "水平拆分",
  splitVertical: "垂直拆分",
  new: "新建",
  close: "关闭",
  rightPanel: "右侧面板",
  threadPanel: "会话面板",
  toggleMaximized: "切换最大化",
  pullRequest: "拉取请求",
  copyNumber: "复制编号",
  diff: "差异",
  preview: "预览",
  refresh: "刷新",
  focusUrl: "聚焦地址栏",
  zoomIn: "放大",
  zoomOut: "缩小",
  resetZoom: "重置缩放",
  commandPalette: "命令面板",
  filePicker: "文件选择器",
  projectSearch: "项目搜索",
  usage: "用量",
  open: "打开",
  theme: "主题",
  select: "选择",
  appearance: "外观",
  cycle: "循环切换",
  themeEditor: "主题编辑器",
  composer: "输入框",
  stash: "暂存草稿",
  host: "环境",
  cycleHost: "切换环境",
  effort: "推理强度",
  mode: "模式",
  workspace: "工作区",
  previousWorktree: "之前的工作树",
  branch: "分支",
  chat: "会话",
  newLocal: "新建本地会话",
  newWithoutProject: "无需项目新建",
  editor: "编辑器",
  openFavorite: "在首选编辑器中打开",
  modelPicker: "模型选择器",
  previousProvider: "上一个提供方",
  nextProvider: "下一个提供方",
  jump: "跳转",
  thread: "会话",
  stop: "停止",
  previous: "上一个",
  next: "下一个",
  settle: "标记完成",
  pin: "置顶",
  undo: "撤销",
};

export function commandLabel(command: KeybindingCommand): string {
  if (command === "composer.sendAlternate") return "输入框：执行相反的排队或引导操作";
  if (command === "composer.sendBackground") return "输入框：在后台启动";
  if (command === "composer.sendAndNewThread") return "输入框：发送并新建会话";
  if (command === "thread.steerQueuedMessage") return "队列：将首条排队消息作为引导发送";
  if (command === "thread.editQueuedMessage") return "队列：编辑最后一条排队消息";
  if (command === "thread.copyReference") return "拉取请求：复制链接或会话 ID";
  const usageMetric = METRIC_OPTIONS.find((option) => option.command === command);
  if (usageMetric) return `用量：${usageMetric.label}`;
  const usagePeriod = WINDOW_OPTIONS.find((option) => option.command === command);
  if (usagePeriod) return `用量：时段：${usagePeriod.label}`;
  if (command === "view.reopenClosed") return "重新打开已关闭的标签页";
  const raw = String(command);
  if (raw.startsWith("script.") && raw.endsWith(".run")) {
    return `运行脚本：${titleCaseCommandSegment(raw.slice("script.".length, -".run".length))}`;
  }
  return raw
    .split(".")
    .map((segment) =>
      Object.hasOwn(COMMAND_SEGMENT_LABELS, segment)
        ? COMMAND_SEGMENT_LABELS[segment]
        : titleCaseCommandSegment(segment),
    )
    .join("：");
}

function titleCaseCommandSegment(segment: string): string {
  const words: Array<string> = [];
  for (const part of segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[-_\s]+/)) {
    if (part.length > 0) {
      words.push(part.slice(0, 1).toUpperCase() + part.slice(1));
    }
  }
  return words.join(" ");
}

function normalizeShortcutKeyToken(key: string): string | null {
  const normalized = key.toLowerCase();
  if (
    normalized === "meta" ||
    normalized === "control" ||
    normalized === "ctrl" ||
    normalized === "shift" ||
    normalized === "alt" ||
    normalized === "option"
  ) {
    return null;
  }
  if (normalized === " ") return "space";
  if (normalized === "escape") return "esc";
  if (normalized === "arrowup") return "arrowup";
  if (normalized === "arrowdown") return "arrowdown";
  if (normalized === "arrowleft") return "arrowleft";
  if (normalized === "arrowright") return "arrowright";
  if (normalized.length === 1) return normalized;
  if (/^f\d{1,2}$/.test(normalized)) return normalized;
  if (normalized === "enter" || normalized === "tab" || normalized === "backspace") {
    return normalized;
  }
  if (normalized === "delete" || normalized === "home" || normalized === "end") {
    return normalized;
  }
  if (normalized === "pageup" || normalized === "pagedown") return normalized;
  return null;
}

/** Turns a keydown into a binding such as `mod+shift+k` or `tab`. Null for modifier-only presses. */
export function keybindingFromKeyboardEvent(
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  platform: string,
): string | null {
  const keyToken = normalizeShortcutKeyToken(shortcutKeyFromEvent(event));
  if (!keyToken) return null;

  const parts: string[] = [];
  if (isMacPlatform(platform)) {
    if (event.metaKey) parts.push("mod");
    if (event.ctrlKey) parts.push("ctrl");
  } else {
    if (event.ctrlKey) parts.push("mod");
    if (event.metaKey) parts.push("meta");
  }
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(keyToken);
  return parts.join("+");
}
