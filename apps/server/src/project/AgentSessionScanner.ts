import * as NodeOS from "node:os";
import {
  AgentSessionScanError,
  ProviderInstanceId,
  type AgentSessionImportSource,
  type AgentSessionScanResult,
  type AgentSessionSource,
} from "@t3tools/contracts";
import { HostProcessEnvironment } from "@t3tools/shared/hostProcess";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Stream from "effect/Stream";
import * as ProjectStore from "../orchestration-v2/ProjectStore.ts";
import * as ServerSettings from "../serverSettings.ts";
import { deriveProviderInstanceConfigMap } from "../provider/ProviderInstanceRegistryHydration.ts";
import { mergeProviderInstanceEnvironment } from "../provider/ProviderInstanceEnvironment.ts";
import { expandHomePath } from "../pathExpansion.ts";

export interface AgentSessionThreadMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly createdAt: string;
}
export interface AgentSessionThread {
  readonly source: AgentSessionSource;
  readonly providerInstanceId: ProviderInstanceId;
  readonly providerSessionId: string;
  readonly title: string;
  readonly model: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: ReadonlyArray<AgentSessionThreadMessage>;
}
export type AgentSessionRecentThread =
  | {
      readonly _tag: "Importable";
      readonly thread: AgentSessionThread;
      readonly source: AgentSessionImportSource;
    }
  | { readonly _tag: "AlreadyImported"; readonly source: AgentSessionImportSource }
  | { readonly _tag: "Duplicate"; readonly source: AgentSessionImportSource }
  | { readonly _tag: "Skipped" };
export class AgentSessionScanner extends Context.Service<
  AgentSessionScanner,
  {
    readonly scan: Effect.Effect<AgentSessionScanResult, AgentSessionScanError>;
    readonly recentThreads: (
      workspaceRoot: string,
      completedSources?: ReadonlyArray<AgentSessionImportSource>,
    ) => Stream.Stream<AgentSessionRecentThread, AgentSessionScanError>;
  }
>()("t3/project/AgentSessionScanner") {}

const MAX_FILES = 4096;
const MAX_TRANSCRIPT_BYTES = 16 * 1024 * 1024;
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const parseRecord = (line: string) => {
  try {
    return record(JSON.parse(line));
  } catch {
    return {};
  }
};
const date = (value: unknown, fallback: number): string =>
  DateTime.formatIso(
    DateTime.makeUnsafe(
      typeof value === "string" && Number.isFinite(Date.parse(value))
        ? Date.parse(value)
        : typeof value === "number" && Number.isFinite(value)
          ? value
          : fallback,
    ),
  );

