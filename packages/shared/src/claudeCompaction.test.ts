import { describe, expect, it } from "vite-plus/test";

import {
  formatClaudeResumeCompactionQuestion,
  isClaudeResumeCompactionQuestion,
} from "./claudeCompaction.ts";

describe("claude resume compaction copy", () => {
  // The matcher must recognize every question the formatter can produce.
  // This is the drift guard: rewording one side fails here.
  it.each([
    { ageMinutes: 145, estimatedTokens: 275_123 },
    { ageMinutes: 70, estimatedTokens: 100_000 },
    { ageMinutes: 59, estimatedTokens: 1_234_567 },
    { ageMinutes: 0, estimatedTokens: 0 },
  ])("matches its own formatted question (%o)", (input) => {
    const question = formatClaudeResumeCompactionQuestion(input);
    expect(isClaudeResumeCompactionQuestion(question)).toBe(true);
  });

  it("formats ages above and below one hour", () => {
    expect(
      formatClaudeResumeCompactionQuestion({ ageMinutes: 145, estimatedTokens: 275_123 }),
    ).toBe("此会话已持续 2 小时 25 分钟，使用了 275,123 token。继续前压缩上下文？");
    expect(formatClaudeResumeCompactionQuestion({ ageMinutes: 45, estimatedTokens: 1_000 })).toBe(
      "此会话已持续 45 分钟，使用了 1,000 token。继续前压缩上下文？",
    );
  });

  it("recognizes questions stored before localization", () => {
    expect(
      isClaudeResumeCompactionQuestion(
        "This session is 2h 0m old and uses 250,000 tokens. Compact it before continuing?",
      ),
    ).toBe(true);
  });

  it("does not match unrelated questions", () => {
    expect(
      isClaudeResumeCompactionQuestion("The build cache is large. Compact it before continuing?"),
    ).toBe(false);
  });
});
