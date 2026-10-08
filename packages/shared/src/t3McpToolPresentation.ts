export type T3McpToolLogo = "t3-code";

export interface T3McpToolPresentation {
  readonly displayName: string;
  readonly logo: T3McpToolLogo;
}

export type T3McpToolSummaryAction =
  | "capabilities"
  | "delegate"
  | "task-status"
  | "task-cancel"
  | "schedule-run"
  | "schedule-create"
  | "schedule-list"
  | "schedule-update"
  | "schedule-delete"
  | "thread-create"
  | "thread-list"
  | "thread-read"
  | "thread-send"
  | "thread-wait"
  | "thread-interrupt"
  | "thread-configuration"
  | "thread-configure"
  | "thread-fork"
  | "thread-merge"
  | "thread-search"
  | "thread-transfers"
  | "thread-organize"
  | "thread-update"
  | "queue-list"
  | "queue-read"
  | "queue-edit"
  | "queue-cancel"
  | "queue-reorder"
  | "queue-steer"
  | "question-list"
  | "question-read"
  | "question-respond"
  | "secret-request"
  | "worktree-handoff"
  | "worktree-list"
  | "worktree-status"
  | "project-list"
  | "project-read"
  | "project-create"
  | "project-update"
  | "project-delete"
  | "project-clone"
  | "environment-read"
  | "environment-update"
  | "attachment-prepare"
  | "attachment-discard"
  | "attachment-send"
  | "link-pr"
  | "unlink-pr"
  | "list-prs"
  | "watch-pr"
  | "unwatch-pr"
  | "browser"
  | "device"
  | "html-preview"
  | "html-render";

export interface T3McpToolDefinition {
  readonly displayName: string;
  readonly labels: readonly [action: string, running: string, completed: string, detail: string];
  readonly icon: "t3-code" | "browser" | "device" | "pull-request";
  readonly summaryAction: T3McpToolSummaryAction;
}

function tool(
  labels: T3McpToolDefinition["labels"],
  summaryAction: T3McpToolSummaryAction,
  icon: T3McpToolDefinition["icon"] = "t3-code",
  displayName = `${labels[0]} ${labels[3]}`,
): T3McpToolDefinition {
  return { displayName, labels, icon, summaryAction };
}

const T3_MCP_SERVER_ALIASES = new Set(["t3-code", "t3_code", "t3code"]);