/** Import the current branch of Pi's session tree; reasoning and tool output remain native to Pi. */
export function parseAgentSessionTranscript(input: {
  readonly source: AgentSessionSource;
  readonly providerInstanceId: ProviderInstanceId;
  readonly fallbackSessionId: string;
  readonly lastActiveAtMs: number;
  readonly contents: string;
}): AgentSessionThread | null {
  if (input.source !== "pi" || Buffer.byteLength(input.contents) > MAX_TRANSCRIPT_BYTES)
    return null;
  const entries = input.contents.split("\n").filter(Boolean).map(parseRecord);
  if (entries.length > 20000) return null;
  const byId = new Map(
    entries
      .filter((entry) => typeof entry.id === "string" && entry.type !== "session")
      .map((entry) => [entry.id, entry]),
  );
  const branch: Record<string, unknown>[] = [];
  let current = entries.findLast(
    (entry) => typeof entry.id === "string" && entry.type !== "session",
  );
  const seen = new Set<unknown>();
  while (current) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    branch.push(current);
    current = typeof current.parentId === "string" ? byId.get(current.parentId) : undefined;
  }
  branch.reverse();
  const messages: AgentSessionThreadMessage[] = [];
  let model: string | null = null;
  let title: string | null = null;
  for (const entry of branch) {
    if (entry.type === "session_info" && typeof entry.name === "string") title = entry.name;
    if (
      entry.type === "model_change" &&
      typeof entry.provider === "string" &&
      typeof entry.modelId === "string"
    )
      model = `${String(entry.provider)}/${entry.modelId}`;
    const message = record(entry.message);
    if (entry.type !== "message" || (message.role !== "user" && message.role !== "assistant"))
      continue;
    const content = message.content;
    const text =
      typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content
              .map((block) => {
                const item = record(block);
                return item.type === "text" && typeof item.text === "string" ? item.text : "";
              })
              .filter(Boolean)
              .join("\n")
          : "";
    if (!text.trim()) continue;
    if (
      message.role === "assistant" &&
      typeof message.model === "string" &&
      typeof message.provider === "string"
    )
      model = `${message.provider}/${message.model}`;
    messages.push({
      role: message.role,
      text,
      createdAt: date(message.timestamp ?? entry.timestamp, input.lastActiveAtMs),
    });
  }
  const first = messages.find((message) => message.role === "user");
  if (!first) return null;
  return {
    source: "pi",
    providerInstanceId: input.providerInstanceId,
    providerSessionId: input.fallbackSessionId,
    title: title?.trim() || first.text.trim().split("\n")[0]!.slice(0, 120),
    model,
    createdAt: date(entries[0]?.timestamp, input.lastActiveAtMs),
    updatedAt: messages.at(-1)!.createdAt,
    messages,
  };
}

