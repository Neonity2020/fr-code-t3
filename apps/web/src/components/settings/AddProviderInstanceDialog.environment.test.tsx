import { EnvironmentId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { visitElements } from "../../test/reactElementTree";
import { reactHookHarness as hooks } from "../../test/reactHookHarness";

const settingsHooks = vi.hoisted(() => ({
  read: vi.fn(() => ({ providerInstances: {} })),
  mutate: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return {
    ...actual,
    useMemo: reactHookHarness.useMemo,
    useState: reactHookHarness.useState,
  };
});

vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});

vi.mock("@t3tools/client-runtime/state/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@t3tools/client-runtime/state/runtime")>()),
  squashAtomCommandFailure: () => new Error("The settings update failed."),
}));

vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: settingsHooks.read,
  usePersistEnvironmentProviderInstanceMutation: settingsHooks.useMutation,
}));

import { AddProviderInstanceDialog } from "./AddProviderInstanceDialog";

const remoteEnvironmentId = EnvironmentId.make("remote-device");
function render(onOpenChange = vi.fn()) {
  hooks.beginRender();
  return AddProviderInstanceDialog({
    open: true,
    environmentId: remoteEnvironmentId,
    environmentLabel: "Remote device",
    onOpenChange,
  });
}

function findByChildren(tree: ReturnType<typeof render>, children: string) {
  const result = visitElements(tree, (element) => element.props.children === children);
  expect(result).not.toBeNull();
  return result!;
}

describe("AddProviderInstanceDialog environment routing", () => {
  beforeEach(() => {
    hooks.reset();
    settingsHooks.read.mockReset().mockReturnValue({ providerInstances: {} });
    settingsHooks.mutate.mockReset().mockResolvedValue({ _tag: "Success", value: {} });
    settingsHooks.useMutation.mockReset().mockReturnValue(settingsHooks.mutate);
  });

  it("creates a Pi instance in the supplied environment and waits before closing", async () => {
    const onOpenChange = vi.fn();
    let resolveMutation!: (value: { readonly _tag: "Success"; readonly value: unknown }) => void;
    settingsHooks.mutate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    const tree = render(onOpenChange);
    (findByChildren(tree, "添加").props.onClick as () => void)();
    expect(settingsHooks.read).toHaveBeenCalledWith(remoteEnvironmentId);
    expect(settingsHooks.useMutation).toHaveBeenCalledWith(remoteEnvironmentId);
    expect(settingsHooks.mutate).toHaveBeenCalledWith({
      operation: "create",
      instanceId: "pi_custom",
      instance: { driver: "pi", enabled: true, displayName: "Pi", config: {}, environment: [] },
    });
    expect(onOpenChange).not.toHaveBeenCalled();
    resolveMutation({ _tag: "Success", value: {} });
    await Promise.resolve();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("chooses an unused Pi identity without replacing configured instances", async () => {
    settingsHooks.read.mockReturnValue({
      providerInstances: { pi_custom: { driver: "pi", enabled: false } },
    });
    const tree = render();
    (findByChildren(tree, "添加").props.onClick as () => void)();
    await Promise.resolve();
    expect(settingsHooks.mutate.mock.calls[0]?.[0]).toMatchObject({
      instanceId: "pi_custom_2",
      instance: { driver: "pi" },
    });
  });
});
