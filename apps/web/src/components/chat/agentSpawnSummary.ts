import {
  isActiveSubagentStatus,
  isTerminalSubagentStatus,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

/** Summarize observed states without treating idle or missing agents as completed. */
export function deriveAgentSpawnSummary({
  agents,
  agentCount,
  coordinatorStatus,
}: {
  agents: ReadonlyArray<Pick<RuntimeSubagent, "kind" | "status">>;
  agentCount: number;
  coordinatorStatus?: RuntimeSubagent["status"] | undefined;
}) {
  const working = agents.filter((agent) => isActiveSubagentStatus(agent.status)).length;
  const failed = agents.filter((agent) => agent.status === "failed").length;
  const idle = agents.filter((agent) => agent.status === "idle").length;
  const stopped = agents.filter(
    (agent) => agent.status === "cancelled" || agent.status === "interrupted",
  ).length;
  const batches = agents.filter((agent) => agent.kind === "subagent_batch").length;
  const individuals = agentCount - batches;
  // Workflow coordinators can keep running between dynamic member launches.
  const live =
    coordinatorStatus !== undefined ? !isTerminalSubagentStatus(coordinatorStatus) : working > 0;
  const subjects = [
    individuals > 0 ? `${individuals} 个子智能体` : null,
    batches > 0 ? `${batches} 批子智能体` : null,
  ]
    .filter(Boolean)
    .join(" 和 ");
  const lead = `${batches > 0 ? "已启动" : live ? "已发起" : "已运行"} ${subjects || "子智能体"}`;

  const status = live
    ? working > 0
      ? `${working} 个正在工作`
      : "正在工作"
    : coordinatorStatus === "failed"
      ? "工作流失败"
      : coordinatorStatus === "cancelled" || coordinatorStatus === "interrupted"
        ? "工作流已停止"
        : failed > 0
          ? `${failed} 个失败`
          : stopped > 0
            ? `${stopped} 个已停止`
            : idle > 0
              ? `${idle} 个空闲`
              : coordinatorStatus !== "completed" &&
                  (agents.length === 0 || agents.length < agentCount)
                ? "状态不可用"
                : "✓ 已完成";
  const tone = live
    ? "working"
    : failed > 0 || coordinatorStatus === "failed"
      ? "failed"
      : status === "✓ 已完成"
        ? "completed"
        : "inactive";
  return { live, lead, status, tone };
}