export const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const settingsService = yield* ServerSettings.ServerSettingsService;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const hostEnvironment = yield* HostProcessEnvironment;
  const canonical = (value: string) =>
    fs.realPath(path.resolve(value)).pipe(
      Effect.orElseSucceed(() => path.resolve(value)),
      Effect.map(normalizeProjectPathForComparison),
    );
  const discover = Effect.gen(function* () {
    const settings = yield* settingsService.getSettings.pipe(
      Effect.mapError((cause) => new AgentSessionScanError({ operation: "read-settings", cause })),
    );
    const found: Array<{
      filePath: string;
      cwd: string;
      instanceId: ProviderInstanceId;
      mtimeMs: number;
    }> = [];
    const seen = new Set<string>();
    for (const [id, instance] of Object.entries(deriveProviderInstanceConfigMap(settings))) {
      const environment = mergeProviderInstanceEnvironment(instance.environment, hostEnvironment);
      const root = path.join(
        expandHomePath(
          environment.PI_CODING_AGENT_DIR?.trim() || path.join(NodeOS.homedir(), ".pi", "agent"),
        ),
        "sessions",
      );
      const dirs = yield* fs.readDirectory(root).pipe(Effect.orElseSucceed(() => []));
      for (const dir of dirs) {
        if (found.length >= MAX_FILES) break;
        const base = path.join(root, dir);
        const names = yield* fs.readDirectory(base).pipe(Effect.orElseSucceed(() => []));
        for (const name of names) {
          if (found.length >= MAX_FILES) break;
          if (!name.endsWith(".jsonl")) continue;
          const filePath = yield* fs
            .realPath(path.join(base, name))
            .pipe(Effect.orElseSucceed(() => path.join(base, name)));
          if (seen.has(filePath)) continue;
          seen.add(filePath);
          const info = yield* fs.stat(filePath).pipe(Effect.option);
          if (Option.isNone(info) || info.value.type !== "File") continue;
          const header = yield* Effect.scoped(
            Effect.gen(function* () {
              const file = yield* fs.open(filePath);
              const bytes = yield* file.readAlloc(8192);
              return Option.isSome(bytes)
                ? (new TextDecoder().decode(bytes.value).split("\n")[0] ?? "")
                : "";
            }),
          ).pipe(Effect.orElseSucceed(() => ""));
          const session = parseRecord(header);
          if (
            session.type !== "session" ||
            typeof session.cwd !== "string" ||
            !path.isAbsolute(session.cwd)
          )
            continue;
          const cwd = yield* canonical(session.cwd);
          const mtimeMs = Option.isSome(info.value.mtime) ? info.value.mtime.value.getTime() : 0;
          found.push({ filePath, cwd, instanceId: ProviderInstanceId.make(id), mtimeMs });
        }
      }
    }
    return found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  });
  const scan = Effect.gen(function* () {
    const sessions = yield* discover;
    const shells = yield* projects
      .listShells()
      .pipe(
        Effect.mapError(
          (cause) => new AgentSessionScanError({ operation: "read-projects", cause }),
        ),
      );
    const imported = new Map<string, (typeof shells)[number]>();
    for (const project of shells) imported.set(yield* canonical(project.workspaceRoot), project);
    const groups = new Map<string, typeof sessions>();
    for (const session of sessions) {
      const group = groups.get(session.cwd);
      if (group) group.push(session);
      else groups.set(session.cwd, [session]);
    }
    const candidates = [...groups].map(([cwd, list]) => ({
      path: cwd,
      title: path.basename(cwd),
      ...(imported.has(cwd) ? { projectId: imported.get(cwd)!.id } : {}),
      sources: ["pi" as const],
      threadCount: list.length,
      lastActiveAt: DateTime.formatIso(DateTime.makeUnsafe(list[0]!.mtimeMs)),
      alreadyImported: imported.has(cwd),
    }));
    return {
      candidates,
      scannedAt: DateTime.formatIso(yield* DateTime.now),
      truncated: sessions.length >= MAX_FILES,
    };
  });
  const recentThreads: AgentSessionScanner["Service"]["recentThreads"] = (
    workspaceRoot,
    completed = [],
  ) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const cwd = yield* canonical(workspaceRoot);
        const sessions = (yield* discover).filter((session) => session.cwd === cwd);
        return Stream.fromIterable(sessions).pipe(
          Stream.mapEffect((session) =>
            Effect.gen(function* () {
              const info = yield* fs.stat(session.filePath).pipe(Effect.option);
              if (Option.isNone(info) || Number(info.value.size) > MAX_TRANSCRIPT_BYTES)
                return { _tag: "Skipped" } as const;
              const before = info.value;
              const mtimeMs = Option.isSome(before.mtime) ? before.mtime.value.getTime() : null;
              const source: AgentSessionImportSource = {
                provider: "pi",
                providerInstanceId: session.instanceId,
                providerSessionId: session.filePath,
                filePath: session.filePath,
                size: Number(before.size),
                mtimeMs,
                device: before.dev,
                inode: Option.getOrNull(before.ino),
                birthtimeMs: Option.isSome(before.birthtime)
                  ? before.birthtime.value.getTime()
                  : null,
              };
              if (
                completed.some(
                  (previous) =>
                    previous.filePath === source.filePath &&
                    previous.size === source.size &&
                    previous.mtimeMs === source.mtimeMs &&
                    previous.inode === source.inode &&
                    previous.device === source.device,
                )
              )
                return { _tag: "AlreadyImported", source } as const;
              const contents = yield* fs.readFileString(session.filePath).pipe(Effect.option);
              const after = yield* fs.stat(session.filePath).pipe(Effect.option);
              if (
                Option.isNone(contents) ||
                Option.isNone(after) ||
                after.value.size !== before.size ||
                !Option.isSome(after.value.mtime) ||
                after.value.mtime.value.getTime() !== mtimeMs ||
                after.value.dev !== before.dev ||
                Option.getOrNull(after.value.ino) !== source.inode
              )
                return { _tag: "Skipped" } as const;
              const thread = parseAgentSessionTranscript({
                source: "pi",
                providerInstanceId: session.instanceId,
                fallbackSessionId: session.filePath,
                lastActiveAtMs: session.mtimeMs,
                contents: contents.value,
              });
              return thread
                ? ({ _tag: "Importable", thread, source } as const)
                : ({ _tag: "Skipped" } as const);
            }),
          ),
        );
      }),
    );
  return AgentSessionScanner.of({ scan, recentThreads });
});
export const layer = Layer.effect(AgentSessionScanner, make);
