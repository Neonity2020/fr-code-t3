import type { ServerProcessSignal } from "@t3tools/contracts";

import { InlineButton } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/** Process ownership and confirmation stay with the diagnostics view. */
export function ProcessSignalActions({
  disabled,
  onSignal,
}: {
  disabled: boolean;
  onSignal: (signal: ServerProcessSignal) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <InlineButton
              disabled={disabled}
              aria-label="发送 SIGINT"
              tone="muted"
              onClick={() => onSignal("SIGINT")}
            >
              INT
            </InlineButton>
          }
        />
        <TooltipPopup side="top">发送 SIGINT</TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <InlineButton
              disabled={disabled}
              aria-label="发送 SIGKILL"
              tone="destructive"
              onClick={() => onSignal("SIGKILL")}
            >
              KILL
            </InlineButton>
          }
        />
        <TooltipPopup side="top">发送 SIGKILL</TooltipPopup>
      </Tooltip>
    </div>
  );
}
