import type { ReactNode } from "react";
import type { DeviceToolVersions as ToolVersions } from "@t3tools/contracts";
import { InlineButton } from "~/components/ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "~/components/ui/popover";

export function DeviceToolVersions({
  tools,
  action,
  kind,
  owner,
  error,
}: {
  tools: ToolVersions | undefined;
  action?: ReactNode;
  kind?: keyof ToolVersions;
  owner?: string | undefined;
  error?: string | undefined;
}) {
  const selected = kind ? tools?.[kind] : undefined;
  const version =
    selected?.runningVersion ??
    (selected?.installedVersions.includes(selected.requiredVersion)
      ? selected.requiredVersion
      : selected?.installedVersions
          .toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .at(-1));
  const label = kind === "hub" ? "设备中心" : "智能体设备";
  return (
    <Popover>
      <PopoverTrigger
        aria-label={
          kind
            ? `${label}：${version ? `版本 ${version}` : selected ? "未安装" : "版本未知"}。显示详情`
            : undefined
        }
        render={<InlineButton tone="muted" />}
      >
        {kind
          ? version
            ? `v${version}`
            : selected
              ? "未安装"
              : "版本未知"
          : error
            ? "版本信息不可用"
            : "版本"}
      </PopoverTrigger>
      <PopoverPopup align="end" width="md">
        <PopoverTitle>{kind ? label : "设备工具"}</PopoverTitle>
        {tools ? (
          <div className="mt-4 divide-y divide-border/50">
            {(
              [
                ["hub", "设备中心", tools.hub],
                ["agent", "智能体设备", tools.agent],
              ] as const
            )
              .filter(([toolKind]) => !kind || toolKind === kind)
              .map(([toolKind, name, tool]) => (
                <div key={toolKind} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  {!kind ? <p className="text-xs font-medium">{name}</p> : null}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">正在运行</dt>
                    <dd className="text-right font-mono">{tool.runningVersion ?? "未运行"}</dd>
                    <dt className="text-muted-foreground">必需</dt>
                    <dd className="text-right font-mono">{tool.requiredVersion}</dd>
                    <dt className="text-muted-foreground">已安装</dt>
                    <dd className="text-right font-mono break-words">
                      {tool.installedVersions.join(", ") || "无"}
                    </dd>
                  </dl>
                </div>
              ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">尚未检查版本。</p>
        )}
        <p className="mt-4 border-t border-border/50 pt-3 text-xs text-muted-foreground">
          {owner ? `由 ${owner} 管理。` : ""}此主机会在需要时自动更新工具。
        </p>
        {error ? (
          <p role="status" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </PopoverPopup>
    </Popover>
  );
}
