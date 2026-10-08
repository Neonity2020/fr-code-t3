import { DeviceHostUpdates } from "./DeviceHostUpdates";
import type { DevicePlatform, DeviceServiceState, EnvironmentId } from "@t3tools/contracts";
import { Check } from "lucide-react";
import { Check as CheckGlyph, CircleAlert } from "lucide";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { MorphIcon } from "~/components/MorphIcon";
import { WizardHeader, WizardPanel, WizardSteps, WizardFooter } from "~/components/ui/wizard";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { deviceEnvironment } from "~/state/device";
import { useAtomCommand } from "~/state/use-atom-command";
import { cn } from "~/lib/utils";

const platformName = (platform: DevicePlatform) => (platform === "ios" ? "iOS" : "Android");

export const deviceHubDescription =
  "启用此环境以打开模拟器，无论它们运行在此处还是远程设备主机上。";
export const agentDeviceDescription =
  "允许此环境中的新智能体会话启动和控制本地及远程设备，并自动配置所需工具。";

export function platformSetupStatus(state: DeviceServiceState, platform: DevicePlatform) {
  const availability = state.hosts
    .flatMap((host) => host.platforms)
    .find((candidate) => candidate.platform === platform);
  if (!availability?.available) {
    return {
      ready: false,
      message: availability?.reason ?? `未检测到 ${platformName(platform)} 支持。`,
    };
  }
  if (
    state.hostStatus === "ready" &&
    !state.devices.some((device) => device.platform === platform)
  ) {
    return {
      ready: false,
      message:
        platform === "ios"
          ? "已安装 Xcode，但没有可用的 iOS 模拟器。请在“Xcode 设置 → 组件”中安装运行时。"
          : "已安装 Android SDK，但没有虚拟设备。请在“Android Studio → 设备管理器”中创建。",
    };
  }
  return {
    ready: true,
    message: platform === "ios" ? "Xcode 和 iOS 模拟器可用。" : "Android SDK 和模拟器可用。",
  };
}

export function DeviceSetup(props: {
  readonly environmentId: EnvironmentId;
  readonly state: DeviceServiceState;
  readonly onComplete?: () => void;
}) {
  const configure = useAtomCommand(deviceEnvironment.configure);
  const list = useAtomCommand(deviceEnvironment.list, { reportFailure: false });
  const [pending, setPending] = useState<"hub" | "check" | "agent" | "complete" | null>(null);
  const [step, setStep] = useState(0);
  const enabled = props.state.hostStatus !== "disabled";
  const busy = props.state.hostStatus === "installing" || props.state.hostStatus === "starting";
  const localPlatformsUnavailable = props.state.hosts.some(
    (host) => host.kind === "local" && !host.platforms.some((platform) => platform.available),
  );

  const update = async (
    kind: NonNullable<typeof pending>,
    input: { enabled?: boolean; agentAccessEnabled?: boolean; onboardingCompleted?: boolean },
  ) => {
    setPending(kind);
    try {
      const result = await configure({ environmentId: props.environmentId, input });
      if (kind === "complete" && result._tag === "Success") props.onComplete?.();
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <WizardHeader title="配置设备" description="使用模拟器前，请检查此环境运行的内容。">
        <WizardSteps
          steps={["设备中心", "模拟器", "智能体访问"]}
          currentStep={step}
          onStepChange={setStep}
          isStepDisabled={(requested) => busy || pending !== null || requested > step}
        />
      </WizardHeader>

      <WizardPanel>
        <DeviceHostUpdates state={props.state} environmentId={props.environmentId} />
        {step === 0 ? (
          <section className="space-y-3 text-sm">
            <h3 className="font-medium">启用设备中心</h3>
            <div className="flex items-start justify-between gap-4">
              <p className="text-muted-foreground">{deviceHubDescription}</p>
              <Switch
                checked={enabled}
                disabled={busy || pending !== null}
                aria-label="启用设备中心"
                onCheckedChange={(checked) =>
                  void update("hub", {
                    enabled: Boolean(checked),
                    ...(checked ? {} : { agentAccessEnabled: false }),
                  })
                }
              />
            </div>
            <DeviceHubSetupStatus
              state={props.state}
              pending={pending === "hub" || (busy && pending !== "agent")}
            />
          </section>
        ) : null}

        {step === 1 || (step === 0 && enabled && localPlatformsUnavailable) ? (
          <section className={cn("space-y-3 text-sm", step === 0 && "mt-4")}>
            <h3 className="font-medium">检查模拟器支持</h3>
            <DevicePlatformSetup
              state={props.state}
              checking={pending === "check"}
              disabled={!enabled || busy || pending !== null}
              onCheck={() => {
                setPending("check");
                void list({ environmentId: props.environmentId, input: {} }).finally(() =>
                  setPending(null),
                );
              }}
            />
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-3 text-sm">
            <h3 className="font-medium">允许智能体控制</h3>
            <div className="flex items-start justify-between gap-4">
              <p className="text-muted-foreground">{agentDeviceDescription}</p>
              <Switch
                checked={props.state.agentAccessEnabled}
                disabled={!enabled || busy || pending !== null}
                aria-label="允许智能体控制设备"
                onCheckedChange={(checked) =>
                  void update("agent", { agentAccessEnabled: Boolean(checked) })
                }
              />
            </div>
            <AgentDeviceSetupStatus state={props.state} pending={pending === "agent"} />
            <p className="text-xs text-muted-foreground">
              关闭此选项可保留手动设备控制，而不向智能体开放访问。
            </p>
          </section>
        ) : null}
        {props.state.hostStatus === "failed" && props.state.hostStatusDetail ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {props.state.hostStatusDetail}
          </p>
        ) : null}
      </WizardPanel>

      <WizardFooter>
        {step === 0 ? (
          <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
        ) : (
          <Button
            variant="outline"
            disabled={busy || pending !== null}
            onClick={() => setStep(step - 1)}
          >
            返回
          </Button>
        )}
        {step < 2 ? (
          <Button
            disabled={props.state.hostStatus !== "ready" || pending !== null}
            onClick={() => setStep(step + 1)}
          >
            继续
          </Button>
        ) : (
          <Button
            disabled={props.state.hostStatus !== "ready" || pending !== null}
            onClick={() => void update("complete", { onboardingCompleted: true })}
          >
            {pending === "complete" ? "正在保存…" : "完成"}
          </Button>
        )}
      </WizardFooter>
    </>
  );
}

