import { describe, expect, it } from "vite-plus/test";

import { ThreadId, TurnItemId, type OrchestrationV2TurnItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { T3_MCP_TOOL_NAMES } from "@t3tools/shared/t3McpToolPresentation";

import {
  commandDetailRepeatsCommand,
  extractCommandOutputText,
  resolveViewedImageAsset,
  resolveWorkEntryToolPresentation,
  summarizeToolGroup,
  toolGroupAction,
  toolGroupSummaryKind,
  toolItemForDisplay,
  type WorkLogPresentationEntry,
  type WorkLogToolLifecycleStatus,
  workEntryViewedImagePath,
  workEntryIndicatesToolFailure,
  workEntryDisplayIndicatesToolFailure,
  workEntryIndicatesToolSuccess,
} from "./presentation.js";

function commandItem(
  fields: Partial<Extract<OrchestrationV2TurnItem, { type: "command_execution" }>> = {},
): OrchestrationV2TurnItem {
  return {
    id: TurnItemId.make("command"),
    threadId: ThreadId.make("thread"),
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 1,
    status: "completed",
    title: null,
    startedAt: null,
    completedAt: null,
    updatedAt: DateTime.makeUnsafe("2026-09-08T00:00:00.000Z"),
    type: "command_execution",
    input: 'rg "command not found"',
    exitCode: 0,
    ...fields,
  };
}

describe("workEntryIndicatesToolFailure", () => {
  const base = {
    id: "w1",
    createdAt: "2026-01-01T00:00:00.000Z",
    label: "Read",
  };

  it.each([
    [{ outputIndicatesFailure: true }, true],
    [{ exitCode: 2 }, true],
    [{ output: "sh: missing-command: command not found" }, true],
    [{ output: "Found 3 matches" }, false],
    [{ output: `${"x".repeat(32_768)} command not found` }, false],
    [{}, false],
  ] as const)(
    "preserves command failure state after removing displayed output: %j",
    (fields, failed) => {
      const structuredPayload = commandItem(fields);
      const entry: WorkLogPresentationEntry = {
        ...base,
        tone: "tool",
        itemType: "command_execution",
        toolLifecycleStatus: "completed",
        structuredPayload,
      };
      expect(workEntryDisplayIndicatesToolFailure(entry)).toBe(failed);
      expect(workEntryIndicatesToolSuccess(entry)).toBe(!failed);
      expect(JSON.stringify(toolItemForDisplay(structuredPayload))).not.toContain('"output":');
    },
  );

  it("is true for error tone", () => {
    expect(
      workEntryIndicatesToolFailure({
        ...base,
        tone: "error",
        detail: "nothing special",
      }),
    ).toBe(true);
  });

  it("is true when lifecycle says failed even if detail is empty", () => {
    expect(
      workEntryIndicatesToolFailure({
        ...base,
        tone: "tool",
        toolLifecycleStatus: "failed",
      }),
    ).toBe(true);
  });

  it("detects file-not-found style tool output with completed lifecycle", () => {
    expect(
      workEntryIndicatesToolFailure({
        ...base,
        tone: "tool",
        toolLifecycleStatus: "completed",
        detail: "File not found: C:\\foo\\nonexistent.ts",
      }),
    ).toBe(true);
  });

  it("detects glob no files and PowerShell command errors", () => {
    expect(
      workEntryIndicatesToolFailure({
        ...base,
        label: "Glob",
        tone: "tool",
        detail: "No files found",
      }),
    ).toBe(true);
    expect(
      workEntryIndicatesToolFailure({
        ...base,
        label: "Bash",
        tone: "tool",
        detail:
          "The term 'this_is_not_a_command' is not recognized as the name of a cmdlet, function, script file, or operable program.",
      }),
    ).toBe(true);
  });

  it("is false for successful completed tools", () => {
    expect(
      workEntryIndicatesToolFailure({
        ...base,
        tone: "tool",
        toolLifecycleStatus: "completed",
        detail: "Found 3 matching files",
      }),
    ).toBe(false);
  });

  it("does not treat error text in a command as rendered failure", () => {
    const entry = {
      ...base,
      label: "Ran command",
      tone: "tool",
      toolLifecycleStatus: "completed",
      command: 'rg "file not found"',
      detail: "Found 3 matches",
    } satisfies WorkLogPresentationEntry;

    expect(workEntryDisplayIndicatesToolFailure(entry)).toBe(false);
    // Older activities can store output in this field, so that path stays separate.
    expect(workEntryIndicatesToolFailure(entry)).toBe(true);
    expect(workEntryDisplayIndicatesToolFailure({ ...entry, detail: "File not found" })).toBe(true);
  });

  it("treats successful tool rows as success candidates", () => {
    expect(
      workEntryIndicatesToolSuccess({
        ...base,
        tone: "tool",
        toolLifecycleStatus: "completed",
        detail: "ok",
      }),
    ).toBe(true);
    expect(
      workEntryIndicatesToolSuccess({
        ...base,
        tone: "tool",
        toolLifecycleStatus: "inProgress",
        detail: "…",
      }),
    ).toBe(false);
    expect(workEntryIndicatesToolSuccess({ ...base, tone: "thinking", detail: "…" })).toBe(false);
    expect(
      workEntryIndicatesToolSuccess({ ...base, tone: "tool", toolLifecycleStatus: "stopped" }),
    ).toBe(false);
    expect(
      workEntryIndicatesToolSuccess({ ...base, tone: "tool", toolLifecycleStatus: "idle" }),
    ).toBe(false);
  });

  it("does not run heuristics on non-tool info rows", () => {
    expect(
      workEntryIndicatesToolFailure({
        ...base,
        label: "Context compacted",
        tone: "info",
        detail: "File not found in conversation",
      }),
    ).toBe(false);
  });
});

describe("summarizeToolGroup", () => {
  const entry = (
    id: string,
    overrides: Partial<WorkLogPresentationEntry>,
  ): WorkLogPresentationEntry => ({
    id,
    createdAt: "2026-09-01T00:00:00Z",
    label: "Tool call",
    tone: "tool",
    ...overrides,
  });

  it("excludes reasoning from mixed tool counts and icons", () => {
    const thought = entry("thought", {
      itemType: "reasoning",
      tone: "thinking",
      detail: "Check the source",
    });
    const command = entry("command", { itemType: "command_execution", command: "vp test run" });
    expect(summarizeToolGroup([thought, command, { ...thought, id: "thought-2" }])).toEqual({
      summary: "已运行 1 条命令",
      hasFailure: false,
    });
    expect(toolGroupSummaryKind([thought, command])).toBe("command");
    expect(summarizeToolGroup([thought]).summary).toBe("已思考");
    expect(summarizeToolGroup([thought, { ...thought, id: "thought-2" }]).summary).toBe(
      "已思考（×2）",
    );
    expect(toolGroupSummaryKind([thought])).toBe("reasoning");
  });

  it("counts created threads alongside adjacent commands", () => {
    expect(
      summarizeToolGroup([
        entry("command", { itemType: "command_execution", command: "vp test run" }),
        entry("created", {
          itemType: "thread_created",

          label: "Created thread",
        }),
      ]).summary,
    ).toBe("已运行 1 条命令；已创建 1 个会话");
  });

  it("deduplicates named sources ahead of ordinary actions", () => {
    const source = { key: "browser-use:chrome", name: "Chrome", kind: "integration" as const };
    expect(
      summarizeToolGroup([
        entry("open", { label: "Open page", toolSource: source }),
        entry("inspect", { label: "Inspect page", toolSource: source }),
        entry("command", {
          label: "Ran command",
          itemType: "command_execution",
          command: "git status",
        }),
      ]).summary,
    ).toBe("已使用 Chrome 集成；已运行 1 条命令");
  });

  it("omits the integration suffix for special browser and computer sources", () => {
    expect(
      summarizeToolGroup([
        entry("inspect", {
          label: "Inspect page",
          toolSource: { key: "browser-use", name: "Browser", kind: "browser" },
        }),
        entry("click", {
          label: "Click",
          toolSource: { key: "computer-use", name: "Computer Use", kind: "computer" },
        }),
      ]).summary,
    ).toBe("已使用 Browser和Computer Use");
  });
});

describe("resolveWorkEntryToolPresentation", () => {
  it("presents and summarizes every T3 tool using the same structured identity", () => {
    for (const tool of T3_MCP_TOOL_NAMES) {
      const entry: WorkLogPresentationEntry = {
        id: tool,
        createdAt: "2026-09-19T00:00:00.000Z",
        tone: "tool",
        label: "Custom provider title",
        toolData: { server: "t3-code", tool },
        toolLifecycleStatus: "completed",
        itemType: "dynamic_tool",
        toolSource: { key: "t3-code", name: "FR Code", kind: "integration" },
      };
      const presentation = resolveWorkEntryToolPresentation(entry);
      expect(presentation, tool).not.toBeNull();
      expect(presentation?.displayName, tool).not.toContain(tool);
      const summary = summarizeToolGroup([entry]);
      expect(summary.summary, tool).not.toMatch(/已使用 (?:1 个工具|FR Code 集成)/);
      expect(summary.hasFailure, tool).toBe(false);
      const failed = { ...entry, toolLifecycleStatus: "failed" as const };
      expect(resolveWorkEntryToolPresentation(failed)?.displayName, tool).toMatch(/^无法/);
      expect(summarizeToolGroup([failed]).hasFailure, tool).toBe(true);
      expect(summarizeToolGroup([failed]).summary, tool).toMatch(/^(?:尝试|已请求创建会话)/);
    }
  });

  it.each([
    ["t3_project_list", "正在列出 项目", "已列出 项目"],
    ["t3_project_clone", "正在克隆 仓库", "已克隆 仓库"],
    ["t3_project_create", "正在注册 项目", "已注册 项目"],
    ["t3_thread_launch", "正在启动 项目会话", "已启动 项目会话"],
    ["t3_queue_edit", "正在编辑 排队消息", "已编辑 排队消息"],
    ["t3_pending_request_respond", "正在回答 待回答问题", "已回答 待回答问题"],
    ["t3_thread_configure", "正在设置 会话模型", "设置 会话模型"],
    ["t3_thread_fork", "正在分叉 此会话", "已请求分叉 此会话"],
    ["t3_thread_send_attachments", "正在发送 附件", "已发送 附件"],
    ["run_scheduled_task_now", "正在运行 定时任务", "已请求运行 定时任务"],
  ])("labels %s through its lifecycle", (tool, running, completed) => {
    expect(resolveWorkEntryToolPresentation({ label: `T3-code.${tool}` })?.displayName).toBe(
      running,
    );
    expect(
      resolveWorkEntryToolPresentation({
        label: `T3-code.${tool}`,
        toolLifecycleStatus: "completed",
      })?.displayName,
    ).toBe(completed);
  });

  it("summarizes project tools from MCP arguments and results without claiming failed effects", () => {
    const entry: WorkLogPresentationEntry = {
      id: "clone",
      createdAt: "2026-09-19T00:00:00.000Z",
      tone: "tool",
      label: "Custom title",
      itemType: "dynamic_tool",
      toolLifecycleStatus: "completed",
      toolData: {
        server: "t3-code",
        tool: "t3_project_clone",
        arguments: { url: "https://github.com/acme/repo" },
        result: { cwd: "/tmp/repo" },
      },
    };
    const list = { ...entry, toolData: { server: "t3-code", tool: "t3_project_list" } };
    expect(summarizeToolGroup([list, entry])).toEqual({
      summary: "已列出 项目 1 次；已克隆 1 个仓库",
      hasFailure: false,
    });
    const failed = {
      ...entry,
      toolData: { toolName: "T3-code.t3_project_clone", rawOutput: { isError: true } },
    };
    expect(summarizeToolGroup([entry, failed])).toEqual({
      summary: "已克隆 1 个仓库",
      hasFailure: true,
    });
  });

  it("does not summarize a foreign structured identity as T3 work", () => {
    const entry: WorkLogPresentationEntry = {
      id: "foreign",
      createdAt: "2026-09-19T00:00:00.000Z",
      tone: "tool",
      label: "t3_project_clone",
      toolLifecycleStatus: "completed",
      toolData: { server: "another-server", tool: "t3_project_clone" },
    };
    expect(summarizeToolGroup([entry]).summary).toBe("已使用 1 个工具");
  });

  it("shows returned MCP errors as failures even in the live activity row", () => {
    const entry: WorkLogPresentationEntry = {
      id: "clone",
      createdAt: "2026-09-19T00:00:00.000Z",
      tone: "tool",
      label: "T3-code.t3_project_clone",
      toolLifecycleStatus: "inProgress",
      itemType: "dynamic_tool",
      toolData: { output: { isError: true } },
    };
    expect(resolveWorkEntryToolPresentation(entry)?.displayName).toBe("无法克隆 仓库");
    expect(workEntryDisplayIndicatesToolFailure(entry)).toBe(true);
    expect(workEntryIndicatesToolSuccess(entry)).toBe(false);
    const childFailure = {
      ...entry,
      label: "T3-code.task_status",
      toolLifecycleStatus: "completed" as const,
      toolData: { output: { taskId: "child", status: "failed", summary: "command not found" } },
    };
    expect(workEntryDisplayIndicatesToolFailure(childFailure)).toBe(false);
    expect(workEntryIndicatesToolSuccess(childFailure)).toBe(true);
  });
  it.each([
    "mcp__t3-code__preview_click",
    "mcp__t3_code__preview_click",
    "mcp__t3code__preview_click",
    "T3-code.preview_click",
    "t3-code · preview_click completed",
    "t3_code/preview_click",
    "preview_click",
  ])("recognizes browser tool names across providers: %s", (label) => {
    expect(resolveWorkEntryToolPresentation({ label })).toEqual({
      displayName: "正在点击 预览浏览器",
      icon: "browser",
    });
  });

  it("labels device tools with the device icon", () => {
    expect(
      resolveWorkEntryToolPresentation({
        label: "mcp__t3-code__device_open",
        toolLifecycleStatus: "completed",
      }),
    ).toEqual({ displayName: "已打开 设备面板中的设备", icon: "device" });
    expect(resolveWorkEntryToolPresentation({ label: "t3-code · device_screenshot" })).toEqual({
      displayName: "正在截屏 设备",
      icon: "device",
    });
  });

  it("uses structured MCP identity when the provider supplies a custom title", () => {
    expect(
      resolveWorkEntryToolPresentation({
        label: "Tool call complete",
        toolTitle: "Inspect the current page",
        toolData: { server: "t3-code", tool: "preview_snapshot", result: { title: "Example" } },
      }),
    ).toEqual({ displayName: "正在拍摄快照 预览页面", icon: "browser" });
  });

  it.each([
    ["inProgress", "正在点击 预览浏览器"],
    ["completed", "已点击 预览浏览器"],
    ["failed", "无法点击 预览浏览器"],
    ["declined", "已拒绝点击 预览浏览器"],
    ["stopped", "已停止点击 预览浏览器"],
    ["unknown", "正在点击 预览浏览器"],
  ] as const)("describes the tool's own %s state", (toolLifecycleStatus, displayName) => {
    expect(
      resolveWorkEntryToolPresentation({
        label: "T3-code.preview_click",
        toolLifecycleStatus: toolLifecycleStatus as WorkLogToolLifecycleStatus,
      }),
    ).toEqual({ displayName, icon: "browser" });
  });

  it("uses the summary's state only when the provider omitted a lifecycle status", () => {
    const entry = { label: "T3-code.preview_click" };
    expect(resolveWorkEntryToolPresentation(entry, "inProgress")?.displayName).toBe(
      "正在点击 预览浏览器",
    );
    expect(resolveWorkEntryToolPresentation(entry, "completed")?.displayName).toBe(
      "已点击 预览浏览器",
    );
    expect(
      resolveWorkEntryToolPresentation({ ...entry, toolLifecycleStatus: "completed" }, "inProgress")
        ?.displayName,
    ).toBe("已点击 预览浏览器");
    expect(
      resolveWorkEntryToolPresentation({ ...entry, toolLifecycleStatus: "failed" }, "completed")
        ?.displayName,
    ).toBe("无法点击 预览浏览器");
  });

  it.each([
    ["preview_type", "正在输入 预览浏览器", "已输入 预览浏览器"],
    ["preview_set_appearance", "正在设置 预览浏览器外观", "设置 预览浏览器外观"],
    ["preview_snapshot", "正在拍摄快照 预览页面", "已拍摄快照 预览页面"],
    ["preview_recording_stop", "正在停止 预览浏览器录制", "已停止 预览浏览器录制"],
    ["t3_thread_read", "正在读取 T3 会话", "读取 T3 会话"],
    ["t3_thread_send", "正在发送 到 T3 会话", "已发送 到 T3 会话"],
    ["t3_worktree_handoff", "正在移交 会话到 Git 工作树", "已移交 会话到 Git 工作树"],
  ])("preserves verb forms and the rest of %s's label", (tool, running, completed) => {
    const entry = { label: `t3-code.${tool}` };
    expect(
      resolveWorkEntryToolPresentation({ ...entry, toolLifecycleStatus: "inProgress" })
        ?.displayName,
    ).toBe(running);
    expect(
      resolveWorkEntryToolPresentation({ ...entry, toolLifecycleStatus: "completed" })?.displayName,
    ).toBe(completed);
  });

  it("keeps T3 branding for non-browser tools and falls back to the original tool label", () => {
    expect(
      resolveWorkEntryToolPresentation({
        label: "mcp__t3_code__task_status",
        toolTitle: "Check the child task",
      }),
    ).toEqual({ displayName: "正在获取 委派任务状态", icon: "t3-code" });
  });

  it("does not brand unknown tools or another server's matching tool name", () => {
    for (const label of [
      "mcp__github__preview_click",
      "t3-code.unknown_tool",
      "t3-code.toString",
      "Search files",
    ]) {
      expect(resolveWorkEntryToolPresentation({ label })).toBeNull();
    }
    expect(
      resolveWorkEntryToolPresentation({
        label: "preview_click",
        toolData: { server: "another-server", tool: "preview_click" },
      }),
    ).toBeNull();
  });
});

describe("browser group summaries", () => {
  const summarizeGroupLabel = (entries: ReadonlyArray<WorkLogPresentationEntry>) =>
    summarizeToolGroup(entries).summary;
  const browserEntry: WorkLogPresentationEntry = {
    id: "browser",
    createdAt: "2026-09-01T00:00:00Z",
    label: "MCP tool call",
    toolData: { server: "t3-code", tool: "preview_click" },
    itemType: "dynamic_tool",
    toolLifecycleStatus: "completed",
    tone: "tool",
  };
  const commandEntry: WorkLogPresentationEntry = {
    id: "command",
    createdAt: "2026-09-01T00:00:00Z",
    label: "Ran command",
    command: "/bin/bash -lc 'vp test run'",
    itemType: "command_execution",
    toolLifecycleStatus: "completed",
    tone: "tool",
  };

  it.each([1, 18])("counts %s browser calls separately from generic tools", (count) => {
    const entries = Array.from({ length: count }, (_, index) => ({
      ...browserEntry,
      toolCallId: `browser-${index}`,
    }));
    expect(summarizeGroupLabel(entries)).toBe(`已使用 浏览器 ${count} 次`);
    expect(toolGroupSummaryKind(entries)).toBe("browser");
  });

  it("combines command and browser counts in a single sentence", () => {
    const entries = [
      ...Array.from({ length: 4 }, () => commandEntry),
      ...Array.from({ length: 15 }, () => browserEntry),
    ];
    expect(summarizeGroupLabel(entries)).toBe("已运行 4 条命令；已使用 浏览器 15 次");
    expect(toolGroupSummaryKind(entries)).toBe("mixed");
  });

  it("preserves first-seen action ordering alongside non-browser tools", () => {
    expect(
      summarizeGroupLabel([
        browserEntry,
        commandEntry,
        {
          ...browserEntry,
          toolData: { server: "t3-code", tool: "task_status" },
        },
      ]),
    ).toBe("已使用 浏览器 1 次；已运行 1 条命令；已执行 1 项其他操作");
  });

  it("recognizes Claude browser identity without treating script metadata as a shell command", () => {
    expect(
      summarizeGroupLabel([
        {
          ...browserEntry,
          command: "node inspect-page.js",
          toolData: { toolName: "mcp__t3_code__preview_evaluate" },
        },
      ]),
    ).toBe("已使用 浏览器 1 次");
  });

  it("keeps foreign tools and web searches out of the browser count", () => {
    expect(
      summarizeGroupLabel([
        browserEntry,
        {
          ...browserEntry,
          label: "preview_click",
          toolData: { server: "another-server", tool: "preview_click" },
        },
        {
          id: "search",
          createdAt: "2026-09-01T00:00:00Z",
          label: "Search",
          tone: "tool",
          itemType: "web_search",
        },
      ]),
    ).toBe("已使用 浏览器 1 次；已搜索网页 1 次；已执行 1 项其他操作");
  });

  it("keeps browser screenshots in the browser count while preserving their image path", () => {
    const entry = { ...browserEntry, viewedImagePath: "/workspace/page.png" };
    expect(summarizeGroupLabel([entry])).toBe("已使用 浏览器 1 次");
    expect(workEntryViewedImagePath(entry)).toBe("/workspace/page.png");
  });
});

describe("command work-log details", () => {
  it("extracts Claude result blocks and projected output", () => {
    expect(
      extractCommandOutputText({
        result: {
          content: [
            { type: "text", text: "first" },
            { type: "text", text: "second" },
          ],
        },
      }),
    ).toBe("first\nsecond");
    expect(extractCommandOutputText({ rawOutput: { content: "projected summary" } })).toBe(
      "projected summary",
    );
  });

  it("only removes a detail with the matching tool-name prefix", () => {
    expect(
      commandDetailRepeatsCommand({
        detail: "Bash: printf hello",
        command: "printf hello",
        rawCommand: null,
        toolName: "Bash",
        data: { toolName: "Bash", command: "printf hello" },
      }),
    ).toBe(true);
    expect(
      commandDetailRepeatsCommand({
        detail: "warning: printf hello",
        command: "printf hello",
        rawCommand: null,
        toolName: "Bash",
        data: { toolName: "Bash", command: "printf hello" },
      }),
    ).toBe(false);
  });

  it("treats an ingestion-truncated echo of a long command as a repeat", () => {
    const command = `git add -A && git commit -m "${"x".repeat(200)}"`;
    const truncated = `Bash: ${command}`.slice(0, 177) + "...";
    expect(
      commandDetailRepeatsCommand({
        detail: truncated,
        command,
        rawCommand: null,
        toolName: "Bash",
        data: { toolName: "Bash", command },
      }),
    ).toBe(true);
    expect(
      commandDetailRepeatsCommand({
        detail: "Bash: printf hello...",
        command: "printf goodbye",
        rawCommand: null,
        toolName: "Bash",
        data: { toolName: "Bash", command: "printf goodbye" },
      }),
    ).toBe(false);
  });

  it("treats ACP command echoes as synthetic even without a tool kind", () => {
    expect(
      commandDetailRepeatsCommand({
        detail: "pnpm test",
        command: "pnpm test",
        rawCommand: null,
        toolName: undefined,
        data: { toolCallId: "tool-1", command: "pnpm test" },
      }),
    ).toBe(true);
    expect(
      commandDetailRepeatsCommand({
        detail: "pnpm test",
        command: "pnpm test",
        rawCommand: null,
        toolName: undefined,
        data: { command: "pnpm test" },
      }),
    ).toBe(false);
  });
});

describe("workEntryViewedImagePath", () => {
  const entry = {
    id: "entry-1",
    createdAt: "2026-01-01T00:00:00Z",
    label: "Read",
    tone: "tool",
  } as const;

  it("returns a single image path from supported read entries", () => {
    expect(
      workEntryViewedImagePath({ ...entry, requestKind: "file-read", detail: " assets/a.png " }),
    ).toBe("assets/a.png");
    expect(
      workEntryViewedImagePath({
        ...entry,
        itemType: "dynamic_tool",
        toolTitle: "Read file",
        detail: "C:\\workspace\\a.webp",
      }),
    ).toBe("C:\\workspace\\a.webp");
    expect(
      workEntryViewedImagePath({
        ...entry,
        itemType: "dynamic_tool",
        detail: 'Read: {"file_path":"truncated..."}',
        viewedImagePath: " /workspace/reference image.webp ",
      }),
    ).toBe("/workspace/reference image.webp");
  });

  it("rejects non-image, multi-line, and non-read details", () => {
    expect(
      workEntryViewedImagePath({ ...entry, requestKind: "file-read", detail: "a.txt" }),
    ).toBeNull();
    expect(
      workEntryViewedImagePath({ ...entry, requestKind: "file-read", detail: "a.png\nb.png" }),
    ).toBeNull();
    expect(workEntryViewedImagePath({ ...entry, detail: "a.png" })).toBeNull();
  });
});

describe("toolGroupAction", () => {
  it("groups legacy Claude image reads with other reads", () => {
    expect(
      toolGroupAction({
        id: "legacy-read",
        createdAt: "2026-09-01T00:00:00Z",
        label: "Tool call",
        tone: "tool",
        itemType: "dynamic_tool",
        viewedImagePath: "/workspace/reference.png",
      }),
    ).toBe("read");
  });

  it("groups Claude Read and Grep from toolName, not file contents", () => {
    expect(
      toolGroupAction({
        id: "read",
        createdAt: "2026-09-01T00:00:00Z",
        label: "Read",
        tone: "tool",
        itemType: "dynamic_tool",
        toolTitle: "Read",
        toolData: { input: { file_path: "src/env.ts" } },
        structuredPayload: {
          type: "dynamic_tool",
          toolName: "Read",
          input: { file_path: "src/env.ts" },
        } as NonNullable<WorkLogPresentationEntry["structuredPayload"]>,
      }),
    ).toBe("read");
    expect(
      toolGroupAction({
        id: "grep",
        createdAt: "2026-09-01T00:00:00Z",
        label: "Grep",
        tone: "tool",
        itemType: "dynamic_tool",
        toolTitle: "Grep",
        toolData: { input: { pattern: "TODO", path: "apps/web" } },
        structuredPayload: {
          type: "dynamic_tool",
          toolName: "Grep",
          input: { pattern: "TODO", path: "apps/web" },
        } as NonNullable<WorkLogPresentationEntry["structuredPayload"]>,
      }),
    ).toBe("code-search");
  });
});

describe("resolveViewedImageAsset", () => {
  const threadId = ThreadId.make("thread-1");

  it("serves t3 attachment paths in place like any other host path", () => {
    const path = "/Users/demo/.t3/dev/attachments/11111111-1111-4111-8111-111111111111.png";
    expect(resolveViewedImageAsset(path, { threadId, workspaceRoot: "/workspace" })).toEqual({
      resource: { _tag: "media-file", threadId, path },
      alt: "11111111-1111-4111-8111-111111111111.png",
      srcFragment: "",
    });
  });

  it("normalizes workspace image sources", () => {
    expect(
      resolveViewedImageAsset("screens/logo.svg?v=2#mark", {
        threadId,
        workspaceRoot: "/workspace",
      }),
    ).toEqual({
      resource: {
        _tag: "media-file",
        threadId,
        path: "/workspace/screens/logo.svg",
      },
      alt: "logo.svg",
      srcFragment: "#mark",
    });
    expect(resolveViewedImageAsset("https://example.com/logo.png", { threadId })).toBeNull();
  });
});

describe("pull request tool presentation", () => {
  it.each([
    "mcp__t3-code__link_pull_request",
    "mcp__t3_code__link_pull_request",
    "T3-code · link_pull_request",
    "t3code/link_pull_request",
    "link_pull_request",
  ])("recognizes the native linking tool: %s", (label) => {
    const entry: WorkLogPresentationEntry = {
      id: "link",
      createdAt: "2026-09-10T00:00:00.000Z",
      label,
      tone: "tool",
      toolLifecycleStatus: "completed",
    };
    expect(resolveWorkEntryToolPresentation(entry)).toMatchObject({
      displayName: "已关联 拉取请求",
      icon: "pull-request",
    });
    expect(toolGroupAction(entry)).toBe("link-pr");
  });

  it.each([
    ["inProgress", "正在关联 拉取请求 #42"],
    ["completed", "已关联 拉取请求 #42"],
    ["failed", "无法关联 拉取请求 #42"],
    ["declined", "已拒绝关联 拉取请求 #42"],
    ["stopped", "已停止关联 拉取请求 #42"],
  ] as const)("describes the target and %s status", (toolLifecycleStatus, displayName) => {
    expect(
      resolveWorkEntryToolPresentation({
        label: "MCP tool call",
        toolTitle: "Custom title",
        toolLifecycleStatus,
        toolData: {
          server: "t3-code",
          tool: "link_pull_request",
          arguments: { url: "https://github.com/acme/web/pull/42" },
        },
      })?.displayName,
    ).toBe(displayName);
  });

  it("recognizes unlink targets supplied as repository and number", () => {
    expect(
      resolveWorkEntryToolPresentation({
        label: "MCP tool call",
        toolLifecycleStatus: "completed",
        toolData: {
          toolName: "mcp__t3-code__unlink_pull_request",
          rawInput: { repository: "acme/web", number: 42 },
        },
      }),
    ).toMatchObject({
      displayName: "已取消关联 拉取请求 #42",
      icon: "pull-request",
      action: "unlink-pr",
    });
  });

  it("summarizes native PR work separately from ordinary tools and integration metadata", () => {
    const link: WorkLogPresentationEntry = {
      id: "link",
      createdAt: "2026-09-10T00:00:00.000Z",
      label: "T3-code · link_pull_request",
      tone: "tool",
      itemType: "dynamic_tool",
      toolLifecycleStatus: "completed",
      toolSource: { key: "t3-code", name: "FR Code", kind: "integration" },
    };
    const list: WorkLogPresentationEntry = {
      ...link,
      label: "T3-code · list_thread_pull_requests",
    };
    expect(summarizeToolGroup([link, link, list]).summary).toBe(
      "已关联 2 个拉取请求；已检查 关联拉取请求",
    );
    expect(summarizeToolGroup([{ ...link, label: "T3-code · unlink_pull_request" }]).summary).toBe(
      "已取消关联 1 个拉取请求",
    );
    expect(toolGroupSummaryKind([link, link, list])).toBe("pull-request");
    expect(summarizeToolGroup([list, list]).summary).toBe("已检查 关联拉取请求 2 次");
    expect(
      resolveWorkEntryToolPresentation({ label: "mcp__another-server__link_pull_request" }),
    ).toBeNull();
  });
});

describe("device group summaries", () => {
  const deviceEntry = (tool: string): WorkLogPresentationEntry => ({
    id: tool,
    createdAt: "2026-09-10T00:00:00.000Z",
    label: "MCP tool call",
    toolData: { server: "t3-code", tool },
    itemType: "dynamic_tool",
    toolLifecycleStatus: "completed",
    tone: "tool",
  });

  it.each(["device_list", "device_open", "device_screenshot", "device_close"])(
    "recognizes %s as device controls",
    (tool) => {
      const entry = deviceEntry(tool);
      expect(summarizeToolGroup([entry]).summary).toBe("已使用 设备控件 1 次");
      expect(toolGroupSummaryKind([entry])).toBe("device");
    },
  );

  it("summarizes device calls alongside shell commands", () => {
    expect(
      summarizeToolGroup([
        {
          id: "command",
          createdAt: "2026-09-10T00:00:00.000Z",
          label: "Ran command",
          itemType: "command_execution",
          command: "pwd",
          tone: "tool",
        },
        deviceEntry("device_list"),
        deviceEntry("device_open"),
      ]).summary,
    ).toBe("已运行 1 条命令；已使用 设备控件 2 次");
  });

  it("recognizes Claude tool names and preserves screenshot previews", () => {
    const entry = {
      ...deviceEntry("device_screenshot"),
      toolData: { toolName: "mcp__t3_code__device_screenshot" },
      viewedImagePath: "/workspace/device.png",
    };
    expect(summarizeToolGroup([entry]).summary).toBe("已使用 设备控件 1 次");
    expect(workEntryViewedImagePath(entry)).toBe("/workspace/device.png");
  });

  it("does not classify another server's tools as T3 device controls", () => {
    expect(
      summarizeToolGroup([
        {
          ...deviceEntry("device_open"),
          toolData: { server: "another-server", tool: "device_open" },
        },
      ]).summary,
    ).toBe("已使用 1 个工具");
  });
});
