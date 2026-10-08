import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import type {
  EnvironmentId,
  PullRequestRef,
  PullRequestStack,
  PullRequestMergeMethod,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { useAtomCommand } from "~/state/use-atom-command";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuTrigger, MenuItem, MenuGroup, MenuSeparator } from "../ui/menu";
import {
  Dialog,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { toastManager } from "../ui/toast";
import { PullRequestStackLayers } from "./PullRequestStackLayers";
import { PullRequestStackHeader } from "./PullRequestStackHeader";
import { PullRequestStackLayerContent } from "./PullRequestStackLayerContent";
import { PullRequestGlyph } from "./pullRequestIcons";

export function PullRequestStackMenu({
  stack,
  reference,
  environmentId,
  canMerge,
  canRebase,
  mergeMethod,
  onSelect,
  onActed,
  notice,
  onRetry,
}: {
  notice?: string | null;
  onRetry?: (() => void) | undefined;
  stack: PullRequestStack;
  reference: PullRequestRef;
  environmentId: EnvironmentId;
  canMerge: boolean;
  canRebase: boolean;
  mergeMethod: PullRequestMergeMethod;
  onSelect?: ((reference: PullRequestRef) => void) | undefined;
  onActed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<"merge" | "update-branch" | null>(null);
  const [pending, setPending] = useState(false);
  const runAction = useAtomCommand(pullRequestEnvironment.runAction, { reportFailure: false });
  const top = stack.layers.at(-1);
  const unmerged = stack.layers.filter((layer) => layer.state !== "merged");
  const hasClosed = unmerged.some((layer) => layer.state !== "open");
  const position = stack.layers.findIndex((layer) => layer.number === reference.number) + 1;
  const mergeLayers = stack.layers.slice(0, position).filter((layer) => layer.state !== "merged");
  const selectedLayer = stack.layers[position - 1];
  const mergeHasClosed = mergeLayers.some((layer) => layer.state !== "open");
  const expectedStackHeads = unmerged.flatMap((layer) =>
    layer.headSha ? [{ number: layer.number, headSha: layer.headSha }] : [],
  );
  const hasUnknownHead = expectedStackHeads.length !== unmerged.length;
  const mergeDisabled =
    pending ||
    selectedLayer?.state !== "open" ||
    mergeLayers.some((layer) => !layer.headSha) ||
    mergeHasClosed ||
    mergeLayers.length === 0 ||
    mergeLayers.some((layer) => layer.isDraft);
  const rebaseDisabled = pending || hasUnknownHead || hasClosed || unmerged.length === 0;
  const run = async () => {
    if (
      pending ||
      !confirmation ||
      (confirmation === "merge" ? !canMerge || mergeDisabled : !canRebase || rebaseDisabled)
    )
      return;
    const action = confirmation;
    const target = action === "merge" ? selectedLayer : top;
    if (!target?.headSha) return;
    const actionHeads = (action === "merge" ? mergeLayers : unmerged).flatMap((layer) =>
      layer.headSha ? [{ number: layer.number, headSha: layer.headSha }] : [],
    );
    setPending(true);
    const result = await runAction({
      environmentId,
      input: {
        ...reference,
        number: target.number,
        stackNumber: stack.number,
        expectedStackHeads: actionHeads,
        action,
        ...(action === "merge" ? { mergeMethod } : { updateMethod: "rebase" }),
      },
    });
    setPending(false);
    setConfirmation(null);
    onActed();
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: "堆叠操作未完成",
        description: String(squashAtomCommandFailure(result)),
      });
    } else {
      toastManager.add({
        type: "success",
        title: action === "merge" ? "堆叠合并请求已完成" : "堆叠已变基",
        description: action === "merge" ? "GitHub 已合并堆叠或将其加入合并队列。" : undefined,
      });
    }
  };
  const confirmationLayers = confirmation === "merge" ? mergeLayers : unmerged;
  return (
    <>
      <Menu open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={`堆叠 ${stack.number}，第 ${position} 层，共 ${stack.layers.length} 层`}
                  />
                }
              >
                <PullRequestGlyph.stack aria-hidden className="size-3.5" /> {position}/
                {stack.layers.length}
                {onRetry ? <TriangleAlertIcon aria-hidden className="size-3 text-warning" /> : null}
              </MenuTrigger>
            }
          />
          <TooltipPopup>
            查看堆栈 #{stack.number}，层 {position} / {stack.layers.length}
            {notice ? ` · ${notice}` : null}
          </TooltipPopup>
        </Tooltip>
        <MenuPopup align="start">
          <MenuGroup>
            <PullRequestStackHeader number={stack.number} notice={notice} stale={!!onRetry} />
            {onRetry ? <MenuItem onClick={onRetry}>重试刷新堆栈</MenuItem> : null}
            <PullRequestStackLayers
              stack={stack}
              reference={reference}
              pending={pending}
              onSelect={
                onSelect
                  ? (target) => {
                      setOpen(false);
                      onSelect(target);
                    }
                  : undefined
              }
            />
          </MenuGroup>
          {canMerge || canRebase ? (
            <>
              <MenuSeparator />
              {canMerge ? (
                <MenuItem disabled={mergeDisabled} onClick={() => setConfirmation("merge")}>
                  <PullRequestGlyph.merged aria-hidden />
                  合并堆栈（{mergeLayers.length})
                </MenuItem>
              ) : null}
              {canRebase ? (
                <MenuItem
                  disabled={rebaseDisabled}
                  onClick={() => setConfirmation("update-branch")}
                >
                  <RefreshCwIcon aria-hidden />
                  变基堆栈
                </MenuItem>
              ) : null}
              {mergeHasClosed || mergeLayers.some((layer) => layer.isDraft) ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  要合并的每一层都必须保持打开且可评审。
                </p>
              ) : null}
            </>
          ) : null}
        </MenuPopup>
      </Menu>
      {canMerge && selectedLayer?.state === "open" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex">
                <Button
                  variant="default"
                  size="xs"
                  disabled={mergeDisabled}
                  onClick={() => setConfirmation("merge")}
                >
                  <PullRequestGlyph.merged aria-hidden className="size-3.5" />
                  合并堆栈
                </Button>
              </span>
            }
          />
          <TooltipPopup>
            合并堆栈至 #{reference.number} 到 {stack.base} ({mergeLayers.length}{" "}
            {mergeLayers.length === 1 ? "拉取请求" : "拉取请求"})
          </TooltipPopup>
        </Tooltip>
      ) : null}
      <Dialog
        open={confirmation !== null}
        onOpenChange={(value) => {
          if (!value && !pending) setConfirmation(null);
        }}
      >
        <DialogPopup className="max-w-md" showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>
              {confirmation === "merge"
                ? `合并 ${mergeLayers.length} 个拉取请求？`
                : `变基 ${unmerged.length} 个拉取请求？`}
            </DialogTitle>
            <DialogDescription>
              {confirmation === "merge"
                ? `使用 ${mergeMethod} 将 #${reference.number} 及其下方尚未合并的层合并到 ${stack.base}。GitHub 会先检查规则，再合并或排队，并在合并后对剩余堆叠变基。`
                : `将远程分支从下到上变基到 ${stack.base}。这会重写分支历史并可能重新触发检查。如果某层失败，之前的更新仍然保留。`}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {confirmationLayers.map((layer) => (
                <li
                  key={layer.number}
                  className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2"
                >
                  <PullRequestStackLayerContent layer={layer} compact />
                </li>
              ))}
            </ul>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setConfirmation(null)}>
              取消
            </Button>
            <Button disabled={pending} onClick={() => void run()}>
              {pending ? "正在处理…" : confirmation === "merge" ? "合并堆栈" : "变基堆栈"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
