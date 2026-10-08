import { assistantCitationsToPlainText } from "@t3tools/shared/assistantCitations";
import { truncate } from "@t3tools/shared/String";

export interface ThreadTitleSeedInput {
  readonly text: string;
  readonly attachments: ReadonlyArray<{ readonly name: string }>;
  readonly fallbackLabels?: ReadonlyArray<string | null | undefined>;
}

function normalizeTitleSeed(value: string): string {
  return assistantCitationsToPlainText(value).trim().replace(/\s+/gu, " ");
}

export function deriveThreadTitleSeed(input: ThreadTitleSeedInput): string {
  const text = normalizeTitleSeed(input.text);
  if (text.length > 0) {
    return truncate(text);
  }

  const attachmentName = normalizeTitleSeed(input.attachments[0]?.name ?? "");
  if (attachmentName.length > 0) {
    return truncate(`图片：${attachmentName}`);
  }

  for (const label of input.fallbackLabels ?? []) {
    const normalized = normalizeTitleSeed(label ?? "");
    if (normalized.length > 0) {
      return truncate(normalized);
    }
  }

  return "新建会话";
}
