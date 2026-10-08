import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { Globe, History, RadioTower } from "lucide-react";

import type { BrowserHistoryEntry } from "~/browserHistoryStore";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
import { DiscoveryList } from "../ui/discovery-list";

import { PreviewLocalServerCard } from "./PreviewLocalServerCard";
import { PreviewRecentUrlCard } from "./PreviewRecentUrlCard";
import { useDiscoveredLocalServers } from "./useDiscoveredLocalServers";

interface Props {
  threadRef: ScopedThreadRef;
  environmentId: EnvironmentId;
  configuredUrls?: ReadonlyArray<string> | undefined;
  recentEntries: ReadonlyArray<BrowserHistoryEntry>;
  onRemoveRecent: (url: string) => void;
  onOpenUrl: (url: string) => void;
}

export function PreviewEmptyState({
  threadRef,
  environmentId,
  configuredUrls,
  recentEntries,
  onRemoveRecent,
  onOpenUrl,
}: Props) {
  const servers = useDiscoveredLocalServers({
    environmentId,
    configuredUrls,
  });
  const recents = recentEntries.filter((entry) => URL.canParse(entry.url)).slice(0, 8);

  if (servers.length === 0 && recents.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <Globe className="size-4.5 text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle>暂无预览</EmptyTitle>
        <EmptyDescription>
          在上方输入网址或运行开发脚本。可通过浏览器访问的本地服务器会自动显示在这里。
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-y-auto px-5 py-8">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        {recents.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <History className="size-4 shrink-0" />
              <h2 className="font-medium">最近使用</h2>
            </div>
            <DiscoveryList>
              {recents.map((entry) => (
                <PreviewRecentUrlCard
                  key={entry.url}
                  threadRef={threadRef}
                  entry={entry}
                  onOpen={() => onOpenUrl(entry.url)}
                  onRemove={() => onRemoveRecent(entry.url)}
                />
              ))}
            </DiscoveryList>
          </div>
        ) : null}
        {servers.length > 0 ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RadioTower className="size-4 shrink-0" />
              <h2 className="font-medium">本地服务器</h2>
            </div>
            <DiscoveryList>
              {servers.map((server) => (
                <PreviewLocalServerCard
                  key={`${server.host}:${server.port}`}
                  threadRef={threadRef}
                  server={server}
                  onOpen={() => onOpenUrl(server.requestedUrl)}
                />
              ))}
            </DiscoveryList>
            <p className="px-1 text-xs text-muted-foreground">
              选择正在运行的本地服务器，在此浏览器标签页中打开。
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
