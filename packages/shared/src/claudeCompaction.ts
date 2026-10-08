/**
 * Copy for Claude's resume compaction dialog, shared by the server adapter
 * (which asks the question) and the web client (which recognizes the
 * question and its "never" answer in resolved user-input activities to
 * mirror the dismissal). Both sides must agree on these strings, so they
 * live here: reword the question or the answer label in this file only.
 */
export const CLAUDE_RESUME_COMPACTION_NEVER_ANSWER = "不再询问";

export function formatClaudeResumeCompactionQuestion(input: {
  readonly ageMinutes: number;
  readonly estimatedTokens: number;
}): string {
  const ageLabel =
    input.ageMinutes >= 60
      ? `${Math.floor(input.ageMinutes / 60)} 小时 ${input.ageMinutes % 60} 分钟`
      : `${input.ageMinutes} 分钟`;
  return `此会话已持续 ${ageLabel}，使用了 ${input.estimatedTokens.toLocaleString("en-US")} token。继续前压缩上下文？`;
}

const CLAUDE_RESUME_COMPACTION_QUESTION_PATTERN =
  /^This session is (?:\d+h \d+m|\d+m) old and uses \d{1,3}(?:,\d{3})* tokens\. Compact it before continuing\?$/u;

export function isClaudeResumeCompactionQuestion(question: string): boolean {
  return (
    CLAUDE_RESUME_COMPACTION_QUESTION_PATTERN.test(question) ||
    /^此会话已持续 (?:\d+ 小时 \d+ 分钟|\d+ 分钟)，使用了 \d{1,3}(?:,\d{3})* token。继续前压缩上下文？$/u.test(
      question,
    )
  );
}
