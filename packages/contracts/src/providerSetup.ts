import * as Schema from "effect/Schema";
import { ProviderInstanceId } from "./providerInstance.ts";

export class ProviderSetupError extends Schema.TaggedError<ProviderSetupError>()(
  "ProviderSetupError",
  {
    instanceId: ProviderInstanceId,
    operation: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return this.detail;
  }
}
