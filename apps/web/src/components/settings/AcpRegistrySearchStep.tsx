import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  AcpRegistryPrepareResult,
  AcpRegistrySearchAgent,
  EnvironmentId,
  ProviderInstanceConfig,
} from "@t3tools/contracts";
import { ExternalLinkIcon, SearchIcon } from "lucide-react";
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";

import { serverEnvironment } from "../../state/server";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { isConfiguredAcpRegistryAgent } from "./AddProviderInstanceDialog.logic";
import { ProviderDriverKind } from "@t3tools/contracts";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "无法准备 ACP。";
}

interface AcpRegistrySearchStepProps {
  readonly environmentId: EnvironmentId;
  readonly providerInstances: Readonly<Record<string, ProviderInstanceConfig>>;
  readonly onPrepared: (agent: AcpRegistrySearchAgent) => void;
  readonly onManualConfiguration: () => void;
  readonly onLocalConfiguration?: () => void;
  readonly onLoadingChange?: (loading: boolean) => void;
  readonly onPreparingChange?: (preparing: boolean) => void;
}

function applyAcpRegistryPrepareResult(
  agent: AcpRegistrySearchAgent,
  prepared: AcpRegistryPrepareResult,
): AcpRegistrySearchAgent {
  return {
    ...agent,
    id: prepared.agentId,
    version: prepared.version,
    distribution: prepared.distribution,
  };
}

