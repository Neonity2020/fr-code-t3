import { MenuGroupLabel } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function PullRequestStackHeader({
  number,
  notice,
  stale = false,
}: {
  number: number;
  notice?: string | null | undefined;
  stale?: boolean;
}) {
  return (
    <MenuGroupLabel>
      <div className="flex items-center justify-between gap-2">
        <span>堆栈 #{number}</span>
        {notice ? (
          <Tooltip>
            <TooltipTrigger render={<span role="status" className="text-xs font-normal" />}>
              {stale ? "可能已过期" : "正在刷新…"}
            </TooltipTrigger>
            <TooltipPopup>{notice}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
    </MenuGroupLabel>
  );
}