export function DeviceHubSetupStatus({
  state,
  pending,
  compact = false,
}: {
  readonly state: DeviceServiceState;
  readonly pending: boolean;
  readonly compact?: boolean;
}) {
  if (!pending && state.hostStatus !== "ready") return null;
  return (
    <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      {pending ? <Spinner size="xs" /> : <Check className="size-3 text-success" />}
      {pending
        ? state.hostStatus === "installing"
          ? compact
            ? "正在安装…"
            : "正在安装设备中心…"
          : state.hostStatus === "starting"
            ? compact
              ? "正在启动…"
              : "正在启动设备中心…"
            : compact
              ? "正在更新…"
              : "正在更新设备中心…"
        : "设备中心已就绪。"}
    </p>
  );
}

function DevicePlatformSetup(props: {
  readonly state: DeviceServiceState;
  readonly checking: boolean;
  readonly disabled: boolean;
  readonly onCheck: () => void;
}) {
  return (
    <div className="space-y-3">
      <PlatformStatus platform="iOS" status={platformSetupStatus(props.state, "ios")} />
      <PlatformStatus platform="Android" status={platformSetupStatus(props.state, "android")} />
      <p className="text-xs text-muted-foreground">
        两个平台均可使用。一个平台不可用不会阻止使用另一个。
      </p>
      <Button size="compact" variant="outline" disabled={props.disabled} onClick={props.onCheck}>
        {props.checking ? <Spinner size="xs" /> : null}
        {props.checking ? "正在检查…" : "重新检查"}
      </Button>
    </div>
  );
}

export function AgentDeviceSetupStatus(props: {
  readonly state: DeviceServiceState;
  readonly pending: boolean;
  readonly compact?: boolean;
}) {
  if (props.pending) {
    const label =
      props.state.hostStatus === "installing"
        ? props.compact
          ? "正在安装…"
          : "正在安装智能体工具…"
        : props.state.hostStatus === "starting"
          ? props.compact
            ? "正在启动…"
            : "正在启动智能体工具…"
          : props.compact
            ? "正在更新…"
            : "正在更新智能体访问权限…";
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner size="xs" />
        {label}
      </p>
    );
  }
  if (
    props.state.agentAccessEnabled &&
    props.state.hostStatus === "ready" &&
    props.state.hosts.some((host) => host.agentDeviceInstalled)
  ) {
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="size-3 text-success" />
        智能体工具已就绪。
      </p>
    );
  }
  return null;
}

export function PlatformStatus(props: {
  readonly platform: string;
  readonly status: { readonly ready: boolean; readonly message: string };
  readonly compact?: boolean;
}) {
  return (
    <div
      className={cn("flex gap-2", !props.compact && "rounded-md border border-border/60 px-3 py-2")}
    >
      <MorphIcon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          props.status.ready ? "text-success" : "text-muted-foreground",
        )}
        icon={props.status.ready ? CheckGlyph : CircleAlert}
      />
      <div className={cn(props.compact && props.status.ready && "flex items-center gap-2")}>
        <p className="font-medium">{props.platform}</p>
        <p className="text-xs text-muted-foreground">
          {props.compact && props.status.ready ? "就绪" : props.status.message}
        </p>
      </div>
    </div>
  );
}
