import { DownloadIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { RelayClientInstallProgressStage } from "@t3tools/contracts";

import {
  completeRelayClientInstallDialogClose,
  readRelayClientInstallDialogState,
  respondToRelayClientInstallConfirmation,
  subscribeRelayClientInstallDialog,
} from "../../cloud/relayClientInstallDialog";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
const installSteps: ReadonlyArray<{
  readonly stage: RelayClientInstallProgressStage;
  readonly label: string;
}> = [
  { stage: "checking", label: "正在检查当前安装" },
  { stage: "waiting_for_lock", label: "正在等待安装程序" },
  { stage: "downloading", label: "正在下载中继客户端" },
  { stage: "verifying", label: "正在验证下载" },
  { stage: "installing", label: "正在安装中继客户端" },
  { stage: "validating", label: "正在验证可执行文件" },
  { stage: "activating", label: "正在激活安装" },
];

export function RelayClientInstallDialog() {
  const state = useSyncExternalStore(
    subscribeRelayClientInstallDialog,
    readRelayClientInstallDialogState,
    readRelayClientInstallDialogState,
  );
  const view = state.status === "closing" ? state.view : state;
  const isConfirming = view.status === "confirming";
  const isInstalling = view.status === "installing";
  const activeStepIndex = isInstalling
    ? installSteps.findIndex(({ stage }) => stage === view.stage)
    : -1;
  const activeStep = installSteps[activeStepIndex];

  return (
    <Dialog
      open={state.status === "confirming" || state.status === "installing"}
      onOpenChange={(open) => {
        if (!open && isConfirming) {
          respondToRelayClientInstallConfirmation(false);
        }
      }}
      onOpenChangeComplete={(open) => {
        if (!open) {
          completeRelayClientInstallDialogClose();
        }
      }}
    >
      <DialogPopup className="max-w-md" showCloseButton={isConfirming}>
        <DialogHeader>
          <div className="flex size-9 items-center justify-center rounded-lg border border-border/70 bg-muted/60">
            <DownloadIcon aria-hidden className="size-4.5 text-muted-foreground" />
          </div>
          <DialogTitle>{isInstalling ? "正在安装中继客户端" : "安装中继客户端？"}</DialogTitle>
          <DialogDescription>
            {isInstalling
              ? "FR Code 正在配置此环境，以便通过 T3 Connect 安全访问。"
              : "FR Code 需要中继客户端才能通过 T3 Connect 提供此环境。"}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel scrollFade={false}>
          {isInstalling ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <p aria-live="polite" className="font-medium text-foreground">
                  {activeStep?.label}
                </p>
                <p className="shrink-0 tabular-nums text-muted-foreground">
                  {activeStepIndex + 1} / {installSteps.length}
                </p>
              </div>
              <progress
                aria-label="中继客户端安装进度"
                className="h-2 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary"
                max={installSteps.length}
                value={activeStepIndex + 1}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                安装中继客户端期间，请保持 FR Code 打开。
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
              <p className="text-sm font-medium text-foreground">托管中继客户端</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                FR Code 将下载并安装版本 {view.status === "confirming" ? view.version : ""} 到本地。
              </p>
            </div>
          )}
        </DialogPanel>
        {isConfirming ? (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => respondToRelayClientInstallConfirmation(false)}
            >
              取消
            </Button>
            <Button onClick={() => respondToRelayClientInstallConfirmation(true)}>
              下载并安装
            </Button>
          </DialogFooter>
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}
