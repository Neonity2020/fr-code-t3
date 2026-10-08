import { describe, expect, it } from "vite-plus/test";

import {
  revealInFileExplorerLabel,
  revealInFileExplorerLabelForKind,
  revealInFileExplorerLabelForOs,
} from "./fileExplorerLabel";

describe("revealInFileExplorerLabel", () => {
  it.each([
    ["MacIntel", "在访达中显示"],
    ["Win32", "在文件资源管理器中显示"],
    ["Linux x86_64", "在文件管理器中显示"],
  ])("maps %s to %s", (platform, expected) => {
    expect(revealInFileExplorerLabel(platform)).toBe(expected);
  });
});

describe("revealInFileExplorerLabelForOs", () => {
  it.each([
    ["darwin", "在访达中显示"],
    ["windows", "在文件资源管理器中显示"],
    ["linux", "在文件管理器中显示"],
    ["unknown", "在文件管理器中显示"],
  ] as const)("maps %s to %s", (os, expected) => {
    expect(revealInFileExplorerLabelForOs(os)).toBe(expected);
  });
});

describe("revealInFileExplorerLabelForKind", () => {
  it.each([
    ["finder", "在访达中显示"],
    ["file-explorer", "在文件资源管理器中显示"],
    ["files", "在文件管理器中显示"],
  ] as const)("maps %s to %s", (kind, expected) => {
    expect(revealInFileExplorerLabelForKind(kind)).toBe(expected);
  });
});
