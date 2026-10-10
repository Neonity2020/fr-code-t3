import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { ProviderInstanceId } from "@t3tools/contracts";
import { HostProcessEnvironment } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as Scanner from "./AgentSessionScanner.ts";

const timestamp = "2026-08-01T10:00:00.000Z";
const transcript = (cwd: string) =>
  [
    { type: "session", id: "session", cwd, timestamp },
    { type: "model_change", id: "model", parentId: null, provider: "openai", modelId: "gpt-6" },
    {
      type: "message",
      id: "user",
      parentId: "model",
      timestamp,
      message: { role: "user", content: "Fix the bug" },
    },
    {
      type: "message",
      id: "discarded",
      parentId: "user",
      message: { role: "assistant", content: "Old branch" },
    },
    {
      type: "message",
      id: "current",
      parentId: "user",
      timestamp,
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "private" },
          { type: "text", text: "Fixed" },
        ],
      },
    },
    { type: "session_info", id: "title", parentId: "current", name: "Bug fix" },
  ]
    .map((value) => JSON.stringify(value))
    .join("\n");
const parse = (contents: string) =>
  Scanner.parseAgentSessionTranscript({
    source: "pi",
    providerInstanceId: ProviderInstanceId.make("pi"),
    fallbackSessionId: "/session.jsonl",
    lastActiveAtMs: Date.parse(timestamp),
    contents,
  });

it("imports only the active branch and visible message content", () => {
  const thread = parse(transcript("/project"));
  expect(thread).toMatchObject({
    title: "Bug fix",
    model: "openai/gpt-6",
    providerSessionId: "/session.jsonl",
    createdAt: timestamp,
  });
  expect(thread?.messages.map((message) => message.text)).toEqual(["Fix the bug", "Fixed"]);
});
it("rejects cyclic session trees and transcripts without user messages", () => {
  expect(
    parse(
      JSON.stringify({
        type: "message",
        id: "cycle",
        parentId: "cycle",
        message: { role: "user", content: "hello" },
      }),
    ),
  ).toBeNull();
  expect(
    parse(
      JSON.stringify({
        type: "message",
        id: "assistant",
        message: { role: "assistant", content: "hello" },
      }),
    ),
  ).toBeNull();
});

it.layer(NodeServices.layer)("Pi session discovery", (it) => {
  it.effect(
    "scans an isolated Pi home, imports its branch, and skips an unchanged completed source",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const home = yield* fs.makeTempDirectoryScoped({ prefix: "fr-pi-scanner-" });
        const workspace = path.join(home, "project");
        const sessions = path.join(home, "sessions", "project");
        yield* fs.makeDirectory(workspace);
        yield* fs.makeDirectory(sessions, { recursive: true });
        yield* fs.writeFileString(path.join(sessions, "session.jsonl"), transcript(workspace));
        const scannerLayer = Scanner.layer.pipe(
          Layer.provide(
            Layer.mergeAll(
              ServerSettings.layerTest(),
              Layer.succeed(HostProcessEnvironment, { PI_CODING_AGENT_DIR: home }),
              Layer.mock(ProjectStore.ProjectStoreV2)({ listShells: () => Effect.succeed([]) }),
            ),
          ),
        );
        yield* Effect.gen(function* () {
          const scanner = yield* Scanner.AgentSessionScanner;
          const scan = yield* scanner.scan;
          expect(scan.candidates).toHaveLength(1);
          expect(scan.candidates[0]).toMatchObject({
            threadCount: 1,
            sources: ["pi"],
            alreadyImported: false,
          });
          const outcomes = yield* Stream.runCollect(scanner.recentThreads(workspace));
          expect(outcomes[0]?._tag).toBe("Importable");
          const outcome = outcomes[0];
          if (outcome?._tag !== "Importable") throw new Error("Expected importable session");
          const completed = yield* Stream.runCollect(
            scanner.recentThreads(workspace, [outcome.source]),
          );
          expect(completed[0]?._tag).toBe("AlreadyImported");
        }).pipe(Effect.provide(scannerLayer));
      }),
  );
});
