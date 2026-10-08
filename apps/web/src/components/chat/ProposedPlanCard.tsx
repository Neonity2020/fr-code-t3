import { memo, useState, useId } from "react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import {
  buildCollapsedProposedPlanPreviewMarkdown,
  buildProposedPlanMarkdownFilename,
  downloadPlanAsTextFile,
  normalizePlanMarkdownForExport,
  proposedPlanTitle,
  stripDisplayedPlanMarkdown,
} from "../../proposedPlan";
import ChatMarkdown from "../ChatMarkdown";
import { EllipsisIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { projectEnvironment } from "~/state/projects";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useAtomCommand } from "~/state/use-atom-command";

export const ProposedPlanCard = memo(function ProposedPlanCard({
  planMarkdown,
  environmentId,
  threadRef,
  cwd,
  workspaceRoot,
}: {
  planMarkdown: string;
  environmentId: EnvironmentId;
  threadRef?: ScopedThreadRef | undefined;
  cwd: string | undefined;
  workspaceRoot: string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [savePath, setSavePath] = useState("");
  const [isSavingToWorkspace, setIsSavingToWorkspace] = useState(false);
  const writeProjectFile = useAtomCommand(projectEnvironment.writeFile, {
    reportFailure: false,
  });
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    target: "plan",
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "无法复制计划",
          description: error instanceof Error ? error.message : "复制时发生错误。",
        }),
      );
    },
  });
  const savePathInputId = useId();
  const title = proposedPlanTitle(planMarkdown) ?? "建议计划";
  const lineCount = planMarkdown.split("\n").length;
  const canCollapse = planMarkdown.length > 900 || lineCount > 20;
  const displayedPlanMarkdown = stripDisplayedPlanMarkdown(planMarkdown);
  const collapsedPreview = canCollapse
    ? buildCollapsedProposedPlanPreviewMarkdown(planMarkdown, { maxLines: 10 })
    : null;
  const downloadFilename = buildProposedPlanMarkdownFilename(planMarkdown);
  const saveContents = normalizePlanMarkdownForExport(planMarkdown);

  const handleDownload = () => {
    downloadPlanAsTextFile(downloadFilename, saveContents);
  };

  const handleCopyPlan = () => {
    copyToClipboard(saveContents);
  };

  const openSaveDialog = () => {
    if (!workspaceRoot) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "工作区路径不可用",
          description: "此会话没有可用于保存的工作区路径。",
        }),
      );
      return;
    }
    setSavePath((existing) => (existing.length > 0 ? existing : downloadFilename));
    setIsSaveDialogOpen(true);
  };

  const handleSaveToWorkspace = () => {
    const relativePath = savePath.trim();
    if (!workspaceRoot) {
      return;
    }
    if (!relativePath) {
      toastManager.add({
        type: "warning",
        title: "输入工作区路径",
      });
      return;
    }

    setIsSavingToWorkspace(true);
    void (async () => {
      const result = await writeProjectFile({
        environmentId,
        input: {
          cwd: workspaceRoot,
          relativePath,
          contents: saveContents,
        },
      });
      setIsSavingToWorkspace(false);
      if (result._tag === "Success") {
        setIsSaveDialogOpen(false);
        toastManager.add({
          type: "success",
          title: "计划已保存到工作区",
          description: result.value.relativePath,
        });
        return;
      }
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "无法保存计划",
            description: error instanceof Error ? error.message : "保存时发生错误。",
          }),
        );
      }
    })();
  };

  return (
    <div className="rounded-3xl border border-border/80 bg-card/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary">计划</Badge>
          {/* Same heading level as the message author headings in the timeline,
              so a plan's own headings nest beneath it in the outline. */}
          <h3 className="truncate text-sm font-medium text-foreground">{title}</h3>
        </div>
        <Menu>
          <MenuTrigger render={<Button aria-label="计划操作" size="icon-xs" variant="outline" />}>
            <EllipsisIcon aria-hidden="true" className="size-4" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem onClick={handleCopyPlan}>{isCopied ? "已复制！" : "复制到剪贴板"}</MenuItem>
            <MenuItem onClick={handleDownload}>下载为 Markdown</MenuItem>
            <MenuItem onClick={openSaveDialog} disabled={!workspaceRoot || isSavingToWorkspace}>
              保存到工作区
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
      <div className="mt-4">
        <div className={cn("relative", canCollapse && !expanded && "max-h-104 overflow-hidden")}>
          {canCollapse && !expanded ? (
            <ChatMarkdown
              text={collapsedPreview ?? ""}
              cwd={cwd}
              environmentId={environmentId}
              threadRef={threadRef}
              isStreaming={false}
              headingLevelOffset={3}
            />
          ) : (
            <ChatMarkdown
              text={displayedPlanMarkdown}
              cwd={cwd}
              environmentId={environmentId}
              threadRef={threadRef}
              isStreaming={false}
              headingLevelOffset={3}
            />
          )}
          {canCollapse && !expanded ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-card/95 via-card/80 to-transparent" />
          ) : null}
        </div>
        {canCollapse ? (
          <div className="mt-4 flex justify-center">
            <Button
              size="sm"
              variant="outline"
              data-scroll-anchor-ignore
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "折叠计划" : "展开计划"}
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog
        open={isSaveDialogOpen}
        onOpenChange={(open) => {
          if (!isSavingToWorkspace) {
            setIsSaveDialogOpen(open);
          }
        }}
      >
        <DialogPopup className="max-w-xl">
          <DialogHeader>
            <DialogTitle>保存计划到工作区</DialogTitle>
            <DialogDescription>
              输入相对于以下目录的路径： <code>{workspaceRoot ?? "工作区"}</code>.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <label htmlFor={savePathInputId} className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">工作区路径</span>
              <Input
                id={savePathInputId}
                value={savePath}
                onChange={(event) => setSavePath(event.target.value)}
                placeholder={downloadFilename}
                spellCheck={false}
                disabled={isSavingToWorkspace}
              />
            </label>
          </DialogPanel>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSaveDialogOpen(false)}
              disabled={isSavingToWorkspace}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSaveToWorkspace()}
              disabled={isSavingToWorkspace}
            >
              {isSavingToWorkspace ? "正在保存…" : "保存"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  );
});
