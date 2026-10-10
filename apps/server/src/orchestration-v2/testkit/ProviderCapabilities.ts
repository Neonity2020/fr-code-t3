import type { OrchestrationV2ProviderCapabilities } from "@t3tools/contracts";

// Protocol-independent capability profiles for orchestration tests.
// They exercise policy combinations without loading a provider implementation.
export const FullThreadTestCapabilities = {
  sessions: {
    supportsMultipleProviderThreadsPerSession: true,
    supportsModelSwitchInSession: true,
    supportsProviderSwitchingViaHandoff: true,
    supportsRuntimeModeSwitchInSession: true,
    pendingRequestsSurviveRestart: false,
  },
  threads: {
    canCreateEmptyThread: true,
    canReadThreadSnapshot: true,
    canRollbackThread: true,
    canForkThread: true,
    canForkFromTurn: true,
    canForkFromSubagentThread: true,
    exposesNativeThreadId: true,
  },
  turns: {
    exposesNativeTurnId: true,
    emitsTurnStarted: true,
    emitsTurnCompleted: true,
    supportsInterrupt: true,
    supportsActiveSteering: true,
    supportsSteeringByInterruptRestart: true,
    supportsQueuedMessages: true,
    terminalStatusQuality: "strong",
  },
  streaming: {
    streamsAssistantText: true,
    streamsReasoning: true,
    streamsToolOutput: true,
    streamsPlanText: true,
    emitsMessageCompleted: true,
  },
  tools: {
    exposesToolItemIds: true,
    emitsToolStarted: true,
    emitsToolCompleted: true,
    emitsToolOutput: true,
    supportsMcpTools: true,
    supportsDynamicToolCallbacks: true,
  },
  approvals: {
    supportsCommandApproval: true,
    supportsFileReadApproval: true,
    supportsFileChangeApproval: true,
    supportsApplyPatchApproval: true,
    approvalsHaveNativeRequestIds: true,
    approvalCallbacksAreLiveOnly: true,
    approvalsCanOriginateFromSubagents: true,
  },
  planning: {
    emitsPlanUpdated: true,
    emitsTodoList: true,
    emitsProposedPlan: true,
    supportsStructuredQuestions: true,
    planDeltasHaveItemIds: true,
  },
  subagents: {
    supportsSubagents: true,
    exposesSubagentThreadIds: true,
    emitsSubagentLifecycle: true,
    canWaitForSubagents: true,
    canCloseSubagents: true,
    canForkSubagentThread: true,
  },
  context: {
    acceptsSystemContext: true,
    acceptsDeveloperContext: true,
    acceptsSyntheticUserContext: true,
    canGenerateSummaries: true,
    canConsumeHandoffSummaries: true,
    supportsDeltaHandoff: true,
    supportsFullThreadHandoff: true,
    maxRecommendedHandoffChars: null,
  },
  checkpointing: {
    appCanCheckpointFilesystem: true,
    supportsNestedCheckpointScopes: true,
    providerCanRollbackConversation: true,
    providerRollbackReturnsSnapshot: true,
    providerCanReadConversationSnapshot: true,
  },
  identity: {
    nativeThreadIds: "strong",
    nativeTurnIds: "strong",
    nativeItemIds: "strong",
    nativeRequestIds: "strong",
  },
  runtimePolicy: {
    enforcement: "native",
  },
} satisfies OrchestrationV2ProviderCapabilities;

export const RestartThreadTestCapabilities = {
  ...FullThreadTestCapabilities,
  sessions: {
    ...FullThreadTestCapabilities.sessions,
    supportsMultipleProviderThreadsPerSession: false,
    supportsRuntimeModeSwitchInSession: false,
  },
  threads: {
    ...FullThreadTestCapabilities.threads,
    canReadThreadSnapshot: false,
    canForkFromSubagentThread: false,
  },
  turns: {
    ...FullThreadTestCapabilities.turns,
    exposesNativeTurnId: false,
    activeSteeringInterruptsTools: true,
    supportsSteeringByInterruptRestart: false,
  },
  streaming: {
    ...FullThreadTestCapabilities.streaming,
    streamsToolOutput: false,
    streamsPlanText: false,
  },
  approvals: {
    ...FullThreadTestCapabilities.approvals,
    supportsApplyPatchApproval: false,
    approvalsCanOriginateFromSubagents: false,
  },
  planning: {
    ...FullThreadTestCapabilities.planning,
    planDeltasHaveItemIds: false,
  },
  subagents: {
    ...FullThreadTestCapabilities.subagents,
    exposesSubagentThreadIds: false,
    canWaitForSubagents: false,
    canCloseSubagents: false,
    canForkSubagentThread: false,
  },
  checkpointing: {
    ...FullThreadTestCapabilities.checkpointing,
    providerCanReadConversationSnapshot: false,
  },
  identity: {
    ...FullThreadTestCapabilities.identity,
    nativeTurnIds: "weak",
  },
} satisfies OrchestrationV2ProviderCapabilities;

