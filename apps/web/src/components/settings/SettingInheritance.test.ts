import { DEFAULT_SERVER_SETTINGS, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { describe, expect, it } from "vite-plus/test";

import { settingInheritanceLayers } from "./SettingInheritance";

const environmentId = EnvironmentId.make("laptop");
const projectId = ProjectId.make("project");

describe("settingInheritanceLayers", () => {
  it("marks the built-in default effective when nothing is set", () => {
    const resolved = resolveProjectSettings(DEFAULT_SERVER_SETTINGS, null);
    const layers = settingInheritanceLayers(
      { environmentId, label: "Laptop", projectId: null, ...resolved },
      DEFAULT_SERVER_SETTINGS,
      "defaultAutoPull",
    );
    expect(layers.map((layer) => [layer.label, layer.value, layer.effective])).toEqual([
      ["Laptop", "Inherits", false],
      ["默认", "关闭", true],
    ]);
  });

  it("walks project override, environment value, then built-in default", () => {
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      defaultAutoPull: true,
      projectSettingsOverrides: { [projectId]: { defaultAutoPull: false } },
    };
    const resolved = resolveProjectSettings(settings, projectId);
    const layers = settingInheritanceLayers(
      { environmentId, label: "Laptop", projectId, ...resolved },
      settings,
      "defaultAutoPull",
    );
    expect(layers.map((layer) => [layer.label, layer.value, layer.effective])).toEqual([
      ["项目", "关闭", true],
      ["Laptop", "开启", false],
      ["默认", "关闭", false],
    ]);
    const inherited = settingInheritanceLayers(
      {
        environmentId,
        label: "Laptop",
        projectId,
        ...resolveProjectSettings(settings, ProjectId.make("other")),
      },
      settings,
      "defaultAutoPull",
    );
    expect(inherited.map((layer) => [layer.value, layer.effective])).toEqual([
      ["Inherits", false],
      ["开启", true],
      ["关闭", false],
    ]);
  });

  it("shows the checkout's t3.json as a layer for file-backed keys", () => {
    const file = { defaultThreadEnvMode: "worktree" as const };
    const fromFile = settingInheritanceLayers(
      {
        environmentId,
        label: "Laptop",
        projectId,
        ...resolveProjectSettings(DEFAULT_SERVER_SETTINGS, projectId, null, file),
      },
      DEFAULT_SERVER_SETTINGS,
      "defaultThreadEnvMode",
    );
    expect(fromFile.map((layer) => [layer.label, layer.value, layer.effective])).toEqual([
      ["项目", "Inherits", false],
      ["Laptop", "Inherits", false],
      ["t3.json", "新工作树", true],
      ["默认", "当前工作目录", false],
    ]);
    const settings = { ...DEFAULT_SERVER_SETTINGS, defaultThreadEnvMode: "local" as const };
    const fromEnvironment = settingInheritanceLayers(
      {
        environmentId,
        label: "Laptop",
        projectId,
        ...resolveProjectSettings(settings, projectId, null, file),
      },
      settings,
      "defaultThreadEnvMode",
    );
    expect(fromEnvironment.map((layer) => [layer.value, layer.effective])).toEqual([
      ["Inherits", false],
      ["当前工作目录", true],
      ["Inherits", false],
      ["当前工作目录", false],
    ]);
  });
});
