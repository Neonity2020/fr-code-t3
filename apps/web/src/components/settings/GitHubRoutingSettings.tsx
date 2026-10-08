import { useAtomValue } from "@effect/atom-react";
import { resolveEnvironmentMachineKind } from "@t3tools/contracts";
import {
  gitHubRoutingConnectionKey,
  gitHubRoutingPermissionFor,
  type GitHubRoutingPermission,
} from "@t3tools/client-runtime/connection";
import { useState } from "react";

import { environmentCatalog } from "~/connection/catalog";
import type { EnvironmentPresentation } from "~/state/environments";
import { useAtomCommand } from "~/state/use-atom-command";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { EnvironmentRow, environmentTransportLabel } from "./EnvironmentRow";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { searchableSetting } from "./settingsSearch";

const options: ReadonlyArray<{ value: GitHubRoutingPermission; label: string }> = [
  { value: "off", label: "关闭" },
  { value: "read", label: "读取拉取请求" },
  { value: "read-write", label: "读取并操作" },
];

const summaryLabels = { "read-write": "read and act", read: "read PRs" } as const;

/**
 * Closed-header summary: the machines that share, grouped by permission.
 * Null when nothing is shared.
 */
export function summarizeGitHubRouting(
  entries: ReadonlyArray<{ readonly label: string; readonly permission: GitHubRoutingPermission }>,
): string | null {
  const groups = (["read-write", "read"] as const).flatMap((permission) => {
    const labels = entries.filter((entry) => entry.permission === permission);
    return labels.length === 0
      ? []
      : [`${labels.map((entry) => entry.label).join(", ")} ${summaryLabels[permission]}`];
  });
  return groups.length === 0 ? null : groups.join(" · ");
}

/**
 * Folded section under the environments list. One row per switched-on machine
 * with how much of its GitHub access the other machines may use. The trust
 * warning is the first line of the body so it sits next to the control.
 * Rendered only when two or more machines are on.
 */
export function GitHubRoutingSettings({
  environments,
}: {
  readonly environments: ReadonlyArray<EnvironmentPresentation>;
}) {
  const permissions = useAtomValue(environmentCatalog.githubRoutingPermissionsValueAtom);
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const update = useAtomCommand(environmentCatalog.setGitHubRoutingPermission);
  const [saving, setSaving] = useState(false);

  if (environments.length < 2) return null;

  const { id, title } = searchableSetting("github-routing");
  return (
    <FoldedSettingsSection
      id={id}
      title={title}
      summary={
        summarizeGitHubRouting(
          environments.map((environment) => ({
            label: environment.label,
            permission: gitHubRoutingPermissionFor(environment.entry, permissions),
          })),
        ) ?? "关闭"
      }
    >
      <p className="px-3 py-2.5 text-xs text-muted-foreground sm:px-4">
        在此互信的机器可通过彼此的 GitHub 权限读取 PR
        数据。需同时启用两台机器，读取和操作可能使用比资源所属机器更广的权限。此设置仅对此设备生效。
      </p>
      {environments.map((environment) => (
        <EnvironmentRow
          key={environment.environmentId}
          kind={resolveEnvironmentMachineKind(environment.serverConfig)}
          label={environment.label}
          subtitle={environmentTransportLabel(environment)}
        >
          <Select
            items={options}
            value={gitHubRoutingPermissionFor(environment.entry, permissions)}
            disabled={
              !catalog.isReady || saving || gitHubRoutingConnectionKey(environment.entry) === null
            }
            onValueChange={(permission) => {
              if (permission === null) return;
              setSaving(true);
              void update({ environmentId: environment.environmentId, permission }).then(
                (result) => {
                  setSaving(false);
                  if (result._tag === "Failure")
                    toastManager.add({
                      type: "error",
                      title: "无法保存 GitHub 路由权限",
                    });
                },
              );
            }}
          >
            <SelectTrigger
              size="xs"
              className="w-32"
              aria-label={`${environment.label} GitHub 路由`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {options.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </EnvironmentRow>
      ))}
    </FoldedSettingsSection>
  );
}
