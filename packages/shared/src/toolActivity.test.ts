import { describe, expect, it } from "vite-plus/test";

import {
  claudeSkillInvocation,
  classifyToolActivity,
  collectToolFilePaths,
  deriveToolActivityPresentation,
  dynamicToolTitle,
  formatReadToolLabel,
  formatSearchToolLabel,
  mergeToolActivityData,
} from "./toolActivity.ts";

describe("toolActivity", () => {
  it("normalizes command tools to a stable ran-command label", () => {
    expect(
      deriveToolActivityPresentation({
        itemType: "command_execution",
        title: "终端",
        detail: "Terminal",
        data: {
          command: "bun run lint",
        },
        fallbackSummary: "Terminal",
      }),
    ).toEqual({
      summary: "运行了命令",
      detail: "bun run lint",
    });
  });

  it("uses structured file paths for read-file tools when available", () => {
    expect(
      deriveToolActivityPresentation({
        itemType: "dynamic_tool_call",
        title: "Read File",
        detail: "Read File",
        data: {
          kind: "read",
          locations: [{ path: "/tmp/app.ts" }],
        },
        fallbackSummary: "Read File",
      }),
    ).toEqual({
      summary: "读取了 /tmp/app.ts",
    });
  });

  it("drops duplicated generic read-file detail when no path is available", () => {
    expect(
      deriveToolActivityPresentation({
        itemType: "dynamic_tool_call",
        title: "Read File",
        detail: "Read File",
        data: {
          kind: "read",
          rawInput: {},
        },
        fallbackSummary: "Read File",
      }),
    ).toEqual({
      summary: "读取文件",
    });
  });

  it("classifies from kind and toolName without sniffing titles", () => {
    expect(classifyToolActivity({ data: { kind: "read" } })).toBe("read");
    expect(classifyToolActivity({ data: { toolName: "Grep" } })).toBe("search");
    expect(classifyToolActivity({ data: { toolName: "Read" } })).toBe("read");
    for (const toolName of ["github.read_file", "mongodb.find", "mcp__github__read_file"]) {
      expect(classifyToolActivity({ data: { toolName } })).toBe("other");
    }
    expect(classifyToolActivity({ title: "Find", data: {} })).toBe("other");
  });

  it("classifies Claude search tools ahead of their broad file-read request kind", () => {
    for (const toolName of ["Glob", "Grep", "LS"]) {
      expect(classifyToolActivity({ requestKind: "file-read", data: { toolName } })).toBe("search");
    }
    expect(classifyToolActivity({ requestKind: "file-read", data: { toolName: "Read" } })).toBe(
      "read",
    );
  });

  it("formats read and search labels from structured input", () => {
    expect(formatReadToolLabel("src/env.ts")).toBe("读取了 src/env.ts");
    expect(formatReadToolLabel("src/env.ts", 2)).toBe("读取了 src/env.ts，另有 2 项");
    expect(formatReadToolLabel("")).toBe("读取文件");
    expect(
      formatSearchToolLabel({
        input: { pattern: "TODO", path: "apps/web" },
      }),
    ).toBe("在 web 中搜索了 TODO");
    expect(
      formatSearchToolLabel({
        input: { glob: "*.ts", path: "/tmp/t3chat-new" },
      }),
    ).toBe("在 t3chat-new 中搜索了文件 *.ts");
    expect(
      formatSearchToolLabel({ rawInput: {}, input: { pattern: "TODO", path: "apps/web" } }),
    ).toBe("在 web 中搜索了 TODO");
    expect(formatSearchToolLabel({ input: { globPattern: "*.tsx", path: "apps/web" } })).toBe(
      "在 web 中搜索了文件 *.tsx",
    );
    expect(
      formatSearchToolLabel({ input: { pattern: "TODO", glob: "*.ts", path: "apps/web" } }),
    ).toBe("在 web 中搜索了 TODO");
  });

  it("keeps bare filenames from explicit path fields", () => {
    expect(collectToolFilePaths({ input: { file_path: "README" } })).toEqual(["README"]);
  });

  it("keeps the first non-empty rawInput when a later update is empty", () => {
    expect(
      mergeToolActivityData({ rawInput: { path: "src/a.ts" } }, { rawInput: {}, kind: "read" }),
    ).toEqual({
      rawInput: { path: "src/a.ts" },
      kind: "read",
    });
    expect(
      mergeToolActivityData({ rawInput: { path: "src/a.ts" } }, { rawInput: { startLine: 4 } }),
    ).toEqual({ rawInput: { path: "src/a.ts", startLine: 4 } });
  });

  it("titles Claude skill calls with the skill they load", () => {
    expect(dynamicToolTitle("Skill", { skill: "full-send" })).toBe("技能：full-send");
    expect(claudeSkillInvocation("Skill", { skill: "claude-api", args: " pricing " })).toEqual({
      name: "claude-api",
      args: "pricing",
    });
    expect(dynamicToolTitle("Skill", { skill: " " })).toBeUndefined();
    expect(dynamicToolTitle("Read", { skill: "full-send" })).toBeUndefined();
  });
});