export function AcpRegistrySearchStep({
  environmentId,
  providerInstances,
  onPrepared,
  onManualConfiguration,
  onLocalConfiguration,
  onLoadingChange,
  onPreparingChange,
}: AcpRegistrySearchStepProps) {
  const [query, setQuery] = useState("");
  // An empty registry query is the compact compatible catalog. Start there so
  // entering this step is useful before the user knows what to search for.
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const prepareGeneration = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = useEnvironmentQuery(
    serverEnvironment.searchAcpRegistry({
      environmentId,
      input: { query: submittedQuery },
    }),
  );
  const prepareAgent = useAtomCommand(serverEnvironment.prepareAcpRegistryAgent, {
    reportFailure: false,
  });

  useEffect(
    () => () => {
      prepareGeneration.current += 1;
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
      onPreparingChange?.(false);
    },
    [onPreparingChange],
  );

  const submitSearch = (nextQuery: string) => {
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    const trimmed = nextQuery.trim();
    setQuery(trimmed);
    setPrepareError(null);
    if (trimmed === submittedQuery) {
      search.refresh();
    } else {
      setSubmittedQuery(trimmed);
    }
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitSearch(query);
  };

  const handlePrepare = async (agent: AcpRegistrySearchAgent) => {
    const generation = ++prepareGeneration.current;
    setPrepareError(null);
    setPreparingId(agent.id);
    onPreparingChange?.(true);
    const result = await prepareAgent({ environmentId, input: { agentId: agent.id } });
    if (prepareGeneration.current !== generation) return;
    setPreparingId(null);
    onPreparingChange?.(false);
    if (result._tag === "Success") {
      onPrepared(applyAcpRegistryPrepareResult(agent, result.value));
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      setPrepareError(errorMessage(squashAtomCommandFailure(result)));
    }
  };

  const results = search.data?.agents ?? null;
  const isInitialSearch = search.isPending && results === null;
  const isRefreshing = search.isPending && results !== null;
  const resultCount = results?.length ?? 0;

  useLayoutEffect(() => {
    onLoadingChange?.(search.isPending);
    return () => onLoadingChange?.(false);
  }, [onLoadingChange, search.isPending]);

  return (
    <section className="grid gap-3" aria-labelledby="acp-registry-search-heading">
      <h3 className="sr-only" id="acp-registry-search-heading">
        选择智能体
      </h3>

      <form className="flex flex-wrap items-center gap-2" onSubmit={handleSearch}>
        <InputGroup className="min-w-40 flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="搜索 ACP 注册表"
            disabled={preparingId !== null}
            onChange={(event) => {
              const nextQuery = event.currentTarget.value;
              setQuery(nextQuery);
              setPrepareError(null);
              if (searchTimer.current !== null) clearTimeout(searchTimer.current);
              searchTimer.current = setTimeout(() => {
                searchTimer.current = null;
                setSubmittedQuery(nextQuery.trim());
              }, 300);
            }}
            placeholder="搜索智能体…"
            size="sm"
            type="search"
            value={query}
          />
        </InputGroup>
        <Button
          disabled={preparingId !== null}
          onClick={onManualConfiguration}
          size="sm"
          type="button"
          variant="ghost-muted"
        >
          手动输入
        </Button>
        {onLocalConfiguration ? (
          <Button
            disabled={preparingId !== null}
            onClick={onLocalConfiguration}
            size="sm"
            type="button"
            variant="outline"
          >
            本地 ACP 命令
          </Button>
        ) : null}
      </form>

      <div className="sr-only" role="status">
        {isInitialSearch
          ? "正在搜索 ACP 注册表。"
          : isRefreshing
            ? "正在刷新 ACP 注册表结果。"
            : results
              ? `找到 ${resultCount} 个兼容的${"个智能体"}。`
              : ""}
      </div>

      {search.error || prepareError ? (
        <Alert variant="error" role="status" aria-live="polite">
          <AlertDescription>{prepareError ?? search.error}</AlertDescription>
        </Alert>
      ) : null}

      {isInitialSearch ? (
        <div className="flex min-h-20 items-center justify-center text-sm text-muted-foreground">
          正在搜索注册表…
        </div>
      ) : null}

      {results ? (
        results.length === 0 ? (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-2xl border border-dashed px-4 text-center">
            <p className="text-sm font-medium">未找到兼容的智能体</p>
            <p className="mt-1 text-xs text-muted-foreground">请尝试扩大搜索范围。</p>
          </div>
        ) : (
          <ScrollArea scrollFade className="max-h-64">
            {/* The overlay scrollbar takes no layout space, so the rows
                reserve its lane explicitly. */}
            <div className="pr-2.5">
              {results.map((agent) => {
                const alreadyAdded = isConfiguredAcpRegistryAgent(providerInstances, agent.id);
                const isPreparing = preparingId === agent.id;
                const progressLabel = agent.distribution === "binary" ? "正在下载" : "正在准备";
                return (
                  <article className="min-w-0 py-2.5" key={agent.id}>
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <ProviderInstanceIcon
                          driverKind={ProviderDriverKind.make("acpRegistry")}
                          displayName={agent.name}
                          acpRegistryAgentId={agent.id}
                          acpRegistryIconUrl={agent.icon ?? undefined}
                          iconClassName="size-6 rounded-md text-muted-foreground"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <h4 className="min-w-0 truncate text-sm font-medium text-foreground">
                              {agent.name}
                            </h4>
                          </div>
                          {agent.description ? (
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {agent.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {agent.website || agent.repository ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  size="icon-xs"
                                  variant="ghost-muted"
                                  aria-label={`关于 ${agent.name}`}
                                  render={
                                    <a
                                      href={agent.website || agent.repository || undefined}
                                      target="_blank"
                                      rel="noreferrer"
                                    />
                                  }
                                >
                                  <ExternalLinkIcon />
                                </Button>
                              }
                            />
                            <TooltipPopup>关于 {agent.name}</TooltipPopup>
                          </Tooltip>
                        ) : null}
                        <Button
                          aria-label={`${alreadyAdded ? "已添加" : isPreparing ? progressLabel : "添加"} ${agent.name}`}
                          disabled={alreadyAdded || preparingId !== null}
                          onClick={() => void handlePrepare(agent)}
                          size="xs"
                          variant={isPreparing ? "secondary" : "outline"}
                        >
                          {alreadyAdded ? "已添加" : isPreparing ? progressLabel : "添加"}
                        </Button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </ScrollArea>
        )
      ) : null}
    </section>
  );
}
