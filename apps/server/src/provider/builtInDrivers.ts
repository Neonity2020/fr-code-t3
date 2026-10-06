/**
 * BUILT_IN_DRIVERS — the static set of `ProviderDriver`s this build ships
 * with.
 *
 * FR Code ships exactly one first-party driver: `PiDriver`, which drives the
 * user's own `pi` CLI over `--mode rpc`. Every other upstream driver (Codex,
 * Claude, Cursor, Grok, OpenCode, Antigravity) plus the generic ACP registry
 * are intentionally not registered here, so the product presents Pi as the
 * single kernel. Their UI remains in the tree and degrades to the documented
 * `"unavailable"` shadow snapshot rather than crashing — see
 * `buildUnavailableProviderSnapshot`.
 *
 * To re-enable one, re-add its import to this file, put its `*DriverEnv` back
 * in `BuiltInDriversEnv`, and append it to the array below.
 *
 * The aggregated `BuiltInDriversEnv` type is the union of every driver's
 * env requirement — the registry layer's `R` is this type, and the runtime
 * layer (ChildProcessSpawner, FileSystem, Path, ServerConfig, …) must satisfy
 * it.
 *
 * @module provider/builtInDrivers
 */
import { PiDriver, type PiDriverEnv } from "./Drivers/PiDriver.ts";
import type { AnyProviderDriver } from "./ProviderDriver.ts";

/**
 * Union of infrastructure services required to construct any built-in
 * driver. The registry layer declares `R = BuiltInDriversEnv`; the runtime
 * layer must provide every service in this union.
 */
export type BuiltInDriversEnv = PiDriverEnv;

/**
 * Ordered list of built-in drivers. Order matters only for tie-breaking in
 * UI presentation — the registry itself is keyed by `driverKind`, so
 * iteration order has no functional effect on instance lookup.
 */
export const BUILT_IN_DRIVERS: ReadonlyArray<AnyProviderDriver<BuiltInDriversEnv>> = [
  PiDriver,
];
