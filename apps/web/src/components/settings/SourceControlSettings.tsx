import { RefreshIcon } from "~/components/ui/refresh-icon";
import { ChevronDownIcon } from "lucide-react";
import * as Duration from "effect/Duration";
import * as Option from "effect/Option";
import { useEffect, useState, type ReactNode } from "react";
import type {
  BackgroundActivitySettings,
  SourceControlProviderKind,
  SourceControlDiscoveryResult,
  SourceControlProviderAuth,
  SourceControlProviderDiscoveryItem,
  VcsDriverKind,
  VcsDiscoveryItem,
} from "@t3tools/contracts";
import {
  getBackgroundActivityBaseProfile,
  getBackgroundActivityPresetSettings,
  resolveServerBackgroundActivitySettings,
} from "@t3tools/shared/backgroundActivitySettings";

import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";
import { useSettingsScope } from "./SettingsScopeContext";
import { ProjectDefaultsSettings } from "./ProjectDefaultsSettings";
import { cn } from "../../lib/utils";
import { useEnvironmentQuery } from "../../state/query";
import { sourceControlEnvironment } from "../../state/sourceControl";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Collapsible, CollapsibleContent } from "../ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { Skeleton } from "../ui/skeleton";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

import {
  AzureDevOpsIcon,
  BitbucketIcon,
  GitHubIcon,
  GitIcon,
  GitLabIcon,
  ForgejoIcon,
  JujutsuIcon,
  type Icon,
} from "../Icons";
import { BitbucketCredentialsSettings } from "./BitbucketCredentialsSettings";
import { GitHubAccountSettings } from "./GitHubAccountSettings";
import { GitHubTokenSettings } from "./GitHubTokenSettings";
import { RedactedSensitiveText } from "./RedactedSensitiveText";
import { SourceControlWritingSettingsSection } from "./SourceControlWritingSettings";
import {
  PolicyTooltip,
  SettingResetButton,
  SettingsPageContainer,
  SettingsSearchTarget,
  SettingsSection,
  useSettingsSearchTargetId,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { PullRequestGlyph } from "~/components/pullRequest/pullRequestIcons";

const EMPTY_DISCOVERY_RESULT: SourceControlDiscoveryResult = {
  versionControlSystems: [],
  sourceControlProviders: [],
};

const SOURCE_CONTROL_PROVIDER_ICONS: Partial<Record<SourceControlProviderKind, Icon>> = {
  github: GitHubIcon,
  gitlab: GitLabIcon,
  forgejo: ForgejoIcon,
  "azure-devops": AzureDevOpsIcon,
  bitbucket: BitbucketIcon,
};

const VCS_ICONS: Partial<Record<VcsDriverKind, Icon>> = {
  git: GitIcon,
  jj: JujutsuIcon,
};

const SOURCE_CONTROL_SKELETON_ROWS = ["primary", "secondary"] as const;
const GIT_FETCH_INTERVAL_STEP_SECONDS = 5;
type BackgroundActivityOverridePatch = Partial<{
  [K in keyof BackgroundActivitySettings["overrides"]]:
    | BackgroundActivitySettings["overrides"][K]
    | undefined;
}>;

function durationToSeconds(duration: Duration.Duration): number {
  return Math.round(Duration.toMillis(duration) / 1_000);
}

function normalizeFetchIntervalSeconds(value: number | null): number {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function backgroundActivityOverrideSettings(
  current: BackgroundActivitySettings,
  overrides: BackgroundActivityOverridePatch,
) {
  const nextOverrides: BackgroundActivityOverridePatch = {
    ...current.overrides,
    ...overrides,
  };
  for (const [key, value] of Object.entries(nextOverrides)) {
    if (value === undefined) {
      delete nextOverrides[key as keyof typeof nextOverrides];
    }
  }
  return {
    backgroundActivity: {
      schemaVersion: 1 as const,
      profile: "custom" as const,
      baseProfile: getBackgroundActivityBaseProfile(current),
      overrides: nextOverrides as BackgroundActivitySettings["overrides"],
    },
  };
}

function optionLabel(value: Option.Option<string>): string | null {
  return Option.getOrNull(value);
}

function isProviderDiscoveryItem(
  item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem,
): item is SourceControlProviderDiscoveryItem {
  return "auth" in item;
}

function isVcsNotReady(item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem): boolean {
  return !isProviderDiscoveryItem(item) && !item.implemented;
}

function authPresentation(auth: SourceControlProviderAuth): {
  readonly label: string;
  readonly badge: "warning" | null;
} {
  if (auth.status === "authenticated") {
    return { label: "已认证", badge: null };
  }
  if (auth.status === "unauthenticated") {
    return { label: "未验证身份", badge: "warning" };
  }
  return { label: "状态未知", badge: null };
}

function RedactedAccount(props: { readonly account: string | null }) {
  return (
    <RedactedSensitiveText
      value={props.account}
      ariaLabel="切换源代码管理账号可见性"
      revealTooltip="Click to reveal account"
      hideTooltip="Click to hide account"
    />
  );
}

function itemStatusDot(item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem): string {
  if (isVcsNotReady(item)) return "bg-muted-foreground/35";
  if (item.status !== "available") return "bg-warning";
  if (isProviderDiscoveryItem(item) && item.auth.status !== "authenticated") return "bg-warning";
  return "bg-success";
}

function SourceControlItemMark({
  item,
}: {
  readonly item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem;
}) {
  const dotClassName = itemStatusDot(item);
  const Icon = isProviderDiscoveryItem(item)
    ? SOURCE_CONTROL_PROVIDER_ICONS[item.kind]
    : VCS_ICONS[item.kind];

  if (!Icon) {
    return <span className={cn("size-2 shrink-0 rounded-full", dotClassName)} aria-hidden />;
  }

  return (
    <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
      <Icon className="size-4.5 text-foreground/80" aria-hidden />
      <span
        className={cn(
          "pointer-events-none absolute -left-0.5 -top-0.5 size-2 rounded-full ring-2 ring-background",
          dotClassName,
        )}
        aria-hidden
      />
    </span>
  );
}

function itemSummary({
  item,
  auth,
  authAccount,
}: {
  readonly item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem;
  readonly auth: SourceControlProviderAuth | null;
  readonly authAccount: string | null;
}) {
  if (isVcsNotReady(item)) {
    return <span>即将支持 {item.label} 。</span>;
  }

  if (item.status !== "available") {
    return <span>此服务器不支持： {item.installHint}</span>;
  }

  if (auth) {
    if (auth.status === "authenticated") {
      // The server names the account its requests use, Settings choice included, and
      // says when an environment token overrides it.
      const authDetail = optionLabel(auth.detail);
      return (
        <>
          <span>已认证</span>
          {authAccount ? (
            <>
              <span aria-hidden>为</span>
              <RedactedAccount account={authAccount} />
            </>
          ) : null}
          {authDetail ? <span>· {authDetail}</span> : null}
        </>
      );
    }

    // API integrations have no CLI to sign in with; an unverified saved credential falls
    // through to the "could not verify" detail instead of repeating the setup hint.
    if (!item.executable && auth.status === "unauthenticated") {
      return <span>可用。 {item.installHint}</span>;
    }

    // Signed in, but every login is turned off here: the fix is the switch below, not the CLI.
    if (auth.status === "unauthenticated" && auth.accounts?.some((entry) => entry.authenticated)) {
      return <span>{optionLabel(auth.detail) ?? `所有 ${item.label} 主机均已关闭。`}</span>;
    }

    if (auth.status === "unauthenticated") {
      return (
        <span>
          {item.label} 尚未在此服务器认证。请使用{" "}
          <code className="rounded bg-muted px-1 py-px text-2xs">{item.executable}</code>{" "}
          工具在服务器主机上登录或配置凭据，以启用更改请求功能。
        </span>
      );
    }
    const authDetail = optionLabel(auth.detail);
    return (
      <span>
        无法验证 {item.label}. {authDetail ?? item.installHint}
      </span>
    );
  }

  return <span>可用</span>;
}

function DiscoveryItemRow({
  item,
  children,
}: {
  readonly item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem;
  readonly children?: ReactNode;
}) {
  const version = optionLabel(item.version);
  const enabled = isProviderDiscoveryItem(item)
    ? item.status === "available" && item.auth.status === "authenticated"
    : item.status === "available" && item.implemented;
  const auth = isProviderDiscoveryItem(item) ? item.auth : null;
  const authStatus = auth ? authPresentation(auth) : null;
  const authAccount = auth ? optionLabel(auth.account) : null;
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDetails = children !== undefined;
  const searchTargetId = useSettingsSearchTargetId();

  useEffect(() => {
    if (
      (item.kind === "git" && searchTargetId === searchableSetting("git-fetch-interval").id) ||
      (item.kind === "bitbucket" &&
        searchTargetId === searchableSetting("bitbucket-credentials").id) ||
      (item.kind === "github" && searchTargetId === searchableSetting("github-accounts").id)
    ) {
      setIsExpanded(true);
    }
  }, [item.kind, searchTargetId]);

  return (
    <div
      className={cn(
        "first:rounded-t-xl last:rounded-b-xl transition-colors hover:bg-muted/20",
        isVcsNotReady(item) && "opacity-80",
      )}
    >
      <div className="px-3 py-3 sm:px-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <SourceControlItemMark item={item} />
              <span className="truncate text-sm font-medium text-foreground">{item.label}</span>
              {version ? <code className="text-xs text-muted-foreground">{version}</code> : null}
              {isVcsNotReady(item) ? (
                <Badge variant="warning" size="sm">
                  即将推出
                </Badge>
              ) : null}
              {authStatus?.badge ? (
                <Badge variant={authStatus.badge} size="sm">
                  {authStatus.label}
                </Badge>
              ) : null}
            </div>
            <p className="flex min-w-0 flex-wrap items-center gap-x-1 text-xs leading-normal text-muted-foreground/80">
              {itemSummary({ item, auth, authAccount })}
            </p>
          </div>
          <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">
            {hasDetails ? (
              <Button
                size="icon-xs"
                variant="ghost-muted"
                onClick={() => setIsExpanded((open) => !open)}
                aria-expanded={isExpanded}
                aria-label={`切换 ${item.label} 详情`}
              >
                <ChevronDownIcon
                  className={cn("size-3.5 transition-transform", isExpanded && "rotate-180")}
                />
              </Button>
            ) : null}
            {!isVcsNotReady(item) ? (
              <Switch checked={enabled} disabled aria-label={`${item.label} 可用性`} />
            ) : null}
          </div>
        </div>
      </div>

      {hasDetails ? (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleContent>
            <div className="px-3 pb-4 pt-1 sm:px-4">{children}</div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}

function GitFetchIntervalSettings() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const resolvedBackgroundActivity = resolveServerBackgroundActivitySettings(settings);
  const automaticGitFetchIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.automaticGitFetchInterval,
  );
  const defaultAutomaticGitFetchIntervalSeconds = durationToSeconds(
    getBackgroundActivityPresetSettings(
      getBackgroundActivityBaseProfile(settings.backgroundActivity),
    ).automaticGitFetchInterval,
  );
  const canResetFetchInterval =
    automaticGitFetchIntervalSeconds !== defaultAutomaticGitFetchIntervalSeconds;
  const setting = searchableSetting("git-fetch-interval");

  return (
    <SettingsSearchTarget id={setting.id} className="grid gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-1">
            <span className="text-xs font-medium text-foreground">{setting.title}</span>
            <PolicyTooltip>
              此处配置的间隔仅用于 Git。计时到期时，共享后台活动策略仍决定是否允许刷新
              Git。自定义间隔在常规设置中显示为“高级”。
            </PolicyTooltip>
            <span
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center transition-opacity",
                canResetFetchInterval ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              aria-hidden={!canResetFetchInterval}
            >
              {canResetFetchInterval ? (
                <SettingResetButton
                  label={"获取间隔"}
                  onClick={() =>
                    updateSettings(
                      backgroundActivityOverrideSettings(settings.backgroundActivity, {
                        automaticGitFetchInterval: undefined,
                      }),
                    )
                  }
                />
              ) : null}
            </span>
          </div>
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
            在后台刷新远程分支。设为 0 可避免自动弹出 Git 提示。
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NumberField
            value={automaticGitFetchIntervalSeconds}
            min={0}
            step={GIT_FETCH_INTERVAL_STEP_SECONDS}
            size="sm"
            className="w-32"
            onValueChange={(value) =>
              updateSettings(
                backgroundActivityOverrideSettings(settings.backgroundActivity, {
                  automaticGitFetchInterval: Duration.seconds(normalizeFetchIntervalSeconds(value)),
                }),
              )
            }
          >
            <NumberFieldGroup>
              <NumberFieldDecrement aria-label="缩短获取间隔" />
              <NumberFieldInput aria-label="自动 Git 获取间隔（秒）" />
              <NumberFieldIncrement aria-label="延长获取间隔" />
            </NumberFieldGroup>
          </NumberField>
          <span className="text-xs text-muted-foreground">秒</span>
        </div>
      </div>
    </SettingsSearchTarget>
  );
}

function SourceControlSectionSkeleton({
  title,
  headerAction,
}: {
  readonly title: string;
  readonly headerAction?: ReactNode;
}) {
  return (
    <SettingsSection title={title} headerAction={headerAction}>
      {SOURCE_CONTROL_SKELETON_ROWS.map((row) => (
        <div key={row} className="first:rounded-t-xl last:rounded-b-xl px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                  <Skeleton className="size-4.5" />
                  <Skeleton
                    shape="pill"
                    className="pointer-events-none absolute -left-0.5 -top-0.5 size-2"
                    aria-hidden
                  />
                </span>
                <Skeleton shape="pill" className="h-4 w-28" />
                <Skeleton shape="pill" className="h-5 w-14" />
              </div>
              <Skeleton shape="pill" className="h-3 w-full max-w-xs" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Skeleton className="size-7" />
              <Skeleton shape="pill" className="h-5 w-9" />
            </div>
          </div>
        </div>
      ))}
    </SettingsSection>
  );
}

function EmptySourceControlDiscovery({
  error,
  isPending,
  onScan,
}: {
  readonly error: string | null;
  readonly isPending: boolean;
  readonly onScan: () => void;
}) {
  const hasError = error !== null;

  return (
    <SettingsSection id={searchableSetting("source-control").id} title="服务器环境">
      <Empty>
        <EmptyMedia variant="icon">
          <PullRequestGlyph.pullRequest />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{hasError ? "无法扫描服务器环境" : "尚未检测到内容"}</EmptyTitle>
          <EmptyDescription>
            {hasError
              ? error
              : "在服务器安装 Git，添加工作区所需的可选托管集成或凭据，然后重新扫描。"}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={onScan} disabled={isPending}>
            <RefreshIcon size="sm" refreshing={isPending} />
            扫描
          </Button>
        </EmptyContent>
      </Empty>
    </SettingsSection>
  );
}

export function SourceControlSettingsPanel() {
  const { scope, environment, connectedEnvironments } = useSettingsScope();
  // Discovery scans one machine's tools, so it shows the representative
  // environment (named in the section title when several are selected);
  // the settings rows above it fan out like everywhere else.
  const environmentId =
    environment?.connection.phase === "connected" ? environment.environmentId : null;
  const aggregate = scope.environmentIds.length !== 1 && connectedEnvironments.length > 1;
  const environmentSuffix = aggregate && environment ? ` · ${environment.label}` : "";
  const discovery = useEnvironmentQuery(
    environmentId === null
      ? null
      : sourceControlEnvironment.discovery({
          environmentId,
          input: {},
        }),
  );
  const result = discovery.data ?? EMPTY_DISCOVERY_RESULT;
  const hasVersionControlSystems = result.versionControlSystems.length > 0;
  const hasDiscoveryItems = hasVersionControlSystems || result.sourceControlProviders.length > 0;
  const isInitialScanPending = discovery.isPending && discovery.data === null;
  const handleScan = () => {
    discovery.refresh();
  };
  const scanButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            onClick={handleScan}
            disabled={discovery.isPending}
            aria-label="重新扫描服务器环境"
          >
            <RefreshIcon refreshing={discovery.isPending} />
          </Button>
        }
      />
      <TooltipPopup side="top">重新扫描 Git 和代码托管集成</TooltipPopup>
    </Tooltip>
  );

  return (
    <SettingsPageContainer>
      <ProjectDefaultsSettings category="source-control" />
      {environmentId === null ? (
        <SettingsSection id={searchableSetting("source-control").id} title="服务器环境">
          <p className="px-4 py-3 text-sm text-muted-foreground">
            连接环境以查看版本控制工具和代码托管集成。
          </p>
        </SettingsSection>
      ) : isInitialScanPending ? (
        <>
          <SourceControlSectionSkeleton
            title={`版本控制${environmentSuffix}`}
            headerAction={scanButton}
          />
          <SourceControlSectionSkeleton title="版本控制提供方" />
        </>
      ) : hasDiscoveryItems ? (
        <>
          {hasVersionControlSystems ? (
            <SettingsSection
              id={searchableSetting("source-control").id}
              title={`版本控制${environmentSuffix}`}
              headerAction={scanButton}
            >
              {result.versionControlSystems.map((item) => (
                <DiscoveryItemRow key={`vcs:${item.kind}`} item={item}>
                  {item.kind === "git" ? <GitFetchIntervalSettings /> : undefined}
                </DiscoveryItemRow>
              ))}
            </SettingsSection>
          ) : null}

          {result.sourceControlProviders.length > 0 ? (
            <SettingsSection
              id={hasVersionControlSystems ? undefined : searchableSetting("source-control").id}
              title={
                hasVersionControlSystems ? "版本控制提供方" : `版本控制提供方${environmentSuffix}`
              }
              headerAction={hasVersionControlSystems ? null : scanButton}
            >
              {result.sourceControlProviders.map((item) => (
                <DiscoveryItemRow key={`provider:${item.kind}`} item={item}>
                  {item.kind === "bitbucket" ? (
                    <SettingsSearchTarget id={searchableSetting("bitbucket-credentials").id}>
                      <BitbucketCredentialsSettings
                        // Drafts belong to one environment; switching must not carry them over.
                        key={environmentId}
                        environmentId={environmentId}
                        onSaved={handleScan}
                      />
                    </SettingsSearchTarget>
                  ) : item.kind === "github" ? (
                    <SettingsSearchTarget id={searchableSetting("github-accounts").id}>
                      <div className="grid gap-6">
                        {/* Shown even without gh: a saved token is how GitHub works without the CLI. */}
                        <GitHubTokenSettings
                          key={`token-${environmentId}`}
                          environmentId={environmentId}
                          onSaved={handleScan}
                        />
                        {item.status === "available" ? (
                          <GitHubAccountSettings
                            key={environmentId}
                            environmentId={environmentId}
                            auth={item.auth}
                            onSaved={handleScan}
                          />
                        ) : null}
                      </div>
                    </SettingsSearchTarget>
                  ) : undefined}
                </DiscoveryItemRow>
              ))}
            </SettingsSection>
          ) : null}
        </>
      ) : (
        <EmptySourceControlDiscovery
          error={discovery.error}
          isPending={discovery.isPending}
          onScan={handleScan}
        />
      )}

      <SourceControlWritingSettingsSection />
    </SettingsPageContainer>
  );
}
