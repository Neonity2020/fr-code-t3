import { assert, expect, it } from "vite-plus/test";
import { DEFAULT_CLIENT_SETTINGS, type DesktopSnapShotState } from "@t3tools/contracts";

import {
  createRecordingRequestTracker,
  snapShotStatus,
  snapShotShortcutStatus,
  snapShotUnavailableMessage,
  snapShotSoundPatch,
  snapShotFeedbackUnavailableMessage,
  snapShotSetupSummary,
  snapShotSetupButtonLabel,
  snapShotSetupComplete,
  snapShotDescription,
  snapShotAccessibilityUnavailableMessage,
} from "./SnapShotSettings.logic";

it.each([
  ["off", { snapShotPlaySound: false }],
  ["soft-pop", { snapShotPlaySound: true, snapShotSound: "soft-pop" }],
  ["camera-shutter", { snapShotPlaySound: true, snapShotSound: "camera-shutter" }],
] as const)("maps %s to compatible capture settings", (sound, patch) => {
  expect(snapShotSoundPatch(sound)).toEqual(patch);
});

it("offers effects only with a capable GNOME extension, explaining how to upgrade v1", () => {
  const state: DesktopSnapShotState = {
    mode: "portal",
    linuxBackend: "gnome-extension",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: true,
    shortcutMessage: null,
    message: null,
  };
  expect(snapShotFeedbackUnavailableMessage(state)).toContain("更新");
  expect(
    snapShotFeedbackUnavailableMessage({ ...state, linuxFeedbackAvailable: true }),
  ).toBeUndefined();
  expect(snapShotFeedbackUnavailableMessage({ ...state, linuxBackend: "picker" })).toContain(
    "不支持捕获效果",
  );
  expect(snapShotFeedbackUnavailableMessage({ ...state, mode: "direct" })).toBeUndefined();
});

it("ignores a stale request after a newer request starts", () => {
  const requests = createRecordingRequestTracker();
  const firstRequest = requests.tryBegin();
  assert(firstRequest);

  requests.clear();
  const secondRequest = requests.tryBegin();
  assert(secondRequest);

  expect(requests.owns(firstRequest)).toBe(false);
  expect(requests.owns(secondRequest)).toBe(true);
  expect(requests.tryBegin()).toBeNull();
});

it("reports unavailable capture support without browser globals", () => {
  expect(snapShotUnavailableMessage(false)).toBe("仅桌面应用可用。");
});

it("describes Niri setup without claiming a global shortcut is registered", () => {
  const state: DesktopSnapShotState = {
    mode: "portal",
    linuxBackend: "niri",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: false,
    shortcutMessage: "Managed by Niri",
    message: null,
  };
  expect(snapShotStatus(state, true)).toBe("完成快捷键设置");
  expect(snapShotStatus(state, true)).not.toContain("could not be registered");
  expect(snapShotFeedbackUnavailableMessage(state)).toContain("Niri 不支持捕获效果");
});

it("distinguishes Hyprland helper setup, action registration, and verified shortcut delivery", () => {
  const state: DesktopSnapShotState = {
    mode: "portal",
    linuxBackend: "hyprland",
    linuxDesktop: "hyprland",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: false,
    shortcutMessage: "Connecting to Hyprland shortcuts…",
    message: null,
    hyprlandHelper: { status: "not-installed", message: "Install helper" },
  };
  expect(snapShotSetupButtonLabel(state)).toBe("设置 Hyprland 捕获");
  expect(snapShotStatus(state, false)).toBe("Turn this on to set up snapshots.");
  expect(snapShotStatus(state, true)).toContain("安装捕获辅助程序");
  expect(snapShotFeedbackUnavailableMessage(state)).toContain("安装或更新");
  const ready = {
    ...state,
    hyprlandHelper: { status: "ready" as const, message: "Ready" },
    linuxFeedbackAvailable: true,
  };
  expect(snapShotSetupButtonLabel(ready)).toBe("管理捕获");
  expect(snapShotShortcutStatus({ ...ready, shortcutPending: true })).not.toContain("permission");
  expect(snapShotStatus({ ...ready, shortcutActionRegistered: true }, true)).toBe(
    "在其他应用中使用快捷键",
  );
  expect(snapShotStatus({ ...ready, shortcutVerified: true }, true)).toBe("已可捕获");
  expect(snapShotFeedbackUnavailableMessage(ready)).toBeUndefined();
  expect(snapShotAccessibilityUnavailableMessage(ready)).toBeUndefined();
});

