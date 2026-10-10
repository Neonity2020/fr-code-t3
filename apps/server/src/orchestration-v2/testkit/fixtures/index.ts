import { ProviderDriverKind } from "@t3tools/contracts";
import { messageSteeringInput } from "./message_steering/input.ts";
import { assertPiMessageSteeringOutput } from "./message_steering/pi_output.ts";
import { piCompactionInput } from "./pi_compaction/input.ts";
import { assertPiCompactionOutput } from "./pi_compaction/output.ts";
import { providerThreadResumeInput } from "./provider_thread_resume/input.ts";
import { assertPiProviderThreadResumeOutput } from "./provider_thread_resume/pi_output.ts";
import { assertPiMultiTurnOutput } from "./multi_turn/pi_output.ts";
import { multiTurnInput } from "./multi_turn/input.ts";
import { assertPiSimpleOutput } from "./simple/pi_output.ts";
import { simpleInput } from "./simple/input.ts";
import { threadRollbackInput } from "./thread_rollback/input.ts";
import { assertPiThreadRollbackOutput } from "./thread_rollback/pi_output.ts";
import { threadRollbackAfterStopInput } from "./thread_rollback_after_stop/input.ts";
import { assertPiThreadRollbackAfterStopOutput } from "./thread_rollback_after_stop/pi_output.ts";
import { turnInterruptMidToolInput } from "./turn_interrupt_mid_tool/input.ts";
import { assertTurnInterruptMidToolPiOutput } from "./turn_interrupt_mid_tool/pi_output.ts";
import { PI_MODEL_SELECTION, type OrchestratorReplayFixture } from "./shared.ts";

export const ORCHESTRATOR_REPLAY_FIXTURES: ReadonlyArray<OrchestratorReplayFixture> = [
  {
    name: "simple",
    buildInput: simpleInput,
    providers: [
      {
        driver: ProviderDriverKind.make("pi"),
        transcriptFile: new URL("./simple/pi_transcript.ndjson", import.meta.url),
        modelSelection: PI_MODEL_SELECTION,
        assertOutput: assertPiSimpleOutput,
      },
    ],
  },
  {
    name: "multi_turn",
    buildInput: multiTurnInput,
    providers: [
      {
        driver: ProviderDriverKind.make("pi"),
        transcriptFile: new URL("./multi_turn/pi_transcript.ndjson", import.meta.url),
        modelSelection: PI_MODEL_SELECTION,
        assertOutput: assertPiMultiTurnOutput,
      },
    ],
  },
  {
    name: "pi_compaction",
    buildInput: piCompactionInput,
    providers: [
      {
        driver: ProviderDriverKind.make("pi"),
        transcriptFile: new URL("./pi_compaction/pi_transcript.ndjson", import.meta.url),
        modelSelection: PI_MODEL_SELECTION,
        assertOutput: assertPiCompactionOutput,
      },
    ],
  },
  {
    name: "provider_thread_resume",
    buildInput: providerThreadResumeInput,
    providers: [
      {
        driver: ProviderDriverKind.make("pi"),
        transcriptFile: new URL("./provider_thread_resume/pi_transcript.ndjson", import.meta.url),
        modelSelection: PI_MODEL_SELECTION,
        assertOutput: assertPiProviderThreadResumeOutput,
      },
    ],
  },
  {
    name: "message_steering",
    buildInput: messageSteeringInput,
    providers: [
      {
        driver: ProviderDriverKind.make("pi"),
        transcriptFile: new URL("./message_steering/pi_transcript.ndjson", import.meta.url),
        modelSelection: PI_MODEL_SELECTION,
        assertOutput: assertPiMessageSteeringOutput,
      },
    ],
  },
  {
    name: "turn_interrupt_mid_tool",
    buildInput: turnInterruptMidToolInput,
    providers: [
      {
        driver: ProviderDriverKind.make("pi"),
        transcriptFile: new URL("./turn_interrupt_mid_tool/pi_transcript.ndjson", import.meta.url),
        modelSelection: PI_MODEL_SELECTION,
        assertOutput: assertTurnInterruptMidToolPiOutput,
      },
    ],
  },
  {
    name: "thread_rollback",
    buildInput: threadRollbackInput,
    providers: [
      {
        driver: ProviderDriverKind.make("pi"),
        transcriptFile: new URL("./thread_rollback/pi_transcript.ndjson", import.meta.url),
        modelSelection: PI_MODEL_SELECTION,
        assertOutput: assertPiThreadRollbackOutput,
      },
    ],
  },
  {
    name: "thread_rollback_after_stop",
    buildInput: threadRollbackAfterStopInput,
    providers: [
      {
        driver: ProviderDriverKind.make("pi"),
        transcriptFile: new URL(
          "./thread_rollback_after_stop/pi_transcript.ndjson",
          import.meta.url,
        ),
        modelSelection: PI_MODEL_SELECTION,
        assertOutput: assertPiThreadRollbackAfterStopOutput,
      },
    ],
  },
];
