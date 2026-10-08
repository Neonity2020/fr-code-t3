import type { EnvironmentId, SourceControlProviderAuth } from "@t3tools/contracts";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { groupGitHubAccounts, nextGitHubHosts } from "./GitHubAccountSettings.logic";
import { redactedPlaceholder } from "./RedactedSensitiveText";

/** Sentinel select value for "follow gh's active login"; logins never contain spaces. */
const ACTIVE_ACCOUNT = "active gh account";

/**
 * A login, blurred like RedactedSensitiveText until the panel reveals it. Plain text, not a
 * button, so it can sit inside select options; one panel toggle reveals every login.
 */
function RedactedLogin(props: {
  readonly account: string;
  readonly revealed: boolean;
  /** Distinguishes hidden logins from each other for a screen reader, e.g. "Account 2". */
  readonly label?: string;
}) {
  return props.revealed ? (
    <span className="min-w-0 truncate font-mono text-2xs">{props.account}</span>
  ) : (
    <span className="min-w-0 truncate font-mono text-2xs">
      <span className="select-none blur-xs" aria-hidden>
        {redactedPlaceholder(props.account)}
      </span>
      <span className="sr-only">{props.label ?? "已隐藏的账户"}</span>
    </span>
  );
}

/**
 * Per-host GitHub choices for one environment: turn a host off, or pin which of the
 * logins `gh` holds is used instead of its active one. Changes save immediately.
 */
export function GitHubAccountSettings({
  environmentId,
  auth,
  onSaved,
}: {
  readonly environmentId: EnvironmentId;
  readonly auth: SourceControlProviderAuth;
  readonly onSaved: () => void;
}) {
  const hosts = useEnvironmentSettings(environmentId, (settings) => settings.github.hosts);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "save GitHub account settings",
  });
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const groups = groupGitHubAccounts(auth.accounts ?? []);

  const save = async (
    host: string,
    change: { readonly enabled?: boolean; readonly account?: string | null },
  ) => {
    setSaving(true);
    try {
      const result = await updateSettings({
        environmentId,
        input: { patch: { github: { hosts: nextGitHubHosts(hosts, host, change) } } },
      });
      if (result._tag === "Success") onSaved();
    } finally {
      setSaving(false);
    }
  };

  if (groups.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        请使用以下命令登录：{" "}
        <code className="rounded bg-muted px-1 py-px text-2xs">gh auth login</code>{" "}
        在服务器主机上运行，然后重新扫描以在此选择账号。
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          选择每个 GitHub 主机使用的{" "}
          <code className="rounded bg-muted px-1 py-px text-2xs">gh</code> 登录账号，或禁用该主机。
        </p>
        <Button
          size="icon-xs"
          variant="ghost-muted"
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? "隐藏 GitHub 账户" : "显示 GitHub 账户"}
          aria-pressed={revealed}
        >
          {revealed ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
      </div>
      {groups.map((group) => {
        const choice = hosts[group.host];
        const enabled = choice?.enabled ?? true;
        const stalePin =
          choice?.account !== undefined && !group.selectable.includes(choice.account);
        const pinned = choice?.account !== undefined && !stalePin ? choice.account : ACTIVE_ACCOUNT;
        return (
          <div key={group.host} className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <span className="text-xs font-medium text-foreground">{group.host}</span>
                {group.selectable.length === 1 && group.selectable[0] !== undefined ? (
                  <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                    <span>已登录为</span>
                    <RedactedLogin revealed={revealed} account={group.selectable[0]} />
                  </p>
                ) : null}
              </div>
              <Switch
                checked={enabled}
                disabled={saving}
                aria-label={`在 ${group.host} 上使用 GitHub`}
                onCheckedChange={(checked) => void save(group.host, { enabled: checked })}
              />
            </div>
            {group.selectable.length > 1 ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">账号</span>
                <div className="w-64 max-w-full">
                  <Select
                    value={pinned}
                    disabled={saving || !enabled}
                    onValueChange={(value) => {
                      if (typeof value !== "string") return;
                      void save(group.host, {
                        account: value === ACTIVE_ACCOUNT ? null : value,
                      });
                    }}
                  >
                    <SelectTrigger size="sm" aria-label={`${group.host} 的 GitHub 账户`}>
                      <SelectValue>
                        {(value: string) =>
                          value === ACTIVE_ACCOUNT ? (
                            <span className="flex min-w-0 items-center gap-1">
                              当前 gh 账号
                              {group.activeAccount ? (
                                <>
                                  (
                                  <RedactedLogin
                                    revealed={revealed}
                                    account={group.activeAccount}
                                  />
                                  )
                                </>
                              ) : null}
                            </span>
                          ) : (
                            <RedactedLogin revealed={revealed} account={value} />
                          )
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup align="end" alignItemWithTrigger={false}>
                      <SelectItem value={ACTIVE_ACCOUNT}>
                        <span className="flex min-w-0 items-center gap-1">
                          当前 gh 账号
                          {group.activeAccount ? (
                            <>
                              (<RedactedLogin revealed={revealed} account={group.activeAccount} />)
                            </>
                          ) : null}
                        </span>
                      </SelectItem>
                      {group.selectable.map((account, index) => (
                        <SelectItem key={account} value={account}>
                          <RedactedLogin
                            revealed={revealed}
                            account={account}
                            label={`账户 ${index + 1}`}
                          />
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>
              </div>
            ) : null}
            {stalePin ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-warning">所选账号已退出登录，将使用当前 gh 账号。</p>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void save(group.host, { account: null })}
                >
                  使用当前登录
                </Button>
              </div>
            ) : null}
            {group.broken.map((entry) => (
              <p
                key={entry.account}
                className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground/70"
              >
                <RedactedLogin revealed={revealed} account={entry.account} />
                <span>不可用： {entry.error ?? "gh 报告此登录无效。"}</span>
              </p>
            ))}
            {group.environmentVariable ? (
              <p className="text-xs text-warning">
                {group.environmentVariable} 已在服务器上设置，清除前会覆盖此处选择的账号。
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