it("keeps unavailable capture distinct from the opt-in setup prompt", () => {
  const state: DesktopSnapShotState = {
    mode: "unavailable",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: false,
    shortcutMessage: null,
    message: "Wayland is required.",
  };

  expect(snapShotStatus(state, false)).toBe("Wayland is required.");
});

it.each(["gnome-extension", "niri", "screenshot-portal", "picker"] as const)(
  "waits for opt-in before presenting %s setup requirements",
  (linuxBackend) => {
    const state: DesktopSnapShotState = {
      mode: "portal",
      linuxBackend,
      shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
      shortcutRegistered: false,
      shortcutMessage: "Shortcut permission needed",
      message: "Capture needs attention",
      gnomeExtension: { status: "not-installed", message: "Install the extension" },
    };

    expect(DEFAULT_CLIENT_SETTINGS.snapShotEnabled).toBe(false);
    expect(snapShotStatus(state, false)).toBe("Turn this on to set up snapshots.");
    expect(snapShotStatus(state, true)).toBe("捕获需要处理");
  },
);

it("distinguishes saved shortcuts from observed delivery without making users repeat setup", () => {
  const state: DesktopSnapShotState = {
    mode: "portal",
    linuxBackend: "gnome-extension",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: true,
    shortcutMessage: "Requested",
    message: null,
    gnomeExtension: { status: "enabled", message: "Running" },
  };
  expect(snapShotSetupSummary(state, true)).toBe("快捷键已保存");
  expect(snapShotSetupButtonLabel(state)).toBe("管理捕获");
  expect(snapShotSetupSummary({ ...state, shortcutVerified: true }, true)).toBe("已可捕获");
  expect(snapShotSetupButtonLabel({ ...state, shortcutVerified: true })).toBe("管理捕获");
  expect(snapShotSetupButtonLabel({ ...state, shortcutRegistered: false })).toBe("管理捕获");
  expect(
    snapShotSetupButtonLabel({
      ...state,
      gnomeExtension: { status: "disabled", message: "Enable the extension" },
    }),
  ).toBe("设置 GNOME 捕获");
  expect(snapShotSetupSummary({ ...state, shortcutVerified: true }, false)).toContain("启用捕获");
  expect(
    snapShotSetupSummary(
      {
        ...state,
        gnomeExtension: { status: "restart-required", message: "Sign out" },
        shortcutVerified: true,
      },
      true,
    ),
  ).toBe("设置当前窗口快照");
  expect(
    snapShotSetupSummary(
      { ...state, linuxBackend: "niri", gnomeExtension: undefined, shortcutRegistered: false },
      true,
    ),
  ).toBe("完成快捷键设置");
  expect(
    snapShotSetupSummary(
      { ...state, linuxBackend: "picker", gnomeExtension: undefined, shortcutVerified: true },
      true,
    ),
  ).toBe("仅手动捕获 — 每次需选择窗口");
  expect(
    snapShotSetupSummary(
      {
        ...state,
        linuxBackend: "screenshot-portal",
        gnomeExtension: { status: "not-installed", message: "Optional extension" },
        shortcutVerified: true,
      },
      true,
    ),
  ).toBe("已可捕获");
});

it.each([
  ["gnome", "GNOME"],
  ["kde", "KDE Plasma"],
  ["niri", "Niri"],
] as const)(
  "names %s when setup cannot yet determine the capture backend",
  (linuxDesktop, name) => {
    const state: DesktopSnapShotState = {
      mode: "portal",
      linuxDesktop,
      shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
      shortcutRegistered: false,
      shortcutMessage: null,
      message: "Capability check failed",
    };
    expect(snapShotSetupButtonLabel(state)).toBe(`设置 ${name} 捕获`);
  },
);

