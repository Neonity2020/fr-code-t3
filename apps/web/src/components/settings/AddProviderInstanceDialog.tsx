"use client";

import { useState } from "react";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type EnvironmentId,
  type ProviderInstanceEnvironmentVariable,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  useEnvironmentSettings,
  usePersistEnvironmentProviderInstanceMutation,
} from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import { WizardPopup, WizardHeader, WizardFooter } from "../ui/wizard";
import { SettingsRow } from "./settingsLayout";
import { ProviderSettingsForm } from "./ProviderSettingsForm";
import { ProviderEnvironmentSection } from "./ProviderInstanceCard";
import { DRIVER_OPTIONS } from "./providerDriverMeta";
import { deriveAvailableInstanceId } from "./AddProviderInstanceDialog.logic";

interface AddProviderInstanceDialogProps {
  readonly open: boolean;
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: (instanceId: ProviderInstanceId) => void;
}

export function AddProviderInstanceDialog({
  open,
  environmentId,
  environmentLabel,
  onOpenChange,
  onCreated,
}: AddProviderInstanceDialogProps) {
  const settings = useEnvironmentSettings(environmentId);
  const persist = usePersistEnvironmentProviderInstanceMutation(environmentId);
  const [label, setLabel] = useState("");
  const [config, setConfig] = useState<Record<string, unknown> | undefined>();
  const [environment, setEnvironment] = useState<
    ReadonlyArray<ProviderInstanceEnvironmentVariable>
  >([]);
  const [saving, setSaving] = useState(false);
  const definition = DRIVER_OPTIONS[0]!;
  const save = async () => {
    if (saving) return;
    const existing = new Set(["pi", ...Object.keys(settings.providerInstances)]);
    const instanceId = ProviderInstanceId.make(
      deriveAvailableInstanceId(
        (value) => {
          const suffix = value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 48);
          return suffix ? `pi_${suffix}` : "pi_custom";
        },
        label,
        existing,
      ),
    );
    setSaving(true);
    const result = await persist({
      operation: "create",
      instanceId,
      instance: {
        driver: ProviderDriverKind.make("pi"),
        displayName: label.trim() || "Pi",
        enabled: true,
        config: config ?? {},
        environment,
      },
    });
    setSaving(false);
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "无法添加 Pi 实例",
        description: error instanceof Error ? error.message : "设置保存失败。",
      });
      return;
    }
    onCreated?.(instanceId);
    onOpenChange(false);
    setLabel("");
    setConfig(undefined);
    setEnvironment([]);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <WizardPopup size="wide">
        <WizardHeader
          title="添加 Pi 实例"
          description={`在 ${environmentLabel} 中添加 Pi 配置。`}
        />
        <div className="overflow-y-auto px-4">
          <SettingsRow
            title="名称"
            control={
              <Input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="例如：工作"
                disabled={saving}
              />
            }
          />
          <ProviderSettingsForm
            definition={definition}
            value={config}
            idPrefix="add-pi"
            variant="dialog"
            onChange={setConfig}
          />
          <ProviderEnvironmentSection environment={environment} onChange={setEnvironment} />
        </div>
        <WizardFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "保存中…" : "添加"}
          </Button>
        </WizardFooter>
      </WizardPopup>
    </Dialog>
  );
}
