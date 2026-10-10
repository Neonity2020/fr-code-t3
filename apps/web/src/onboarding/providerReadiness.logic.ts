import {
  PiSettings,
  type ExecutionEnvironmentPlatformOs,
  type ServerProvider,
  type ServerSettings,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const decodePiSettings = Schema.decodeUnknownOption(PiSettings);
const SAFE_SHELL_BINARY_PATTERN = /^[A-Za-z0-9_./:\\-]+$/;

function quoteProviderBinary(
  binaryPath: string,
  fallback: string,
  platform: ExecutionEnvironmentPlatformOs,
): string {
  if (
    SAFE_SHELL_BINARY_PATTERN.test(binaryPath) &&
    (platform === "windows" || !binaryPath.includes("\\"))
  ) {
    return binaryPath;
  }
  if (platform === "windows") return `& '${binaryPath.replaceAll("'", "''")}'`;
  if (platform === "darwin" || platform === "linux") {
    if (binaryPath.startsWith("~/") || binaryPath.startsWith("~\\")) {
      return `~/'${binaryPath.slice(2).replaceAll("'", `'"'"'`)}'`;
    }
    return `'${binaryPath.replaceAll("'", `'"'"'`)}'`;
  }
  return fallback;
}

export function getOnboardingProviderState(provider: ServerProvider | undefined) {
  if (provider === undefined) return "checking";
  if (!provider.enabled || provider.status === "disabled") return "disabled";
  if (!provider.installed && provider.status === "warning" && provider.auth.status === "unknown")
    return "checking";
  if (!provider.installed) return "install";
  if (provider.auth.status === "unauthenticated") return "signIn";
  if (provider.status === "ready") return "ready";
  return "attention";
}

const PROVIDER_STATE_PRIORITY = {
  checking: 0,
  disabled: 1,
  install: 2,
  attention: 3,
  signIn: 4,
  ready: 5,
} as const;

/** Select the most usable configured instance for each provider driver. */
export function selectOnboardingProvidersByDriver(
  providers: ReadonlyArray<ServerProvider> | null | undefined,
) {
  const providersByDriver = new Map<string, ServerProvider>();

  for (const provider of providers ?? []) {
    const existing = providersByDriver.get(provider.driver);
    if (
      existing === undefined ||
      PROVIDER_STATE_PRIORITY[getOnboardingProviderState(provider)] >
        PROVIDER_STATE_PRIORITY[getOnboardingProviderState(existing)]
    ) {
      providersByDriver.set(provider.driver, provider);
    }
  }

  return providersByDriver;
}

/** Install Pi in the selected environment. */
export function resolveOnboardingProviderInstallCommand(
  _driver: "pi",
  _platform: ExecutionEnvironmentPlatformOs,
): string {
  return "npm install -g @earendil-works/pi-coding-agent";
}

/** Pi authentication is configured through its interactive /login command. */
export function resolveOnboardingProviderLoginCommand(
  provider: ServerProvider,
  settings: ServerSettings,
  platform: ExecutionEnvironmentPlatformOs,
): string {
  const instance = settings.providerInstances[provider.instanceId];
  const config = decodePiSettings(instance ? (instance.config ?? {}) : settings.providers.pi);
  const binaryPath = Option.isSome(config) ? config.value.binaryPath : "pi";
  return quoteProviderBinary(binaryPath, "pi", platform);
}
