/**
 * The actions a pull request offers, extracted from the detail panel so smaller surfaces — the
 * thread details panel's pull request row — perform them through the very same code. Two callers
 * running two copies of "merge" or "resolve in a thread" would drift apart one fix at a time;
 * these hooks are where that behavior lives, and the panels are only where it is rendered.
 */
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ProjectId,
  PullRequestAction,
  PullRequestDetail,
  PullRequestMergeMethod,
  PullRequestRef,
} from "@t3tools/contracts";
import { useCallback, useRef, useState } from "react";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import { useClientSettings, useEnvironmentSettings } from "~/hooks/useSettings";
import {
  deriveLogicalProjectKeyFromSettings,
  derivePhysicalProjectKey,
  selectProjectGroupingSettings,
} from "~/logicalProject";
import { buildPhysicalToLogicalProjectKeyMap } from "~/sidebarProjectGrouping";
import { useProjects } from "~/state/entities";
import { usePrimaryEnvironmentId } from "~/state/environments";

import { type DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { usePreparePullRequestThreadAction } from "~/lib/sourceControlActions";
import type { ReviewCommentContext } from "~/reviewCommentContext";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { useAtomCommand } from "~/state/use-atom-command";

import { toastManager } from "../ui/toast";
import { handoffPrompt, handoffReviewComments, readableFailure } from "./pullRequestDetail.logic";
import { pullRequestEntryKey, type EnvironmentPullRequestEntry } from "./pullRequestList.logic";

/** Resolve on demand so hidden quick actions do not rebuild the legacy project grouping. */
export function usePullRequestDefaultMergeMethodResolver(
  environmentId: EnvironmentId,
  projectId: ProjectId,
) {
  const projectDefault = useEnvironmentSettings(
    environmentId,
    (settings) => resolveProjectSettings(settings, projectId).settings.pullRequestMergeMethod,
  );
  const legacyOverrides = useClientSettings((settings) => settings.pullRequestMergeMethodOverrides);
  const grouping = useClientSettings(selectProjectGroupingSettings);
  const projects = useProjects();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  return useCallback(() => {
    if (projectDefault != null) return projectDefault;
    if (Object.keys(legacyOverrides).length === 0) return undefined;
    const project = projects.find(
      (candidate) => candidate.environmentId === environmentId && candidate.id === projectId,
    );
    if (!project) return undefined;
    // Duplicate sidebar rows borrow their logical group key from their siblings.
    const key =
      buildPhysicalToLogicalProjectKeyMap({
        projects,
        settings: grouping,
        primaryEnvironmentId,
      }).get(derivePhysicalProjectKey(project)) ??
      deriveLogicalProjectKeyFromSettings(project, grouping);
    return legacyOverrides[key];
  }, [
    projectDefault,
    projects,
    environmentId,
    projectId,
    grouping,
    primaryEnvironmentId,
    legacyOverrides,
  ]);
}

const ACTION_SUCCESS_LABELS: Record<PullRequestAction, string> = {
  merge: "已请求合并",
  ready: "已标记为可审查",
  draft: "已转为草稿",
  close: "拉取请求已关闭",
  reopen: "拉取请求已重新打开",
  "update-branch": "分支已根据基准分支更新",
  "enable-auto-merge": "自动合并已启用",
  "disable-auto-merge": "自动合并已禁用",
  revert: "撤销拉取请求已打开",
  "approve-workflows": "工作流已批准",
};

/** Said as the thing that did not happen, rather than as the operation that returned an error. */
const ACTION_FAILURE_LABELS: Record<PullRequestAction, string> = {
  merge: "无法合并此拉取请求",
  ready: "无法标记为可审查",
  draft: "无法转为草稿",
  close: "无法关闭此拉取请求",
  reopen: "无法重新打开此拉取请求",
  "update-branch": "无法更新此分支",
  "enable-auto-merge": "无法启用自动合并",
  "disable-auto-merge": "无法禁用自动合并",
  revert: "无法打开撤销拉取请求",
  "approve-workflows": "无法批准工作流",
};

/** What to try, for the times the host says only that it refused. */
const ACTION_FAILURE_HINTS: Record<PullRequestAction, string> = {
  merge:
    "The host refused the merge. Check that you have write access, that the checks it requires have passed, and that the branch is not conflicting.",
  ready: "The host refused it. Check that you have write access to this repository.",
  draft: "The host refused it. Check that you have write access to this repository.",
  close: "The host refused it. Check that you have write access, or that you opened it.",
  reopen:
    "The host refused it. Check that you have write access, and that the branch still exists.",
  "update-branch":
    "The host refused it. Check that you have write access, and that the base branch has not diverged in a way the host cannot merge.",
  "enable-auto-merge":
    "The host refused it. Check that auto-merge is enabled for this repository and that you have write access.",
  "disable-auto-merge": "The host refused it. Check that you have write access to this repository.",
  revert:
    "The host refused it. Check that you have write access and that this pull request was merged on the host.",
  "approve-workflows":
    "The host refused it. Check that you have Actions write access and that these workflow runs are still awaiting approval.",
};

/**
 * Runs one host action against a pull request, with the toasts every surface should say the same
 * way. `onSuccess` is where the caller re-reads whatever it is showing.
 */
export function usePullRequestActionRunner({
  environmentId,
  reference,
  onSuccess,
  resolveMergeMethod,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef | null;
  onSuccess?: (action: PullRequestAction) => void;
  /** Small surfaces resolve repository settings on the click, not for every visible row. */
  resolveMergeMethod?: (detail: PullRequestDetail) => PullRequestMergeMethod;
}) {
  const runAction = useAtomCommand(pullRequestEnvironment.runAction, { reportFailure: false });
  const [actionPending, setActionPending] = useState(false);
  const pendingRef = useRef(false);

  const perform = async (action: PullRequestAction, method?: PullRequestMergeMethod) => {
    if (pendingRef.current || reference === null) return;
    pendingRef.current = true;
    setActionPending(true);
    try {
      const result = await runAction({
        environmentId,
        input: {
          ...reference,
          action,
          ...(method ? { mergeMethod: method } : resolveMergeMethod ? { resolveMergeMethod } : {}),
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      toastManager.add({ type: "success", title: ACTION_SUCCESS_LABELS[action] });
      onSuccess?.(action);
    } catch (failure) {
      toastManager.add({
        type: "error",
        title: ACTION_FAILURE_LABELS[action],
        description: readableFailure(failure, ACTION_FAILURE_HINTS[action]),
      });
    } finally {
      pendingRef.current = false;
      setActionPending(false);
    }
  };

  return { actionPending, perform };
}

/** Queue a close sweep through the same environment lanes as individual actions. */
export function usePullRequestCloseBatch(onClosed: (entry: EnvironmentPullRequestEntry) => void) {
  const runAction = useAtomCommand(pullRequestEnvironment.runAction, { reportFailure: false });
  const pending = useRef(new Set<string>());
  const [closingKeys, setClosingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const close = useCallback(
    async (entries: readonly EnvironmentPullRequestEntry[]) => {
      const batch = entries.filter((entry) => {
        const key = pullRequestEntryKey(entry);
        if (entry.state !== "open" || entry.provider !== "github" || pending.current.has(key))
          return false;
        pending.current.add(key);
        return true;
      });
      if (batch.length === 0) return;
      setClosingKeys(new Set(pending.current));
      let closed = 0;
      const failures: string[] = [];
      await Promise.all(
        batch.map(async (entry) => {
          try {
            const result = await runAction({
              environmentId: entry.environmentId,
              input: {
                projectId: entry.projectId,
                host: entry.host,
                repository: entry.repository,
                number: entry.number,
                action: "close",
              },
            });
            if (result._tag === "Failure") throw squashAtomCommandFailure(result);
            closed++;
            onClosed(entry);
          } catch (failure) {
            failures.push(
              `#${entry.number}: ${readableFailure(failure, ACTION_FAILURE_HINTS.close)}`,
            );
          } finally {
            pending.current.delete(pullRequestEntryKey(entry));
            setClosingKeys(new Set(pending.current));
          }
        }),
      );
      toastManager.add({
        type: failures.length > 0 ? "error" : "success",
        title:
          failures.length > 0
            ? `已关闭 ${closed} 个拉取请求，共 ${batch.length} 个`
            : `已关闭 ${closed} 个拉取请求`,
        ...(failures.length > 0 ? { description: failures.slice(0, 3).join("\n") } : {}),
      });
    },
    [onClosed, runAction],
  );
  return { close, closingKeys };
}

export interface PullRequestThreadTask {
  prompt: string;
  reviewComments?: ReadonlyArray<ReviewCommentContext>;
}

/** What a hand-off needs to know about the pull request it is handing over. */
export type PullRequestHandoffDetail = Pick<
  PullRequestDetail,
  "projectId" | "workspaceRoot" | "url"
>;

/**
 * What the last hand-off wrote into each draft, kept outside React because the panel that wrote it
 * is closed by the time the next one opens. It is how a prompt the reader has since edited is told
 * apart from the one they were handed: only the sentence still exactly as written may be replaced.
 */
const lastHandoffPromptByDraft = new Map<DraftId, string>();

/**
 * The hand-offs from a pull request into a thread: a question that needs nothing checked out, and
 * a task that needs the branch under the agent's feet first. One `handoff` key holds them all to
 * one at a time, whatever surface pressed the button.
 */
export function usePullRequestHandoffs({
  environmentId,
  detail,
}: {
  environmentId: EnvironmentId;
  detail: PullRequestHandoffDetail | null;
}) {
  const newThread = useNewThreadHandler();
  const prepareThread = usePreparePullRequestThreadAction({
    environmentId,
    cwd: detail?.workspaceRoot ?? null,
  });
  // Which handoff is preparing, keyed so a per-finding button can say "Preparing..." on itself
  // alone. One at a time whatever the key: they all check the same pull request out.
  const [handoff, setHandoff] = useState<string | null>(null);

  /**
   * Opens a thread on this project and leaves the task in its composer for the reader to send.
   *
   * Nothing is checked out: asking a question is not a reason to move somebody's working tree or
   * to make a worktree they did not ask for. The two hand-offs that do need the code call this
   * after preparing it, so there is one path from "a task" to "a thread holding it".
   */
  const openThreadWithTask = async (
    projectRef: ReturnType<typeof scopeProjectRef>,
    task: PullRequestThreadTask | null,
    opened?: { draftId: DraftId },
  ): Promise<{ draftId: DraftId } | null> => {
    const session =
      opened ??
      (await newThread(projectRef).then(
        (result) => result,
        () => null,
      ));
    if (session === null) return null;
    const store = useComposerDraftStore.getState();
    if (task === null) return session;
    // The latest press is the ask: it takes over what an earlier hand-off left, prompt and chips
    // both, rather than stacking a second one under the first. What the reader typed themselves
    // survives — the composer they are handed is not always a fresh one, and a prompt they have
    // since edited is theirs rather than the hand-off's.
    const draft = store.getComposerDraft(session.draftId);
    const existingComments = draft?.reviewComments ?? [];
    const prompt = handoffPrompt(
      {
        prompt: draft?.prompt ?? "",
        lastHandoffPrompt: lastHandoffPromptByDraft.get(session.draftId),
      },
      task.prompt,
    );
    // Remember the hand-off's own contribution, not the merged prompt: only that sentence is
    // this session's to take back next time, and the reader's text around it is not.
    lastHandoffPromptByDraft.set(session.draftId, task.prompt);
    store.setPrompt(session.draftId, prompt);
    store.setReviewComments(
      session.draftId,
      handoffReviewComments(existingComments, task.reviewComments ?? []),
    );
    return session;
  };

  /** A question about the change, which needs a thread and nothing else. */
  const startAsk = async (kind: string, task: PullRequestThreadTask) => {
    if (!detail || handoff !== null) return;
    setHandoff(kind);
    const projectRef = scopeProjectRef(environmentId, detail.projectId);
    const opened = await openThreadWithTask(projectRef, task);
    setHandoff(null);
    if (opened === null) {
      toastManager.add({
        type: "error",
        title: "无法打开会话",
        description: "请从项目重试，或先打开一个会话。",
      });
      return;
    }
    toastManager.add({
      type: "success",
      title: "已在会话中提问",
      // "Ask" leaves the composer empty on purpose, so saying the question is in it would send
      // the reader looking for something that is not there. The chips are what landed.
      description:
        task.prompt.length > 0
          ? "问题已放入输入框，请检查后发送。"
          : "拉取请求已放入输入框，请输入问题后发送。",
    });
  };

  // Every handoff works the same way: check the pull request out into its own worktree, open a
  // thread there, and — when it carries a task — put that in the composer for the user to read
  // before sending. Checking out is the whole point of the ones that carry nothing.
  const startHandoff = async (
    kind: string,
    task: PullRequestThreadTask | null,
    // A worktree leaves whatever is open alone, which is why it is the default. Checking out in
    // the repository itself is what you want when the point is to run the thing where you
    // already work — and it moves the branch under everything else that is open there.
    mode: "worktree" | "local" = "worktree",
  ) => {
    if (!detail || handoff !== null) return;
    setHandoff(kind);
    // The menu closes on the press and takes its "Preparing..." label with it, so this is the
    // only thing answering for the checkout. It carries no timeout of its own: a loading toast
    // never expires, and an explicit one would survive the update and pin the result on screen.
    const toastId = toastManager.add({
      type: "loading",
      title: "正在准备拉取请求工作目录…",
    });
    const projectRef = scopeProjectRef(environmentId, detail.projectId);
    // The thread is opened before the checkout rather than after it, because the project's setup
    // script only runs for a checkout that knows which thread it is for — and a worktree with no
    // dependencies installed is not something anyone can test.
    const opened = await newThread(projectRef).then(
      (session) => session,
      () => null,
    );
    if (opened === null) {
      setHandoff(null);
      // Without a thread there is nowhere for the checkout to belong: its setup script would not
      // run and its task would have no composer to land in. Better to stop before touching the
      // working tree than to prepare a worktree nobody asked for.
      toastManager.update(toastId, {
        type: "error",
        title: "无法为工作目录打开会话",
        description: "请从项目重试，或先打开一个会话。",
      });
      return;
    }
    const prepared = await prepareThread.run({
      reference: detail.url,
      mode,
      threadId: opened.threadId,
    });
    if (prepared._tag === "Failure") {
      setHandoff(null);
      // The server says what to do about it — that the branch is already checked out in the main
      // repository, say — and that sentence is the only way out of the failure.
      const detailMessage =
        prepareThread.error instanceof Error ? prepareThread.error.message : null;
      toastManager.update(toastId, {
        type: "error",
        title: "无法准备拉取请求工作目录",
        ...(detailMessage ? { description: detailMessage } : {}),
      });
      return;
    }
    // The same thread again, now that there is somewhere to point it at. A local checkout has
    // no worktree of its own, so the thread runs where the repository already is.
    const pointed = await newThread(projectRef, {
      branch: prepared.value.branch,
      worktreePath: prepared.value.worktreePath,
      envMode: prepared.value.worktreePath === null ? "local" : "worktree",
    }).then(
      (session) => session !== null,
      () => false,
    );
    if (!pointed) {
      setHandoff(null);
      // The checkout is on disk; only the thread failed to move onto it. Writing the task now
      // would send the agent at whatever the thread was already open on — which is the one
      // outcome worth stopping for, since it reads as success and is not.
      toastManager.update(toastId, {
        type: "error",
        title: "已检出，但会话仍在原位置",
        description: `工作目录已在 \`${prepared.value.branch}\` 准备就绪。请从分支选择器将会话指向该目录，然后重试。`,
      });
      return;
    }
    // Released here whatever happened next: a loading toast never expires on its own, so leaving
    // this set would spin forever and lock every handoff behind it until a reload.
    setHandoff(null);
    // A worktree that was already there and had been worked in keeps whatever it holds, so the
    // thread opens on older code than the pull request carries. Said once, in place of the
    // success, because everything else about the handoff did happen.
    const staleCheckoutToast = {
      type: "warning",
      title: "已检出，但未更新到最新提交",
      description:
        "工作目录无法移至拉取请求的最新提交，因此其中的代码较旧。未提交的改动或本地提交阻止了更新。",
    } as const;
    if (task === null) {
      toastManager.update(
        toastId,
        prepared.value.isOnPullRequestHead
          ? {
              type: "success",
              title: mode === "local" ? "已在此检出" : "已检出",
              description:
                mode === "local"
                  ? "此仓库已切换到拉取请求分支，并打开了会话。"
                  : "拉取请求已放入独立工作树，并打开了会话。",
            }
          : staleCheckoutToast,
      );
      return;
    }
    await openThreadWithTask(projectRef, task, opened);
    toastManager.update(
      toastId,
      prepared.value.isOnPullRequestHead
        ? {
            type: "success",
            title: "工作目录已就绪",
            description: "任务已放入输入框，请检查后发送。",
          }
        : staleCheckoutToast,
    );
  };

  return { handoff, startAsk, startHandoff };
}