// Cards, activity rows, summaries, and provider identity recovery share this inventory.
const T3_MCP_TOOLS: Readonly<Record<string, T3McpToolDefinition>> = {
  link_pull_request: tool(["关联", "正在关联", "已关联", "拉取请求"], "link-pr", "pull-request"),
  unlink_pull_request: tool(
    ["取消关联", "正在取消关联", "已取消关联", "拉取请求"],
    "unlink-pr",
    "pull-request",
  ),
  list_thread_pull_requests: tool(
    ["检查", "正在检查", "已检查", "关联拉取请求"],
    "list-prs",
    "pull-request",
  ),
  watch_pull_request: tool(
    ["关注", "正在关注", "正在关注", "拉取请求"],
    "watch-pr",
    "pull-request",
  ),
  unwatch_pull_request: tool(
    ["停止关注", "正在停止关注", "已停止关注", "拉取请求"],
    "unwatch-pr",
    "pull-request",
  ),
  orchestrator_capabilities: tool(["获取", "正在获取", "已获取", "编排能力"], "capabilities"),
  delegate_task: tool(["委派", "正在委派", "已委派", "子任务"], "delegate"),
  task_status: tool(["获取", "正在获取", "已获取", "委派任务状态"], "task-status"),
  task_cancel: tool(["取消", "正在取消", "已请求取消", "委派任务"], "task-cancel"),
  schedule_task: tool(["安排", "正在安排", "已安排", "周期任务"], "schedule-create"),
  list_scheduled_tasks: tool(["列出", "正在列出", "已列出", "定时任务"], "schedule-list"),
  update_scheduled_task: tool(["更新", "正在更新", "已更新", "定时任务"], "schedule-update"),
  delete_scheduled_task: tool(["Delete", "正在删除", "已请求删除", "定时任务"], "schedule-delete"),
  request_secret: tool(["请求", "正在请求", "已请求", "密钥"], "secret-request"),
  create_threads: tool(["创建", "正在创建", "已创建", "T3 会话"], "thread-create"),
  t3_thread_start: tool(["启动", "正在启动", "已启动", "T3 会话"], "thread-create"),
  t3_thread_list: tool(["列出", "正在列出", "已列出", "T3 会话"], "thread-list"),
  t3_thread_read: tool(["读取", "正在读取", "读取", "T3 会话"], "thread-read"),
  t3_thread_send: tool(["发送", "正在发送", "已发送", "到 T3 会话"], "thread-send"),
  t3_thread_wait: tool(["等待", "正在等待", "已等待", "T3 会话"], "thread-wait"),
  t3_thread_interrupt: tool(["中断", "正在中断", "已请求中断", "T3 会话"], "thread-interrupt"),
  t3_worktree_handoff: tool(
    ["移交", "正在移交", "已移交", "会话到 Git 工作树"],
    "worktree-handoff",
  ),
  t3_worktree_status: tool(["获取", "正在获取", "已获取", "会话工作树状态"], "worktree-status"),
  preview_status: tool(["获取", "正在获取", "已获取", "预览浏览器状态"], "browser", "browser"),
  preview_open: tool(["打开", "正在打开", "已打开", "预览浏览器中的页面"], "browser", "browser"),
  preview_navigate: tool(["导航", "正在导航", "已导航", "预览浏览器"], "browser", "browser"),
  preview_dialog: tool(["响应", "正在响应", "已响应", "预览浏览器对话框"], "browser", "browser"),
  preview_snapshot: tool(
    ["拍摄快照", "正在拍摄快照", "已拍摄快照", "预览页面"],
    "browser",
    "browser",
    "拍摄预览页面快照",
  ),
  preview_click: tool(["点击", "正在点击", "已点击", "预览浏览器"], "browser", "browser"),
  preview_press: tool(["按下", "正在按下", "已按下", "预览浏览器中的按键"], "browser", "browser"),
  preview_type: tool(["输入", "正在输入", "已输入", "预览浏览器"], "browser", "browser"),
  preview_hover: tool(["悬停", "正在悬停", "已悬停", "预览浏览器"], "browser", "browser"),
  preview_select: tool(["选择", "正在选择", "已选择", "预览浏览器中的选项"], "browser", "browser"),
  preview_drag: tool(["拖动", "正在拖动", "已拖动", "预览浏览器"], "browser", "browser"),
  preview_upload: tool(["上传", "正在上传", "已上传", "文件到预览浏览器"], "browser", "browser"),
  preview_scroll: tool(["滚动", "正在滚动", "已滚动", "预览浏览器"], "browser", "browser"),
  preview_resize: tool(
    ["调整大小", "正在调整大小", "已调整大小", "预览浏览器"],
    "browser",
    "browser",
  ),
  preview_evaluate: tool(
    ["执行", "正在执行", "已执行", "预览浏览器中的脚本"],
    "browser",
    "browser",
  ),
  preview_wait_for: tool(["等待", "正在等待", "已等待", "预览页面"], "browser", "browser"),
  preview_set_appearance: tool(
    ["设置", "正在设置", "设置", "预览浏览器外观"],
    "browser",
    "browser",
  ),
  preview_recording_start: tool(
    ["启动", "正在启动", "已启动", "预览浏览器录制"],
    "browser",
    "browser",
  ),
  preview_recording_stop: tool(
    ["停止", "正在停止", "已停止", "预览浏览器录制"],
    "browser",
    "browser",
  ),
  device_list: tool(["列出", "正在列出", "已列出", "模拟器"], "device", "device"),
  device_open: tool(["打开", "正在打开", "已打开", "设备面板中的设备"], "device", "device"),
  device_screenshot: tool(["截屏", "正在截屏", "已截屏", "设备"], "device", "device"),
  device_close: tool(["关闭", "正在关闭", "已关闭", "设备"], "device", "device"),
  run_scheduled_task_now: tool(["运行", "正在运行", "已请求运行", "定时任务"], "schedule-run"),
  t3_queue_list: tool(["列出", "正在列出", "已列出", "排队消息"], "queue-list"),
  t3_queue_read: tool(["读取", "正在读取", "读取", "排队消息"], "queue-read"),
  t3_queue_edit: tool(["编辑", "正在编辑", "已编辑", "排队消息"], "queue-edit"),
  t3_queue_cancel: tool(["取消", "正在取消", "已请求取消", "排队运行"], "queue-cancel"),
  t3_queue_reorder: tool(["重新排序", "正在重新排序", "已重新排序", "排队运行"], "queue-reorder"),
  t3_queue_promote_to_steer: tool(
    ["使用消息引导", "正在使用消息引导", "已请求使用消息引导", "排队消息"],
    "queue-steer",
  ),
  t3_pending_request_list: tool(["列出", "正在列出", "已列出", "待回答问题"], "question-list"),
  t3_pending_request_read: tool(["读取", "正在读取", "读取", "待回答问题"], "question-read"),
  t3_pending_request_respond: tool(
    ["回答", "正在回答", "已回答", "待回答问题"],
    "question-respond",
  ),
  t3_thread_configuration: tool(["读取", "正在读取", "读取", "会话配置"], "thread-configuration"),
  t3_thread_configure: tool(["设置", "正在设置", "设置", "会话模型"], "thread-configure"),
  t3_thread_fork: tool(["分叉", "正在分叉", "已请求分叉", "此会话"], "thread-fork"),
  t3_thread_merge_back: tool(["合并", "正在合并", "已请求合并", "会话上下文"], "thread-merge"),
  t3_thread_search: tool(["搜索", "正在搜索", "已搜索", "会话内容"], "thread-search"),
  t3_thread_transfers: tool(["读取", "正在读取", "读取", "会话移交记录"], "thread-transfers"),
  t3_thread_organize: tool(["整理", "正在整理", "已整理", "会话"], "thread-organize"),
  t3_thread_update: tool(["更新", "正在更新", "已更新", "T3 会话元数据"], "thread-update"),
  t3_worktree_list: tool(["列出", "正在列出", "已列出", "工作区分支"], "worktree-list"),
  t3_preview_list: tool(["列出", "正在列出", "已列出", "预览标签页"], "browser", "browser"),
  t3_preview_close: tool(["关闭", "正在关闭", "已关闭", "预览标签页"], "browser", "browser"),
  t3_environment_read: tool(["读取", "正在读取", "读取", "环境偏好"], "environment-read"),
  t3_environment_preferences_update: tool(
    ["更新", "正在更新", "已更新", "环境偏好"],
    "environment-update",
  ),
  t3_thread_launch: tool(["启动", "正在启动", "已启动", "项目会话"], "thread-create"),
  t3_project_list: tool(["列出", "正在列出", "已列出", "项目"], "project-list"),
  t3_project_read: tool(["读取", "正在读取", "读取", "项目"], "project-read"),
  t3_project_create: tool(["注册", "正在注册", "已注册", "项目"], "project-create"),
  t3_project_update: tool(["更新", "正在更新", "已更新", "项目"], "project-update"),
  t3_project_delete: tool(["删除", "正在删除", "已删除", "项目"], "project-delete"),
  t3_project_clone: tool(["克隆", "正在克隆", "已克隆", "仓库"], "project-clone"),
  t3_attachment_prepare_upload: tool(
    ["准备", "正在准备", "已准备", "附件上传"],
    "attachment-prepare",
  ),
  t3_attachment_discard: tool(["丢弃", "正在丢弃", "已丢弃", "待发送附件"], "attachment-discard"),
  t3_thread_send_attachments: tool(["发送", "正在发送", "已发送", "附件"], "attachment-send"),
  html_preview: tool(["预览", "正在预览", "已预览", "HTML 页面"], "html-preview"),
  html_render: tool(["渲染", "正在渲染", "已渲染", "HTML 页面"], "html-render"),
};

