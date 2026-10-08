import { describe, expect, it } from "vite-plus/test";

import { editorLabelForPlatform, openInEditorMenuLabel } from "./editorLabels";

describe("editorLabelForPlatform", () => {
  it("uses the editor name from the shared editor definitions", () => {
    expect(editorLabelForPlatform("cursor", "MacIntel")).toBe("Cursor");
    expect(editorLabelForPlatform("vscode-insiders", "Win32")).toBe("VS Code Insiders");
  });

  it.each([
    ["MacIntel", "Finder"],
    ["Win32", "File Explorer"],
    ["Linux x86_64", "Files"],
  ])("uses the platform file-manager name on %s", (platform, label) => {
    expect(editorLabelForPlatform("file-manager", platform)).toBe(label);
  });
});

describe("openInEditorMenuLabel", () => {
  it("names the preferred editor", () => {
    expect(openInEditorMenuLabel("zed")).toBe("在 Zed 中打开");
  });

  it("keeps the generic label for the default file handler and missing preferences", () => {
    expect(openInEditorMenuLabel("file-manager")).toBe("在编辑器打开");
    expect(openInEditorMenuLabel(null)).toBe("在编辑器打开");
  });
});
