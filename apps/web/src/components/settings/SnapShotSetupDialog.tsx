import { PermissionChecklist, PermissionContinueButton } from "../permissions/PermissionChecklist";
import { usePermissionStatus } from "../permissions/usePermissionStatus";
import {
  isModifierPairShortcut,
  type DesktopSnapShotSetupAction,
  type DesktopSnapShotState,
} from "@t3tools/contracts";
import { useState, type ReactNode } from "react";
import { MacAccessibilityIcon, MacScreenRecordingIcon } from "../Icons";
import { CaptureShortcutConfig } from "./CaptureShortcutConfig";
import { Button } from "../ui/button";
import { Dialog, DialogDescription } from "../ui/dialog";
import { WizardSteps, WizardPopup, WizardHeader, WizardPanel, WizardFooter } from "../ui/wizard";
import {
  captureSetupAccessReady,
  captureSetupBackend,
  captureSetupCheckMessage,
  captureSetupDesktopName,
  captureSetupInitialStep,
  captureSetupShortcutReady,
  type CaptureSetupStep,
} from "./SnapShotSetupDialog.logic";

const SETUP_STEPS = [
  { id: "access", label: "访问权限" },
  { id: "shortcut", label: "快捷键" },
] as const;

const GNOME_ACCESS_COPY = {
  "not-installed": {
    title: "安装扩展",
    description: "FR Code GNOME 扩展可捕获其他窗口并放入草稿。安装后需注销一次。",
  },
  "restart-required": {
    title: "扩展已安装",
    description: "保存工作，然后注销并重新登录。设置进度会保留。",
  },
  "update-required": {
    title: "更新扩展",
    description: "安装更新，然后注销并重新登录。",
  },
  "extensions-disabled": {
    title: "允许 GNOME 扩展",
    description: "打开 GNOME 扩展管理并开启扩展，然后再次检查。",
  },
  disabled: {
    title: "启用扩展",
    description: "启用 FR Code 快照扩展以开始捕获窗口。",
  },
  enabled: {
    title: "捕获已就绪",
    description: "接下来选择快捷键。",
  },
  unsupported: {
    title: "自动捕获不可用",
    description: "从命令面板选择“拍摄快照”来选择窗口。",
  },
  error: {
    title: "无法设置扩展",
    description: "在 GNOME 扩展管理中检查 FR Code 快照扩展，然后重试。",
  },
};

