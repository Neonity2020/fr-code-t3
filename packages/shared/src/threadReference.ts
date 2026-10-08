import type { ThreadPullRequestLink } from "@t3tools/contracts";

import { resolveThreadCurrentPullRequestLink } from "./threadPullRequests.ts";

export interface ThreadReferenceCopyTarget {
  readonly kind: "pull-request" | "thread";
  readonly value: string;
  readonly clipboardTarget: string;
  readonly successTitle: string;
  readonly failureTitle: string;
}

export function resolveThreadReferenceCopyTarget(input: {
  readonly threadId: string;
  /** Undefined means no PR panel; null means its URL is not available yet. */
  readonly openPanelPullRequestUrl?: string | null | undefined;
  readonly pullRequests?: ReadonlyArray<ThreadPullRequestLink> | undefined;
  readonly linkedPullRequestUrl?: string | null;
}): ThreadReferenceCopyTarget | null {
  if (input.openPanelPullRequestUrl === null) return null;
  const pullRequestUrl =
    input.openPanelPullRequestUrl ??
    resolveThreadCurrentPullRequestLink(input.pullRequests ?? [])?.url ??
    input.linkedPullRequestUrl;
  return pullRequestUrl
    ? {
        kind: "pull-request",
        value: pullRequestUrl,
        clipboardTarget: "pull request link",
        successTitle: "拉取请求链接已复制",
        failureTitle: "无法复制拉取请求链接",
      }
    : {
        kind: "thread",
        value: input.threadId,
        clipboardTarget: "thread ID",
        successTitle: "会话 ID 已复制",
        failureTitle: "复制会话 ID 失败",
      };
}