export const ReadOnlyThreadTestCapabilities = {
  ...FullThreadTestCapabilities,
  sessions: {
    ...FullThreadTestCapabilities.sessions,
    supportsMultipleProviderThreadsPerSession: false,
    supportsRuntimeModeSwitchInSession: false,
  },
  threads: {
    ...FullThreadTestCapabilities.threads,
    canRollbackThread: false,
    canForkThread: false,
    canForkFromTurn: false,
    canForkFromSubagentThread: false,
  },
  turns: {
    ...FullThreadTestCapabilities.turns,
    supportsActiveSteering: false,
  },
  tools: {
    ...FullThreadTestCapabilities.tools,
    supportsDynamicToolCallbacks: false,
  },
  approvals: {
    ...FullThreadTestCapabilities.approvals,
    supportsCommandApproval: false,
    supportsFileReadApproval: false,
    supportsFileChangeApproval: false,
    supportsApplyPatchApproval: false,
    approvalsHaveNativeRequestIds: false,
    approvalCallbacksAreLiveOnly: false,
    approvalsCanOriginateFromSubagents: false,
  },
  planning: {
    ...FullThreadTestCapabilities.planning,
    supportsStructuredQuestions: false,
  },
  subagents: {
    ...FullThreadTestCapabilities.subagents,
    exposesSubagentThreadIds: false,
    canCloseSubagents: false,
    canForkSubagentThread: false,
  },
  context: {
    ...FullThreadTestCapabilities.context,
    acceptsSystemContext: false,
    acceptsDeveloperContext: false,
  },
  checkpointing: {
    ...FullThreadTestCapabilities.checkpointing,
    providerCanRollbackConversation: false,
    providerRollbackReturnsSnapshot: false,
  },
  identity: {
    ...FullThreadTestCapabilities.identity,
    nativeItemIds: "weak",
    nativeRequestIds: "none",
  },
} satisfies OrchestrationV2ProviderCapabilities;

export const PortableThreadTestCapabilities = {
  ...FullThreadTestCapabilities,
  sessions: {
    ...FullThreadTestCapabilities.sessions,
    supportsMultipleProviderThreadsPerSession: false,
    supportsModelSwitchInSession: false,
    supportsRuntimeModeSwitchInSession: false,
  },
  threads: {
    ...FullThreadTestCapabilities.threads,
    canReadThreadSnapshot: false,
    canForkThread: false,
    canForkFromTurn: false,
    canForkFromSubagentThread: false,
  },
  turns: {
    ...FullThreadTestCapabilities.turns,
    exposesNativeTurnId: false,
    supportsActiveSteering: false,
  },
  streaming: {
    ...FullThreadTestCapabilities.streaming,
    streamsPlanText: false,
  },
  tools: {
    ...FullThreadTestCapabilities.tools,
    supportsMcpTools: false,
    supportsDynamicToolCallbacks: false,
  },
  approvals: {
    ...FullThreadTestCapabilities.approvals,
    supportsApplyPatchApproval: false,
    approvalsHaveNativeRequestIds: false,
    approvalsCanOriginateFromSubagents: false,
  },
  planning: {
    ...FullThreadTestCapabilities.planning,
    emitsProposedPlan: false,
    planDeltasHaveItemIds: false,
  },
  subagents: {
    ...FullThreadTestCapabilities.subagents,
    supportsSubagents: false,
    exposesSubagentThreadIds: false,
    emitsSubagentLifecycle: false,
    canWaitForSubagents: false,
    canCloseSubagents: false,
    canForkSubagentThread: false,
  },
  context: {
    ...FullThreadTestCapabilities.context,
    acceptsSystemContext: false,
    acceptsDeveloperContext: false,
  },
  checkpointing: {
    ...FullThreadTestCapabilities.checkpointing,
    providerCanReadConversationSnapshot: false,
  },
  identity: {
    ...FullThreadTestCapabilities.identity,
    nativeTurnIds: "weak",
    nativeItemIds: "weak",
    nativeRequestIds: "weak",
  },
  runtimePolicy: {
    ...FullThreadTestCapabilities.runtimePolicy,
    enforcement: "client-boundary",
  },
} satisfies OrchestrationV2ProviderCapabilities;

export const NativeSnapshotTestCapabilities = {
  ...FullThreadTestCapabilities,
  sessions: {
    ...FullThreadTestCapabilities.sessions,
    supportsMultipleProviderThreadsPerSession: false,
    supportsRuntimeModeSwitchInSession: false,
  },
  threads: {
    ...FullThreadTestCapabilities.threads,
    canForkThread: false,
    canForkFromTurn: false,
    canForkFromSubagentThread: false,
  },
  turns: {
    ...FullThreadTestCapabilities.turns,
    exposesNativeTurnId: false,
    supportsActiveSteering: false,
  },
  streaming: {
    ...FullThreadTestCapabilities.streaming,
    streamsPlanText: false,
  },
  tools: {
    ...FullThreadTestCapabilities.tools,
    supportsDynamicToolCallbacks: false,
  },
  approvals: {
    ...FullThreadTestCapabilities.approvals,
    supportsApplyPatchApproval: false,
    approvalsHaveNativeRequestIds: false,
    approvalsCanOriginateFromSubagents: false,
  },
  planning: {
    ...FullThreadTestCapabilities.planning,
    emitsProposedPlan: false,
    planDeltasHaveItemIds: false,
  },
  subagents: {
    ...FullThreadTestCapabilities.subagents,
    canWaitForSubagents: false,
    canCloseSubagents: false,
    canForkSubagentThread: false,
  },
  context: {
    ...FullThreadTestCapabilities.context,
    acceptsSystemContext: false,
    acceptsDeveloperContext: false,
  },
  identity: {
    ...FullThreadTestCapabilities.identity,
    nativeTurnIds: "weak",
    nativeItemIds: "weak",
    nativeRequestIds: "weak",
  },
  runtimePolicy: {
    ...FullThreadTestCapabilities.runtimePolicy,
    enforcement: "client-boundary",
  },
} satisfies OrchestrationV2ProviderCapabilities;
