import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  getOnboardingProviderState,
  resolveOnboardingProviderInstallCommand,
  resolveOnboardingProviderLoginCommand,
  selectOnboardingProvidersByDriver,
} from "./providerReadiness.logic";

const readyPi: ServerProvider = {
  instanceId: ProviderInstanceId.make("pi"),
  driver: ProviderDriverKind.make("pi"),
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "unknown" },
  checkedAt: "2026-08-23T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
};

describe("getOnboardingProviderState", () => {
  it("treats an enabled Pi provider with ready status and unknown authentication as ready", () => {
    expect(getOnboardingProviderState(readyPi)).toBe("ready");
  });

  it("treats authenticated providers as ready only when their provider status is ready", () => {
    expect(getOnboardingProviderState({ ...readyPi, auth: { status: "authenticated" } })).toBe(
      "ready",
    );
    expect(
      getOnboardingProviderState({
        ...readyPi,
        auth: { status: "authenticated" },
        status: "error",
      }),
    ).toBe("attention");
    expect(
      getOnboardingProviderState({
        ...readyPi,
        auth: { status: "authenticated" },
        status: "warning",
      }),
    ).toBe("attention");
  });

  it("offers sign-in only when the server reports an authentication failure", () => {
    expect(
      getOnboardingProviderState({
        ...readyPi,
        status: "error",
        auth: { status: "unauthenticated" },
      }),
    ).toBe("signIn");
    expect(getOnboardingProviderState({ ...readyPi, status: "error" })).toBe("attention");
    expect(getOnboardingProviderState({ ...readyPi, status: "warning" })).toBe("attention");
  });

  it("does not offer installation or sign-in for disabled providers", () => {
    expect(getOnboardingProviderState({ ...readyPi, enabled: false, installed: false })).toBe(
      "disabled",
    );
    expect(getOnboardingProviderState({ ...readyPi, status: "disabled" })).toBe("disabled");
  });

  it("offers installation only when an enabled provider is missing", () => {
    expect(getOnboardingProviderState({ ...readyPi, installed: false, status: "error" })).toBe(
      "install",
    );
  });

  it("waits for a provider snapshot before offering an action", () => {
    expect(getOnboardingProviderState(undefined)).toBe("checking");
  });
});

describe("selectOnboardingProvidersByDriver", () => {
  it("prefers a ready instance with unknown authentication to an unauthenticated instance", () => {
    const signedOutPi: ServerProvider = {
      ...readyPi,
      instanceId: ProviderInstanceId.make("pi_work"),
      status: "error",
      auth: { status: "unauthenticated" },
    };

    expect(selectOnboardingProvidersByDriver([signedOutPi, readyPi]).get("pi")).toBe(readyPi);
  });

  it("prefers a provider with an actionable sign-in over a failed provider", () => {
    const failedPi: ServerProvider = { ...readyPi, status: "error" };
    const signedOutPi: ServerProvider = {
      ...readyPi,
      instanceId: ProviderInstanceId.make("pi_work"),
      status: "error",
      auth: { status: "unauthenticated" },
    };

    expect(selectOnboardingProvidersByDriver([failedPi, signedOutPi]).get("pi")).toBe(signedOutPi);
  });

  it("prefers installed providers over missing or disabled instances", () => {
    const disabledPi: ServerProvider = { ...readyPi, enabled: false };
    const missingPi: ServerProvider = {
      ...readyPi,
      instanceId: ProviderInstanceId.make("pi_work"),
      installed: false,
      status: "error",
    };

    expect(selectOnboardingProvidersByDriver([disabledPi, missingPi, readyPi]).get("pi")).toBe(
      readyPi,
    );
  });

  it("handles provider snapshots that have not arrived", () => {
    expect(selectOnboardingProvidersByDriver(undefined).size).toBe(0);
  });

  it("keeps a ready custom account when the default account is signed out", () => {
    const signedOutDefault: ServerProvider = {
      ...readyPi,
      status: "error",
      auth: { status: "unauthenticated" },
    };
    const readyCustom: ServerProvider = {
      ...readyPi,
      instanceId: ProviderInstanceId.make("pi_work"),
    };

    expect(selectOnboardingProvidersByDriver([signedOutDefault, readyCustom]).get("pi")).toBe(
      readyCustom,
    );
  });
});

describe("Pi onboarding commands", () => {
  it.each(["darwin", "linux", "windows"] as const)("installs Pi on %s", (platform) => {
    expect(resolveOnboardingProviderInstallCommand("pi", platform)).toBe(
      "npm install -g @earendil-works/pi-coding-agent",
    );
  });
  it("uses the configured instance executable and quotes shell metacharacters", () => {
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      providerInstances: {
        pi: { driver: ProviderDriverKind.make("pi"), config: { binaryPath: "/opt/Pi's tools/pi" } },
      },
    };
    expect(resolveOnboardingProviderLoginCommand(readyPi, settings, "linux")).toBe(
      "'/opt/Pi'\"'\"'s tools/pi'",
    );
    expect(resolveOnboardingProviderLoginCommand(readyPi, settings, "windows")).toBe(
      "& '/opt/Pi''s tools/pi'",
    );
  });
  it("uses the default Pi executable without a configured instance", () => {
    expect(resolveOnboardingProviderLoginCommand(readyPi, DEFAULT_SERVER_SETTINGS, "darwin")).toBe(
      "pi",
    );
  });
});
