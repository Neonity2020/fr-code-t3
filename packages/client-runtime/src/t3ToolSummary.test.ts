import { describe, expect, it } from "vite-plus/test";

import { summarizeT3ToolCalls, type T3ToolSummaryCall } from "./t3ToolSummary.ts";

function completed(input: unknown, output?: unknown): T3ToolSummaryCall {
  return { input, output, outcome: "completed" };
}

describe("summarizeT3ToolCalls", () => {
  it("counts registered projects, repository destinations, and accepted thread launches", () => {
    expect(
      summarizeT3ToolCalls("project-create", [
        completed({}, { id: "project-1" }),
        completed({}, { id: "project-1" }),
        completed({}, { id: "project-2" }),
      ]).label,
    ).toBe("已注册 2 个项目");
    expect(
      summarizeT3ToolCalls("project-clone", [
        completed({}, { cwd: "/tmp/first" }),
        completed({}, { cwd: "/tmp/second" }),
      ]).label,
    ).toBe("已克隆 2 个仓库");
    expect(
      summarizeT3ToolCalls("thread-create", [
        completed({}, { threadId: "launched-thread", status: "preparing" }),
      ]).label,
    ).toBe("已创建 1 个会话");
  });

  it.each([
    ["queue-read", "已读取 1 条排队消息"],
    ["queue-edit", "已编辑 1 条排队消息"],
    ["queue-cancel", "已请求取消 1 次排队运行"],
    ["queue-reorder", "已重新排序 1 次排队运行"],
    ["queue-steer", "已请求使用消息引导 1 条排队消息"],
  ] as const)("deduplicates the queued run target for %s", (action, label) => {
    expect(
      summarizeT3ToolCalls(action, [
        completed({ queuedRunId: "queued-1" }),
        completed({ queuedRunId: "queued-1" }),
        { input: { queuedRunId: "queued-2" }, output: undefined, outcome: "unfinished" },
      ]),
    ).toEqual({ label, failedCount: 0 });
  });

  it("counts answered requests rather than pretending every request contains one question", () => {
    expect(
      summarizeT3ToolCalls("question-respond", [
        completed({ requestId: "request-1", answers: { one: ["Yes"], two: ["No"] } }),
        completed({ requestId: "request-1" }),
        completed({ requestId: "request-2" }),
      ]).label,
    ).toBe("已回答 2 个待回答问题请求");
  });

  it("counts attachments in distinct messages and falls back when attachment counts are missing", () => {
    const first = completed(
      { threadId: "thread-1", attachments: [{ id: "one" }, { id: "two" }] },
      { messageId: "message-1", threadId: "thread-1" },
    );
    const second = completed(
      { threadId: "thread-2", attachments: [{ id: "one" }] },
      { messageId: "message-2", threadId: "thread-2" },
    );
    expect(summarizeT3ToolCalls("attachment-send", [first, first, second])).toEqual({
      label: "已发送 3 个附件 到 2 个会话",
      failedCount: 0,
    });
    expect(
      summarizeT3ToolCalls("attachment-send", [first, completed({ threadId: "thread-1" })]).label,
    ).toBe("已发送 附件 到 1 个会话 2 次");
  });

  it("keeps repeated manual runs separate and describes asynchronous controls as requests", () => {
    expect(
      summarizeT3ToolCalls("schedule-run", [
        completed({ taskId: "schedule-1" }, { lastRunStatus: "running" }),
        completed({ taskId: "schedule-1" }, { lastRunStatus: "skipped" }),
      ]).label,
    ).toBe("已请求 2 次定时任务运行");
    expect(
      summarizeT3ToolCalls("thread-fork", [completed({}, { targetThreadId: "fork", sequence: 3 })])
        .label,
    ).toBe("已请求 1 次会话分叉");
    expect(
      summarizeT3ToolCalls("thread-merge", [
        completed({ targetThreadId: "parent" }, { sequence: 4 }),
      ]).label,
    ).toBe("已请求 1 次上下文合并");
  });

  it.each([
    "WorktreeMcpFailure",
    "DeviceOperationError",
    "PreviewAutomationExecutionError",
    "PullRequestOperationError",
  ])("treats a returned %s as a failed call even if the provider says completed", (_tag) => {
    const output = [
      {
        type: "content",
        content: { type: "text", text: JSON.stringify({ _tag, message: "Unavailable" }) },
      },
    ];
    expect(summarizeT3ToolCalls("browser", [completed({}, output)])).toEqual({
      label: "尝试使用 浏览器 1 次",
      failedCount: 1,
    });
  });
  it("counts messages and distinct destinations across delivery modes, deduplicating retries", () => {
    const calls = Array.from({ length: 5 }, (_, i) =>
      completed(
        { threadId: `thread-${i % 2}`, mode: ["auto", "queue", "steer", "restart"][i % 4] },
        { messageId: `message-${i}`, threadId: `thread-${i % 2}` },
      ),
    );
    expect(summarizeT3ToolCalls("thread-send", [...calls, calls[0]!])).toEqual({
      label: "已发送 5 条消息 到 2 个会话",
      failedCount: 0,
    });
  });

  it("reads provider result envelopes without treating JSON in the message as result data", () => {
    const result = { messageId: "message-1", threadId: "actual-thread" };
    const json = JSON.stringify(result);
    const outputs = [
      result,
      { structuredContent: result },
      [{ type: "text", text: json }],
      { content: [{ text: { text: json } }], isError: false },
      json,
    ];
    const calls = outputs.map((output) =>
      completed(
        {
          toolName: "t3_thread_send",
          args: { threadId: "input-thread", message: '{"threadId":"fake"}' },
        },
        output,
      ),
    );
    expect(summarizeT3ToolCalls("thread-send", calls).label).toBe("已发送 1 条消息 到 1 个会话");
    expect(
      summarizeT3ToolCalls("thread-send", [
        completed({ toolName: "t3_thread_send", args: { threadId: "input-thread" } }),
        completed({ threadId: "input-thread" }),
      ]).label,
    ).toBe("已发送 2 条消息 到 1 个会话");
  });

  it("falls back to message counts when a destination is missing or a result is malformed", () => {
    expect(
      summarizeT3ToolCalls("thread-send", [
        completed({ threadId: "known" }),
        completed({ message: '{"threadId":"not-a-destination"}' }, "{truncated"),
        completed(undefined, "Message sent"),
      ]).label,
    ).toBe("已发送 3 条消息");
  });

  it("counts batch-created threads, excludes rollbacks, and deduplicates returned thread IDs", () => {
    const threads = Array.from({ length: 4 }, (_, i) => ({
      threadId: `thread-${i}`,
      status: "running",
    }));
    expect(
      summarizeT3ToolCalls("thread-create", [
        completed(
          {},
          { threads: [...threads, { threadId: "rolled-back", status: "rolled_back" }] },
        ),
        completed({}, { threadId: "thread-0", status: "running" }),
      ]).label,
    ).toBe("已创建 4 个会话");
    expect(
      summarizeT3ToolCalls("thread-create", [
        completed({ threads: [{ title: "Requested, not confirmed" }] }),
      ]).label,
    ).toBe("已请求创建会话 1 次");
  });

  it("excludes failed and unfinished sends even if the provider reports completed", () => {
    const calls: T3ToolSummaryCall[] = [
      completed({ threadId: "success" }, { messageId: "ok", threadId: "success" }),
      completed(
        { threadId: "failed" },
        { isError: true, structuredContent: { threadId: "failed" } },
      ),
      completed({ threadId: "failed" }, [
        { type: "text", text: JSON.stringify({ _tag: "OrchestratorMcpFailure" }) },
      ]),
      { input: { threadId: "cancelled" }, output: undefined, outcome: "unfinished" },
    ];
    expect(summarizeT3ToolCalls("thread-send", calls)).toEqual({
      label: "已发送 1 条消息 到 1 个会话",
      failedCount: 2,
    });
    expect(summarizeT3ToolCalls("thread-send", [calls[1]!])).toEqual({
      label: "尝试发送 1 条消息 到 1 个会话",
      failedCount: 1,
    });
  });

  it("does not confuse a child's failure or wait timeout with failure of the orchestration call", () => {
    const failedChild = { taskId: "task-1", status: "failed", summary: "command not found" };
    expect(
      summarizeT3ToolCalls("delegate", [completed({}, failedChild), completed({}, failedChild)]),
    ).toEqual({
      label: "已委派 1 个任务",
      failedCount: 0,
    });
    expect(
      summarizeT3ToolCalls(
        "task-status",
        Array.from({ length: 4 }, () => completed({ taskId: "task-1" }, failedChild)),
      ).label,
    ).toBe("已检查 任务状态 4 次");
    expect(
      summarizeT3ToolCalls("thread-wait", [
        completed({ threadId: "thread-1" }, { threadId: "thread-1", timedOut: true }),
      ]),
    ).toEqual({
      label: "已等待 1 个会话",
      failedCount: 0,
    });
  });

  it("describes control requests without claiming that a thread stopped or a task was deleted", () => {
    expect(
      summarizeT3ToolCalls("thread-interrupt", [
        completed(
          { threadId: "thread-1" },
          { threadId: "thread-1", status: "interrupt_requested" },
        ),
      ]).label,
    ).toBe("已请求中断 1 个会话");
    expect(
      summarizeT3ToolCalls("task-cancel", [
        completed({ taskId: "task-1" }, { taskId: "task-1", status: "cancel_requested" }),
      ]).label,
    ).toBe("已请求取消 1 个任务");
    expect(
      summarizeT3ToolCalls("schedule-delete", [
        completed(
          { scheduledTaskId: "schedule-1" },
          { scheduledTaskId: "schedule-1", deleted: false },
        ),
      ]).label,
    ).toBe("已请求删除 1 个定时任务");
  });
});
