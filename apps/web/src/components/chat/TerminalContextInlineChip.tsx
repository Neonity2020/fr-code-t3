import { TerminalIcon } from "lucide-react";

import type { ContextPresentationCapability } from "../contextPresentationRegistry";
import { ContextChipPopover, ContextChipShell } from "../contextChipParts";

interface TerminalContextInlineChipProps {
  label: string;
  terminalLabel: string;
  lineStart: number;
  lineEnd: number;
  text: string;
  detailsMode: ContextPresentationCapability["details"];
  expired?: boolean;
}

export function TerminalContextInlineChip(props: TerminalContextInlineChipProps) {
  const { label, terminalLabel, lineStart, lineEnd, text, detailsMode, expired = false } = props;

  if (!expired && text.length > 0 && detailsMode === "popover") {
    return (
      <ContextChipPopover
        kind="terminal"
        icon={<TerminalIcon />}
        label={label}
        accessibleLabel={`终端片段，${label}`}
      >
        <div className="overflow-hidden rounded-md border border-border/70 bg-background/80">
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
            <TerminalIcon className="size-4 shrink-0 text-success" aria-hidden />
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {terminalLabel}
            </span>
            <span className="ml-auto shrink-0 text-secondary-label text-xs">
              {lineStart === lineEnd ? `第 ${lineStart} 行` : `第 ${lineStart}–${lineEnd} 行`}
            </span>
          </div>
          <pre
            className="max-h-80 overflow-auto whitespace-pre bg-muted p-3 font-mono text-foreground text-xs leading-relaxed outline-none [tab-size:4] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-label="已截取的终端输出"
            tabIndex={0}
          >
            {text}
          </pre>
        </div>
      </ContextChipPopover>
    );
  }

  return (
    <ContextChipShell
      kind="terminal"
      {...(expired ? { state: "invalid" as const } : {})}
      icon={<TerminalIcon />}
      label={label}
      aria-label={`终端摘录，${label}${expired ? "，已过期" : ""}`}
      data-terminal-context-expired={expired ? "true" : undefined}
      tooltip={
        expired
          ? `终端上下文已过期。请移除并重新添加 ${label}，以将其包含在消息中。`
          : detailsMode === "none"
            ? undefined
            : text
      }
    />
  );
}
