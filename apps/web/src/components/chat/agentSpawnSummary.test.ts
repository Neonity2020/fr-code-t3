import { describe, expect, it } from "vite-plus/test";
import type { RuntimeSubagent } from "@t3tools/client-runtime/state/subagentRuntime";
import { deriveAgentSpawnSummary } from "./agentSpawnSummary";

const batch = (status: RuntimeSubagent["status"]) => ({ kind: "subagent_batch" as const, status });
const agent = (status: RuntimeSubagent["status"]) => ({ kind: "subagent" as const, status });

describe("deriveAgentSpawnSummary", () => {
  it("counts a native batch without claiming the number of children", () => {
    expect(deriveAgentSpawnSummary({ agents: [batch("running")], agentCount: 1 })).toEqual({
      live: true,
      lead: "已启动 1 批子智能体",
      status: "1 个正在工作",
      tone: "working",
    });
    expect(deriveAgentSpawnSummary({ agents: [batch("idle")], agentCount: 1 })).toEqual({
      live: false,
      lead: "已启动 1 批子智能体",
      status: "1 个空闲",
      tone: "inactive",
    });
  });

  it("keeps individual agents and batches separate in a mixed group", () => {
    expect(
      deriveAgentSpawnSummary({
        agents: [agent("running"), batch("running"), batch("idle")],
        agentCount: 3,
      }).lead,
    ).toBe("已启动 1 个子智能体 和 2 批子智能体");
  });

  it.each([
    ["idle", "1 个空闲", "inactive"],
    ["cancelled", "1 个已停止", "inactive"],
    ["interrupted", "1 个已停止", "inactive"],
    ["failed", "1 个失败", "failed"],
    ["completed", "✓ 已完成", "completed"],
  ] as const)("reports %s accurately alongside a completed agent", (state, status, tone) => {
    expect(
      deriveAgentSpawnSummary({ agents: [agent("completed"), agent(state)], agentCount: 2 }),
    ).toMatchObject({ live: false, status, tone });
  });

  it("does not claim completion when the roster is missing a member", () => {
    expect(deriveAgentSpawnSummary({ agents: [agent("completed")], agentCount: 2 })).toMatchObject({
      status: "状态不可用",
      tone: "inactive",
    });
  });

  it("keeps a workflow active between child launches", () => {
    expect(
      deriveAgentSpawnSummary({
        agents: [agent("completed")],
        agentCount: 1,
        coordinatorStatus: "running",
      }),
    ).toMatchObject({ live: true, status: "正在工作", tone: "working" });
  });

  it.each([
    ["failed", "工作流失败", "failed"],
    ["cancelled", "工作流已停止", "inactive"],
  ] as const)(
    "preserves a %s workflow outcome when its children completed",
    (coordinatorStatus, status, tone) => {
      expect(
        deriveAgentSpawnSummary({ agents: [agent("completed")], agentCount: 1, coordinatorStatus }),
      ).toMatchObject({ live: false, status, tone });
    },
  );
});
