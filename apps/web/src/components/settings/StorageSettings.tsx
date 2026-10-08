import type { StorageCleanupSettings, WorktreeCleanupRules } from "@t3tools/contracts";
import { resolveWorktreeCleanup } from "@t3tools/shared/projectSettings";
import { useRef, useState } from "react";

import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { SettingsScopeNotice } from "./SettingsScopeNotice";
import type { ScopedSettingsTarget } from "./scopedSettings";
import { useSettingsScope } from "./SettingsScopeContext";
import { searchableSetting } from "./settingsSearch";
import {
  useClearScopedSettings,
  useScopedSettings,
  useScopedSettingsMixed,
  useUpdateScopedSettings,
} from "./useScopedSettings";

function WorktreesDirectoryRow() {
  const { connectedEnvironments, targets } = useSettingsScope();
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const mixed = useScopedSettingsMixed(["worktreesDirectory"]);
  const edited = useRef(false);
  if (
    connectedEnvironments.some(
      (environment) =>
        environment.serverConfig?.environment.capabilities.worktreesDirectory !== true,
    )
  )
    return null;
  const scopeKey = targets.map((target) => target.environmentId).join(",");

  return (
    <SettingsRow
      {...searchableSetting("storage-worktrees-location")}
      description={
        "创建新工作树的文件夹，可在任意磁盘上，例如 D:\\\\worktrees 或 ~/worktrees。已有工作树保留原位置。留空则使用 T3 主目录。"
      }
      serverScoped
      settingKeys={["worktreesDirectory"]}
      resetAction={
        mixed || settings.worktreesDirectory !== "" ? (
          <SettingResetButton
            label={"工作树位置"}
            onClick={() => updateSettings({ worktreesDirectory: "" })}
          />
        ) : null
      }
      control={
        <Input
          key={`${scopeKey}:${mixed}:${settings.worktreesDirectory}`}
          aria-label="工作树位置"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={mixed ? "混合" : "默认"}
          defaultValue={mixed ? "" : settings.worktreesDirectory}
          onChange={() => {
            edited.current = true;
          }}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (edited.current && (mixed || value !== settings.worktreesDirectory))
              updateSettings({ worktreesDirectory: value });
            edited.current = false;
          }}
        />
      }
    />
  );
}

function RetentionControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [savedValue, setSavedValue] = useState(value);
  if (savedValue !== value) {
    setSavedValue(value);
    setDraft(value);
  }

  return (
    <div className="flex items-center gap-3">
      {value !== null ? (
        <NumberField
          value={draft}
          min={1}
          max={3650}
          step={1}
          size="sm"
          className="w-auto"
          onValueChange={setDraft}
          onValueCommitted={(next) => {
            if (next === null) setDraft(value);
            else {
              const days = Math.min(3650, Math.max(1, Math.round(next)));
              setDraft(days);
              onChange(days);
            }
          }}
        >
          <NumberFieldGroup>
            <NumberFieldDecrement aria-label={`减少${label}`} />
            <NumberFieldInput
              aria-label={`${label}（天）`}
              size={new Intl.NumberFormat().format(draft ?? value).length}
              className="field-sizing-content w-auto min-w-[1ch] grow-0 text-right"
            />
            <span aria-hidden="true" className="self-center pr-2 text-xs">
              天
            </span>
            <NumberFieldIncrement aria-label={`增加${label}`} />
          </NumberFieldGroup>
        </NumberField>
      ) : (
        <span className="text-xs text-muted-foreground">关闭</span>
      )}
      <Switch
        aria-label={label}
        checked={value !== null}
        onCheckedChange={(enabled) => onChange(enabled ? 8 : null)}
      />
    </div>
  );
}

