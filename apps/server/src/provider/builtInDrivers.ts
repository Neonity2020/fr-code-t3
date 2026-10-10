import { PiDriver, type PiDriverEnv } from "./Drivers/PiDriver.ts";
import type { AnyProviderDriver } from "./ProviderDriver.ts";
export type BuiltInDriversEnv = PiDriverEnv;
export const BUILT_IN_DRIVERS: ReadonlyArray<AnyProviderDriver<BuiltInDriversEnv>> = [PiDriver];