it("keeps picker limitations visible after shortcut verification without recommending a GNOME extension", () => {
  const state: DesktopSnapShotState = {
    mode: "portal",
    linuxBackend: "picker",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: true,
    shortcutMessage: null,
    message: null,
    shortcutVerified: true,
  };
  expect(snapShotStatus(state, true)).toContain("仅手动捕获");
  expect(snapShotDescription(state)).toContain("此处不支持自动捕获");
  expect(snapShotFeedbackUnavailableMessage(state)).not.toContain("GNOME");
  expect(snapShotAccessibilityUnavailableMessage(state)).toContain("仅支持截图");
  expect(
    snapShotAccessibilityUnavailableMessage({ ...state, linuxBackend: "screenshot-portal" }),
  ).toContain("仅支持截图");
  expect(
    snapShotAccessibilityUnavailableMessage({ ...state, linuxBackend: "kde" }),
  ).toBeUndefined();
  expect(snapShotFeedbackUnavailableMessage({ ...state, linuxBackend: "kde" })).toContain(
    "捕获辅助程序",
  );
  expect(
    snapShotFeedbackUnavailableMessage({
      ...state,
      linuxBackend: "kde",
      linuxFeedbackAvailable: true,
      kdeHelper: { status: "ready", message: "Ready", feedbackAvailable: true },
    }),
  ).toBeUndefined();
  expect(
    snapShotStatus(
      { ...state, linuxBackend: "kde", kdeHelper: { status: "not-installed", message: "Install" } },
      true,
    ),
  ).toContain("安装捕获辅助程序");
});

it("does not ask Niri users to repeat setup when its capture endpoint is available", () => {
  const state: DesktopSnapShotState = {
    mode: "portal",
    linuxBackend: "niri",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: false,
    shortcutBinding: "Ctrl+Shift+2 { spawn ...; }",
    shortcutMessage: null,
    message: null,
  };
  expect(snapShotStatus(state, true)).toBe("在其他应用中使用快捷键");
  expect(snapShotSetupButtonLabel(state)).toBe("管理捕获");
});

it("reports pending, denied, and assigned shortcuts without inferring consent from saved keys", () => {
  const state: DesktopSnapShotState = {
    mode: "portal",
    linuxBackend: "screenshot-portal",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: false,
    shortcutPending: true,
    shortcutMessage: null,
    message: null,
  };
  expect(snapShotStatus(state, true)).toContain("正在等待快捷键权限");
  expect(snapShotShortcutStatus(state)).toContain("Approve the shortcut permission prompt");
  const denied = { ...state, shortcutPending: false, shortcutMessage: "Permission wasn't granted" };
  expect(snapShotShortcutStatus(denied)).toBe("Permission wasn't granted");
  const approved = {
    ...denied,
    shortcutRegistered: true,
    shortcutLabel: "Press <Shift><Control>2",
    shortcutMessage: "Desktop shortcut: Press <Shift><Control>2",
  };
  expect(snapShotStatus(approved, true)).toBe("已可捕获");
  expect(snapShotShortcutStatus(approved)).toBeNull();
  expect(snapShotShortcutStatus({ ...approved, shortcutPending: true })).toContain(
    "Approve the shortcut permission prompt",
  );
  expect(
    snapShotShortcutStatus({
      ...approved,
      shortcutRegistered: false,
      shortcutMessage: "Permission wasn't granted",
    }),
  ).toBe("Permission wasn't granted");
});

it("hides macOS setup only while permissions and the shortcut are all in place", () => {
  const ready: DesktopSnapShotState = {
    mode: "direct",
    shortcut: DEFAULT_CLIENT_SETTINGS.snapShotShortcut,
    shortcutRegistered: true,
    shortcutMessage: null,
    message: null,
    macPermissions: { screenRecording: true, accessibility: true },
  };
  expect(snapShotSetupComplete(ready, true)).toBe(true);
  expect(snapShotSetupComplete({ ...ready, macPermissions: undefined }, true)).toBe(false);
  expect(snapShotSetupComplete({ ...ready, shortcutRegistered: false }, true)).toBe(false);
  const revoked = {
    ...ready,
    macPermissions: { screenRecording: true, accessibility: false },
    message: "Allow Accessibility in System Settings, then restart FR Code.",
  };
  expect(snapShotSetupComplete(revoked, true)).toBe(false);
  expect(snapShotStatus(revoked, true)).toBe("捕获需要处理");
  expect(snapShotSetupButtonLabel(revoked)).toBe("继续设置");
  expect(snapShotSetupComplete({ ...revoked, message: null }, false)).toBe(true);
  expect(
    snapShotSetupComplete(
      { ...ready, windows: true, macPermissions: undefined, shortcutRegistered: false },
      true,
    ),
  ).toBe(true);
});
