import * as Layer from "effect/Layer";
import * as IdAllocator from "../orchestration-v2/IdAllocator.ts";
import * as ProviderContinuationRequests from "../orchestration-v2/ProviderContinuationRequests.ts";
export type ProviderOrchestrationAdapterInfrastructure = IdAllocator.IdAllocatorV2;
export const layer = Layer.mergeAll(IdAllocator.layer, ProviderContinuationRequests.layer);
