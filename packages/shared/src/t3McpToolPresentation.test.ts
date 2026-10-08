import { describe, expect, it } from "vite-plus/test";

import { T3_MCP_TOOL_NAMES, resolveT3McpToolPresentation } from "./t3McpToolPresentation.ts";

describe("resolveT3McpToolPresentation", () => {
  it("recognizes every T3 tool across provider prefixes and completion suffixes", () => {
    for (const tool of T3_MCP_TOOL_NAMES) {
      const presentation = resolveT3McpToolPresentation(tool);
      for (const prefix of [
        "mcp__t3-code__",
        "mcp__t3_code__",
        "mcp__t3code__",
        "T3-code.",
        "t3_code/",
        "t3code:",
        "mcp_t3-code_",
        "FR Code ",
        "t3-code · ",
      ]) {
        expect(resolveT3McpToolPresentation(`${prefix}${tool} completed`), tool).toEqual(
          presentation,
        );
      }
      expect(resolveT3McpToolPresentation(`mcp__another-server__${tool}`), tool).toBeNull();
    }
  });
  it("pretty prints Claude and Cursor T3 MCP tool names", () => {
    expect(resolveT3McpToolPresentation("mcp__t3-code__t3_thread_read")).toEqual({
      displayName: "读取 T3 会话",
      logo: "t3-code",
    });
  });

  it("pretty prints Codex T3 MCP tool names", () => {
    expect(resolveT3McpToolPresentation("t3-code.create_threads")).toEqual({
      displayName: "创建 T3 会话",
      logo: "t3-code",
    });
  });

  it("pretty prints thread metadata updates", () => {
    expect(resolveT3McpToolPresentation("mcp__t3-code__t3_thread_update")).toEqual({
      displayName: "更新 T3 会话元数据",
      logo: "t3-code",
    });
  });

  it("pretty prints bare T3 MCP toolkit names", () => {
    expect(resolveT3McpToolPresentation("list_scheduled_tasks")).toEqual({
      displayName: "列出 定时任务",
      logo: "t3-code",
    });
  });

  it("pretty prints worktree T3 MCP tool names", () => {
    expect(resolveT3McpToolPresentation("mcp__t3-code__t3_worktree_handoff")).toEqual({
      displayName: "移交 会话到 Git 工作树",
      logo: "t3-code",
    });
    expect(resolveT3McpToolPresentation("t3-code.t3_worktree_status")).toEqual({
      displayName: "获取 会话工作树状态",
      logo: "t3-code",
    });
  });

  it("pretty prints preview T3 MCP tool names", () => {
    expect(resolveT3McpToolPresentation("T3-code.preview_open")).toEqual({
      displayName: "打开 预览浏览器中的页面",
      logo: "t3-code",
    });
    expect(resolveT3McpToolPresentation("mcp__t3-code__preview_status")).toEqual({
      displayName: "获取 预览浏览器状态",
      logo: "t3-code",
    });
  });

  it("matches the separator variants ACP registry agents emit", () => {
    for (const name of [
      "mcp_t3-code_delegate_task",
      "t3_code:delegate_task",
      "t3code/delegate_task",
      "t3-code delegate_task",
      "FR Code delegate_task",
      "t3-code__delegate_task",
    ]) {
      expect(resolveT3McpToolPresentation(name)?.displayName).toBe("委派 子任务");
    }
  });

  it("matches OpenCode 2's per-thread server names, whose thread ids hold underscores", () => {
    expect(
      resolveT3McpToolPresentation("t3-code-thread_opencode2-adapter_delegate_task")?.displayName,
    ).toBe("委派 子任务");
    expect(resolveT3McpToolPresentation("t3-code-thread_opencode2-adapter_not_a_tool")).toBeNull();
  });

  it("keeps unknown MCP tools on the generic renderer path", () => {
    expect(resolveT3McpToolPresentation("mcp__github__search_issues")).toBeNull();
    expect(resolveT3McpToolPresentation("t3-code.not_a_real_tool")).toBeNull();
  });
});
