import { EDITORS, type EditorId } from "@t3tools/contracts";

import { getLocalFileManagerName } from "~/lib/utils";

const editorLabels = new Map<EditorId, string>(EDITORS.map((editor) => [editor.id, editor.label]));

export function editorLabelForPlatform(editorId: EditorId, platform: string): string {
  if (editorId === "file-manager") {
    return getLocalFileManagerName(platform);
  }

  return editorLabels.get(editorId) ?? "编辑器";
}

export function openInEditorMenuLabel(editorId: EditorId | null): string {
  return editorId === null || editorId === "file-manager"
    ? "在编辑器打开"
    : `在 ${editorLabels.get(editorId) ?? "编辑器"} 中打开`;
}