/**
 * The T3 orchestration tool inventory, used to gate loose name matching on
 * both the server (ACP MCP identity recovery) and the client (logo branding).
 */
export const T3_MCP_TOOL_NAMES: ReadonlySet<string> = new Set(Object.keys(T3_MCP_TOOLS));

function normalizeT3McpToolLabel(value: string): string {
  return value.replace(/\s+(?:complete|completed)\s*$/i, "").trim();
}

/**
 * ACP agents disagree on how the injected T3 server prefixes its tools:
 * `mcp__t3-code__x` (Claude/Cursor), `t3-code.x` (Codex), plus single
 * underscore, colon, slash, dash, and space separators seen from registry
 * agents. The prefix match is deliberately loose because the display-name
 * inventory is the real gate; unknown tools stay on the generic renderer.
 */
function resolveT3McpToolName(value: string): string | null {
  const label = normalizeT3McpToolLabel(value);
  const mcpMatch = /^mcp__(?<server>.+?)__(?<tool>.+)$/i.exec(label);
  if (mcpMatch?.groups) {
    const { server, tool } = mcpMatch.groups;
    return server !== undefined &&
      tool !== undefined &&
      T3_MCP_SERVER_ALIASES.has(server.toLowerCase())
      ? tool
      : null;
  }

  const namespaceMatch = /^(?<server>t3-code|t3_code|t3code)(?:[.:/]|\s*·\s*)(?<tool>.+)$/i.exec(
    label,
  );
  if (namespaceMatch?.groups) {
    return namespaceMatch.groups.tool ?? null;
  }

  const prefixed = /^(?:mcp[-_]{1,2})?(?:t3[-_ ]?code|fr code)(?:__|[-_.:/ ])(?<tool>.+)$/i.exec(
    label,
  );
  const candidate = prefixed?.groups?.tool ?? label;
  if (Object.hasOwn(T3_MCP_TOOLS, candidate)) return candidate;
  // OpenCode 2 registers one server per thread, `t3-code-<thread>`, and joins
  // it to the tool with `_`. Thread ids can hold `_` too, so take the longest
  // known tool name that ends the label.
  if (!/^t3-code-/i.test(label)) return null;
  let longest: string | null = null;
  for (const tool of Object.keys(T3_MCP_TOOLS)) {
    if (label.endsWith(`_${tool}`) && tool.length > (longest?.length ?? 0)) longest = tool;
  }
  return longest;
}

/** The bare T3 tool name (`html_render`) for any provider's spelling of it. */
export function resolveT3McpToolId(toolName: string | null | undefined): string | null {
  const name = toolName == null ? null : resolveT3McpToolName(toolName);
  return name !== null && Object.hasOwn(T3_MCP_TOOLS, name) ? name : null;
}

export function resolveT3McpToolDefinition(
  toolName: string | null | undefined,
): T3McpToolDefinition | null {
  const name = toolName == null ? null : resolveT3McpToolName(toolName);
  return name !== null && Object.hasOwn(T3_MCP_TOOLS, name) ? T3_MCP_TOOLS[name]! : null;
}

export function resolveT3McpToolPresentation(
  toolName: string | null | undefined,
): T3McpToolPresentation | null {
  const definition = resolveT3McpToolDefinition(toolName);
  return definition === null ? null : { displayName: definition.displayName, logo: "t3-code" };
}

export function resolveT3McpToolSummaryAction(
  toolName: string | null | undefined,
): T3McpToolSummaryAction | null {
  return resolveT3McpToolDefinition(toolName)?.summaryAction ?? null;
}