export function StorageSettingsPanel() {
  const { scope, connectedEnvironments, targets, target } = useSettingsScope();
  const scopedSettings = useScopedSettings();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const settings = {
    ...scopedSettings.storageCleanup,
    ...resolveWorktreeCleanup(scopedSettings, null),
  };
  const projectMode = (entry: ScopedSettingsTarget | null) =>
    entry?.sources.worktreeCleanup === "project"
      ? (entry.settings.worktreeCleanup?.mode ?? "inherit")
      : "inherit";
  const mode = projectMode(target);
  const mixedModes = targets.some((entry) => projectMode(entry) !== mode);
  const updateSettings = useUpdateScopedSettings();
  const clearSettings = useClearScopedSettings();
  const ruleStatus = (key: keyof StorageCleanupSettings) =>
    targets.some(
      (target) =>
        ({ ...target.settings.storageCleanup, ...resolveWorktreeCleanup(target.settings, null) })[
          key
        ] !== settings[key],
    )
      ? "Mixed across selected machines"
      : undefined;
  const update = (patch: Partial<StorageCleanupSettings>) =>
    updateSettings({ storageCleanup: patch });
  const updateWorktree = (patch: Partial<WorktreeCleanupRules>) =>
    isProjectScope
      ? updateSettings({ worktreeCleanup: { mode: "custom", rules: patch } })
      : update(patch);

  if (
    isProjectScope &&
    connectedEnvironments.some(
      (environment) =>
        environment.serverConfig?.environment.capabilities.projectWorktreeCleanup !== true,
    )
  ) {
    return (
      <SettingsScopeNotice target="all">请更新所选机器以配置项目工作树清理。</SettingsScopeNotice>
    );
  }

  if (
    connectedEnvironments.some(
      (environment) => environment.serverConfig?.environment.capabilities.storageCleanup !== true,
    )
  ) {
    return (
      <SettingsScopeNotice
        target="environment"
        eligibleEnvironmentIds={connectedEnvironments
          .filter(
            (environment) =>
              environment.serverConfig?.environment.capabilities.storageCleanup === true,
          )
          .map((environment) => environment.environmentId)}
      >
        请更新所选环境以使用存储清理，或选择支持此功能的机器。
      </SettingsScopeNotice>
    );
  }

  return (
    <SettingsPageContainer>
      <SettingsSection id="storage-worktrees" title="工作树">
        {!isProjectScope && <WorktreesDirectoryRow />}
        {isProjectScope && (
          <SettingsRow
            title="自动清理工作树"
            description={
              mode === "off"
                ? "保留此项目的工作树，直到手动删除。"
                : mode === "custom"
                  ? "将这些规则用于此项目。"
                  : "使用各计算机的工作树清理设置。"
            }
            serverScoped
            settingKeys={["worktreeCleanup"]}
            mixed={mixedModes}
            control={
              <Select
                value={mixedModes ? null : mode}
                onValueChange={(next) => {
                  if (next === "inherit") clearSettings(["worktreeCleanup"]);
                  else if (next === "off") updateSettings({ worktreeCleanup: { mode: "off" } });
                  else if (next === "custom")
                    updateSettings({ worktreeCleanup: { mode: "custom", rules: {} } });
                }}
              >
                <SelectTrigger size="sm" aria-label="自动清理工作树">
                  <SelectValue>
                    {mixedModes
                      ? "混合"
                      : mode === "inherit"
                        ? "继承"
                        : mode === "off"
                          ? "关闭"
                          : "自定义"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="inherit">继承</SelectItem>
                  <SelectItem value="off">关闭</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectPopup>
              </Select>
            }
          />
        )}
        {(!isProjectScope || (!mixedModes && mode === "custom")) && (
          <>
            <SettingsRow
              title="随会话删除工作树"
              status={ruleStatus("worktreeOnDelete")}
              description="删除活跃或已归档会话时移除未使用的工作树。有本地改动的工作树会保留。"
              serverScoped={!isProjectScope}
              control={
                <Switch
                  aria-label="随会话删除工作树"
                  checked={settings.worktreeOnDelete}
                  onCheckedChange={(worktreeOnDelete) => updateWorktree({ worktreeOnDelete })}
                />
              }
            />
            <SettingsRow
              title="删除无活动工作树"
              status={ruleStatus("worktreeAfterDays")}
              description="会话超过此天数无活动后移除工作树。分支和会话历史会保留。"
              serverScoped={!isProjectScope}
              control={
                <RetentionControl
                  label="删除无活动工作树"
                  value={settings.worktreeAfterDays}
                  onChange={(worktreeAfterDays) => updateWorktree({ worktreeAfterDays })}
                />
              }
            />
            <SettingsRow
              title="删除已合并工作树"
              status={ruleStatus("worktreeOnMerge")}
              description="移除拉取请求已合并且提交已包含在默认分支中的工作树。"
              serverScoped={!isProjectScope}
              control={
                <Switch
                  aria-label="删除已合并工作树"
                  checked={settings.worktreeOnMerge}
                  onCheckedChange={(worktreeOnMerge) => updateWorktree({ worktreeOnMerge })}
                />
              }
            />
            <SettingsRow
              title="删除无改动工作树"
              status={ruleStatus("worktreeUnchanged")}
              description="移除没有超出默认分支提交的工作树。"
              serverScoped={!isProjectScope}
              control={
                <Switch
                  aria-label="删除无改动工作树"
                  checked={settings.worktreeUnchanged}
                  onCheckedChange={(worktreeUnchanged) => updateWorktree({ worktreeUnchanged })}
                />
              }
            />
          </>
        )}
      </SettingsSection>

      {!isProjectScope && (
        <SettingsSection id="storage-artifacts" title="产物与日志">
          <SettingsRow
            title="删除旧浏览器产物"
            status={ruleStatus("browserArtifactsAfterDays")}
            description="在此天数后删除已保存的浏览器捕获内容。较旧的捕获链接将无法打开。"
            serverScoped
            control={
              <RetentionControl
                label="删除旧浏览器产物"
                value={settings.browserArtifactsAfterDays}
                onChange={(browserArtifactsAfterDays) => update({ browserArtifactsAfterDays })}
              />
            }
          />
          <SettingsRow
            title="删除旧轮转日志"
            status={ruleStatus("logsAfterDays")}
            description="在此天数后删除不活跃的轮转日志文件。当前日志会保留。"
            serverScoped
            control={
              <RetentionControl
                label="删除旧轮转日志"
                value={settings.logsAfterDays}
                onChange={(logsAfterDays) => update({ logsAfterDays })}
              />
            }
          />
        </SettingsSection>
      )}
    </SettingsPageContainer>
  );
}
