import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import type { EnvironmentId, PullRequestRef, PullRequestStackMembership } from "@t3tools/contracts";
import { useState } from "react";
import { usePullRequestStack } from "~/state/usePullRequestStack";
import { Menu, MenuTrigger, MenuPopup, MenuGroup, MenuGroupLabel, MenuItem } from "../ui/menu";
import { PullRequestStackLayers } from "./PullRequestStackLayers";
import { PullRequestStackHeader } from "./PullRequestStackHeader";
import { PullRequestGlyph } from "./pullRequestIcons";

/** Mounted only while the menu is open, so list rows do not each fetch a stack. */
function StackBody({
  environmentId,
  reference,
  onSelect,
  stackNumber,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  onSelect: (reference: PullRequestRef) => void;
  stackNumber: number;
}) {
  const query = usePullRequestStack(environmentId, reference);
  if (query.data !== null) {
    return (
      <>
        <PullRequestStackHeader
          number={query.data.number}
          notice={query.notice}
          stale={!!query.error}
        />
        {query.error ? <MenuItem onClick={query.refresh}>重试刷新堆栈</MenuItem> : null}
        <PullRequestStackLayers stack={query.data} reference={reference} onSelect={onSelect} />
      </>
    );
  }
  return (
    <>
      <PullRequestStackHeader number={stackNumber} />
      <MenuGroupLabel>
        {query.error ?? (query.isPending ? "正在加载堆叠…" : "此拉取请求已不在堆叠中。")}
      </MenuGroupLabel>
    </>
  );
}

export function PullRequestStackPopover({
  environmentId,
  reference,
  membership,
  onSelect,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  membership: PullRequestStackMembership;
  onSelect: (reference: PullRequestRef) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              nativeButton={false}
              render={
                <span
                  role="button"
                  tabIndex={0}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-xs font-normal text-muted-foreground"
                />
              }
              aria-label={`堆叠 ${membership.number}，第 ${membership.position} 层，共 ${membership.size} 层`}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <PullRequestGlyph.stack aria-hidden className="size-3" />
              {membership.position}/{membership.size}
            </MenuTrigger>
          }
        />
        <TooltipPopup>
          查看堆栈 #{membership.number}，层 {membership.position} / {membership.size}
        </TooltipPopup>
      </Tooltip>
      <MenuPopup
        align="start"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <MenuGroup>
          {open ? (
            <StackBody
              environmentId={environmentId}
              reference={reference}
              stackNumber={membership.number}
              onSelect={(target) => {
                setOpen(false);
                onSelect(target);
              }}
            />
          ) : null}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