export function SnapShotSetupDialog({
  state,
  initialStep,
  wasEnabled,
  includeAccessibility,
  busy: actionBusy,
  error,
  shortcutInput,
  shortcutStatus,
  shortcutChanged,
  canSaveShortcut,
  onSaveShortcut,
  onEnable,
  onAction,
  onRefresh,
  onClose,
  onLeaveStep,
}: {
  state: DesktopSnapShotState;
  initialStep: CaptureSetupStep;
  wasEnabled: boolean;
  includeAccessibility: boolean;
  busy: boolean;
  error: string | null;
  shortcutInput: ReactNode;
  shortcutStatus: string | null | undefined;
  shortcutChanged: boolean;
  canSaveShortcut: boolean;
  onSaveShortcut: () => Promise<boolean>;
  onEnable: () => Promise<boolean>;
  onAction: (action: DesktopSnapShotSetupAction) => Promise<void>;
  onRefresh: () => Promise<DesktopSnapShotState | undefined>;
  onClose: (completed: boolean) => Promise<void>;
  onLeaveStep: () => void;
}) {
  const [step, setStep] = useState(() => captureSetupInitialStep(state, initialStep));
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const busy = actionBusy || checking || configBusy;
  const backend = captureSetupBackend(state);
  const configShortcut = backend === "niri" || backend === "hyprland";
  const desktop = captureSetupDesktopName(state);
  const extension = state.gnomeExtension;
  const helper = backend === "hyprland" ? state.hyprlandHelper : state.kdeHelper;
  const helperBackend = backend === "kde" || backend === "hyprland";
  const installHelper = backend === "hyprland" ? "install-hyprland-helper" : "install-kde-helper";
  const removeHelper = backend === "hyprland" ? "remove-hyprland-helper" : "remove-kde-helper";
  const accessReady = captureSetupAccessReady(state);
  const permissionStatus = usePermissionStatus(
    async () => {
      const refreshed = await onRefresh();
      if (!refreshed?.macPermissions) throw new Error("Permission status unavailable");
      return refreshed.macPermissions;
    },
    state.macPermissions ?? { screenRecording: false, accessibility: false },
    Boolean(state.macPermissions) && step === "access" && !busy,
  );
  const macPermissions = state.macPermissions ? permissionStatus.status : undefined;
  const macPermissionsReady =
    !macPermissions ||
    permissionStatus.isReady(
      includeAccessibility ? ["screenRecording", "accessibility"] : ["screenRecording"],
    );
  const shortcutReady = captureSetupShortcutReady(state, shortcutChanged);
  const install = extension?.status === "not-installed" || extension?.status === "update-required";
  const enable = extension?.status === "disabled";
  const changeStep = (next: CaptureSetupStep) => {
    onLeaveStep();
    setChecked(false);
    setStep(next);
  };
  const checkAgain = async () => {
    if (busy) return;
    setChecking(true);
    setChecked(false);
    try {
      setChecked((await onRefresh()) !== undefined);
    } finally {
      setChecking(false);
    }
  };
  const accessCopy =
    state.message && !macPermissions
      ? {
          title: "请再试一次",
          description: "无法检查快照。请重试以继续。",
        }
      : backend === "gnome" && extension
        ? extension.status === "enabled" && !accessReady
          ? {
              title: "检查捕获权限",
              description: "扩展尚未就绪。请稍后重试。",
            }
          : GNOME_ACCESS_COPY[extension.status]
        : helperBackend
          ? helper?.status === "ready"
            ? {
                title: "捕获已就绪",
                description: "接下来选择快捷键。",
              }
            : helper?.status === "error"
              ? {
                  title: "修复捕获权限",
                  description: "尝试重新安装捕获辅助程序，然后再次检查。",
                }
              : {
                  title: helper?.status === "update-required" ? "更新捕获辅助程序" : "允许快照",
                  description: "FR Code 自带的捕获辅助程序可捕获其他应用并返回草稿。",
                }
          : backend === "niri"
            ? {
                title: "捕获已就绪",
                description: "接下来选择快捷键。",
              }
            : backend === "picker"
              ? {
                  title: "每次选择窗口",
                  description: "此桌面不支持自动捕获。请手动选择要捕获的窗口。",
                }
              : {
                  title: "允许快照",
                  description:
                    backend === "portal"
                      ? "首次捕获时，桌面可能会请求权限。"
                      : macPermissions
                        ? macPermissionsReady
                          ? "测试当前窗口快照。如果 macOS 询问是否绕过窗口选择器，请选择允许。测试图片会被丢弃。"
                          : "允许各项权限后继续。"
                        : "收到提示时允许访问，以开始捕获窗口。",
                };
  const title = step === "access" ? accessCopy.title : "选择快捷键";
  const description =
    step === "access"
      ? accessCopy.description
      : configShortcut
        ? "点击快捷键，然后按下要使用的按键。"
        : state.mode === "portal"
          ? "选择按键，然后按提示批准权限请求。"
          : "同时使用两个 Shift 键，或录制其他快捷键。";
  const stepIndex = SETUP_STEPS.findIndex(({ id }) => id === step);
  const details = [
    ...new Set(
      [
        error,
        ...(step === "access"
          ? [
              state.message,
              backend === "gnome" &&
              (extension?.status === "error" || extension?.status === "unsupported")
                ? extension.message
                : null,
              helperBackend && helper?.status === "error" ? helper.message : null,
            ]
          : []),
      ].filter((detail) => detail !== null),
    ),
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) void onClose(false);
      }}
    >
      <WizardPopup showCloseButton={!busy}>
        <WizardHeader title={desktop ? `为 ${desktop} 设置快照` : "设置快照"}>
          <WizardSteps
            steps={SETUP_STEPS.map((item) => item.label)}
            currentStep={stepIndex}
            isStepDisabled={(index) => busy || index > stepIndex}
            onStepChange={(index) => {
              const next = SETUP_STEPS[index];
              if (next && next.id !== step) changeStep(next.id);
            }}
          />
        </WizardHeader>
        <WizardPanel>
          <div className="space-y-4 text-sm">
            <div className="space-y-2" aria-live="polite">
              <h3 className="flex items-center gap-2 font-medium">{title}</h3>
              <DialogDescription>{description}</DialogDescription>
            </div>
            {step === "access" ? (
              <>
                <p
                  role="status"
                  aria-atomic="true"
                  className={
                    checked && !busy && !error ? "text-xs text-muted-foreground" : "sr-only"
                  }
                >
                  {checked && !busy && !error ? captureSetupCheckMessage(state) : null}
                </p>
                {macPermissions ? (
                  <PermissionChecklist
                    busy={busy}
                    permissions={[
                      {
                        id: "screenRecording",
                        icon: <MacScreenRecordingIcon className="size-8 shrink-0 drop-shadow-sm" />,
                        title: "屏幕录制",
                        description: "捕获当前使用的窗口。",
                        granted: macPermissions.screenRecording,
                        onAllow: () => void onAction("allow-screen-recording"),
                      },
                      {
                        id: "accessibility",
                        icon: <MacAccessibilityIcon className="size-8 shrink-0 drop-shadow-sm" />,
                        title: "辅助功能",
                        description: includeAccessibility
                          ? "包含捕获应用的文字和控件。"
                          : "可选。包含捕获应用的文字和控件。",
                        granted: macPermissions.accessibility,
                        onAllow: () => void onAction("allow-accessibility"),
                      },
                    ]}
                  />
                ) : null}
                {permissionStatus.error && macPermissions ? (
                  <p role="status" className="text-xs text-muted-foreground">
                    {permissionStatus.error}
                  </p>
                ) : null}
                {helperBackend && helper?.status === "error" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onAction(installHelper)}
                  >
                    重新安装辅助程序
                  </Button>
                ) : null}
              </>
            ) : configShortcut ? (
              <CaptureShortcutConfig
                state={state}
                disabled={actionBusy || checking || !accessReady}
                onBusyChange={setConfigBusy}
                onSaved={onRefresh}
                onComplete={() => onClose(true)}
              />
            ) : (
              <div className="space-y-3">
                {shortcutInput}
                {shortcutStatus ? (
                  <p className="text-xs text-muted-foreground" role="status">
                    {shortcutStatus}
                  </p>
                ) : null}
                {!shortcutChanged &&
                !state.shortcutRegistered &&
                !state.shortcutPending &&
                state.shortcutCanRetry !== false &&
                !isModifierPairShortcut(state.shortcut) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onAction("retry-shortcut")}
                  >
                    {state.mode === "portal" ? "快捷键权限" : "重试"}
                  </Button>
                ) : null}
              </div>
            )}
            {step === "shortcut" && !accessReady ? (
              <p role="alert" className="text-destructive">
                截图功能需要处理。请返回检查权限。
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-destructive">
                无法完成此步骤。请重试或在“高级”中查看帮助。
              </p>
            ) : null}
            {details.length > 0 || (step === "access" && (backend === "gnome" || helperBackend)) ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">高级</summary>
                <div className="mt-3 space-y-3">
                  {details.map((detail) => (
                    <p key={detail} className="break-words">
                      {detail}
                    </p>
                  ))}
                  {step === "access" && (backend === "gnome" || helperBackend) ? (
                    <p>已包含在 FR Code 中，无需下载。</p>
                  ) : null}
                  {step === "access" && backend === "gnome" && extension?.status === "enabled" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void onAction("disable-extension")}
                    >
                      禁用扩展
                    </Button>
                  ) : null}
                  {step === "access" && helperBackend && helper?.status !== "not-installed" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void onAction(removeHelper)}
                    >
                      移除截图辅助程序
                    </Button>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </WizardPanel>
        <WizardFooter>
          {step !== "access" ? (
            <Button variant="ghost" disabled={busy} onClick={() => changeStep("access")}>
              返回
            </Button>
          ) : null}
          <Button variant="ghost" disabled={busy} onClick={() => void onClose(false)}>
            {wasEnabled ? "关闭" : "稍后完成"}
          </Button>
          {step === "access" ? (
            helperBackend && !accessReady && helper?.status !== "ready" ? (
              <Button
                disabled={busy}
                aria-busy={busy}
                onClick={() =>
                  void (helper?.status === "error" ? checkAgain() : onAction(installHelper))
                }
              >
                {checking
                  ? "正在检查…"
                  : busy
                    ? "正在安装…"
                    : helper?.status === "error"
                      ? "重新检查"
                      : helper?.status === "update-required"
                        ? "更新辅助程序"
                        : "安装辅助程序"}
              </Button>
            ) : backend === "gnome" && !accessReady && extension?.status !== "enabled" ? (
              <Button
                disabled={busy}
                aria-busy={checking}
                onClick={() =>
                  void (install
                    ? onAction("install-extension")
                    : enable
                      ? onAction("enable-extension")
                      : checkAgain())
                }
              >
                {checking
                  ? "正在检查…"
                  : busy
                    ? install
                      ? "正在安装…"
                      : enable
                        ? "正在启用…"
                        : "正在处理…"
                    : install
                      ? extension?.status === "update-required"
                        ? "更新扩展"
                        : "安装扩展"
                      : enable
                        ? "启用扩展"
                        : "重新检查"}
              </Button>
            ) : (
              <PermissionContinueButton
                ready={macPermissionsReady}
                busy={busy}
                onClick={async () => {
                  if (await onEnable()) changeStep("shortcut");
                }}
              >
                {busy
                  ? "正在处理…"
                  : macPermissions
                    ? "测试捕获并继续"
                    : backend === "direct"
                      ? "允许捕获"
                      : !accessReady && !macPermissions
                        ? "重试"
                        : "继续"}
              </PermissionContinueButton>
            )
          ) : !configShortcut ? (
            <Button
              disabled={
                busy || !accessReady || (shortcutChanged ? !canSaveShortcut : !shortcutReady)
              }
              onClick={async () => {
                if (!shortcutChanged || (await onSaveShortcut())) await onClose(true);
              }}
            >
              {busy ? "正在保存…" : shortcutChanged ? "保存并完成" : "完成"}
            </Button>
          ) : null}
        </WizardFooter>
      </WizardPopup>
    </Dialog>
  );
}
