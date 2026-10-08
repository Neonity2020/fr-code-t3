import type { PullRequestAction } from "@t3tools/contracts";
import { useUiStateStore } from "~/uiStateStore";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { resolvePullRequestMergeMethod } from "./pullRequestDetail.logic";
import { PullRequestGlyph } from "./pullRequestIcons";
import type { EnvironmentPullRequestEntry } from "./pullRequestList.logic";
import {
  usePullRequestActionRunner,
  usePullRequestDefaultMergeMethodResolver,
} from "./usePullRequestActions";

export interface PullRequestSpeedActionResult {
  readonly entry: EnvironmentPullRequestEntry;
  readonly action: PullRequestAction;
}

/** No detail or stack reads until a merge is clicked, even on a long list. */
export function PullRequestSpeedActions({
  entry,
  visible,
  onActed,
  closing = false,
  sweeping = false,
  onCloseSweepStart,
}: {
  entry: EnvironmentPullRequestEntry;
  visible: boolean;
  onActed: (result: PullRequestSpeedActionResult) => void;
  closing?: boolean;
  sweeping?: boolean;
  onCloseSweepStart?: (entry: EnvironmentPullRequestEntry, event: PointerEvent) => void;
}) {
  const resolveProjectDefault = usePullRequestDefaultMergeMethodResolver(
    entry.environmentId,
    entry.projectId,
  );
  const reference = {
    projectId: entry.projectId,
    host: entry.host,
    repository: entry.repository,
    number: entry.number,
  };
  const { actionPending, perform } = usePullRequestActionRunner({
    environmentId: entry.environmentId,
    reference,
    onSuccess: (action) => onActed({ entry, action }),
    resolveMergeMethod: (detail) => {
      const allowed = detail.capabilities.mergeMethods.filter(
        (method) => detail.mergeCapabilities[method],
      );
      if (allowed.length === 0)
        throw new Error("No merge method is available for this repository.");
      return resolvePullRequestMergeMethod(
        allowed,
        null,
        resolveProjectDefault(),
        useUiStateStore.getState().pullRequestMergeMethod,
      );
    },
  });
  const actions =
    entry.state === "closed"
      ? (["reopen"] as const)
      : entry.isDraft
        ? (["close", "ready"] as const)
        : (["close", "merge"] as const);
  const busy = actionPending || closing || sweeping;
  return (
    <div
      className="shrink-0 items-center gap-1 pr-3"
      style={{ display: visible || busy ? "flex" : "none" }}
      role="group"
      aria-label={`拉取请求 #${entry.number} 的快捷操作`}
      data-pull-request-action-pending={actionPending || closing}
    >
      {actions.map((action) => {
        const label = ACTIONS[action].label;
        const Icon = ACTIONS[action].Icon;
        return (
          <Tooltip key={action}>
            <TooltipTrigger
              render={
                <Button
                  variant={action === "close" ? "destructive-outline" : "outline"}
                  size="xs"
                  disabled={busy || (action === "merge" && entry.stack !== undefined)}
                  aria-label={`${label} #${entry.number}`}
                  onClick={() => void perform(action)}
                  onPointerDown={(event) => {
                    if (action !== "close" || !event.isPrimary || event.button !== 0) return;
                    event.stopPropagation();
                    onCloseSweepStart?.(entry, event.nativeEvent);
                  }}
                />
              }
            >
              {busy ? <Spinner size="xs" /> : <Icon aria-hidden className="size-3" />}
              {label}
            </TooltipTrigger>
            <TooltipPopup>
              {action === "merge" && entry.stack
                ? "打开此拉取请求以合并其堆叠"
                : action === "close"
                  ? "立即关闭，或拖过多行批量关闭"
                  : `立即${label}`}
            </TooltipPopup>
          </Tooltip>
        );
      })}
    </div>
  );
}

const ACTIONS = {
  close: { label: "关闭", Icon: PullRequestGlyph.closed },
  merge: { label: "合并", Icon: PullRequestGlyph.merged },
  ready: { label: "可以开始评审", Icon: PullRequestGlyph.pullRequest },
  reopen: { label: "重新打开", Icon: PullRequestGlyph.reopen },
} as const;
