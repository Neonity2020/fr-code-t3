import type { EnvironmentId } from "@t3tools/contracts";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button, InlineButton } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const DEFAULT_HOST = "github.com";

/** Where to create a token for a host: GitHub's own page, or the same path on an Enterprise host. */
function newTokenUrl(host: string): string {
  return `https://${host}/settings/personal-access-tokens/new`;
}

/**
 * A GitHub token for one host, kept in the server's secret store. It is used before
 * `GH_TOKEN` and the `gh` login, so it also works on a server without `gh` installed.
 * Write-only: the saved token is never shown, only whether one is set.
 */
export function GitHubTokenSettings({
  environmentId,
  onSaved,
}: {
  readonly environmentId: EnvironmentId;
  readonly onSaved: () => void;
}) {
  const tokens = useEnvironmentSettings(environmentId, (settings) => settings.github.tokens);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "save GitHub token",
  });
  const [host, setHost] = useState(DEFAULT_HOST);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const normalizedHost = host.trim().toLowerCase();
  const isSaved = (tokens[normalizedHost] ?? "").length > 0;
  const savedHosts = Object.entries(tokens)
    .filter(([, value]) => value.length > 0)
    .map(([saved]) => saved);

  const save = async (target: string, token: string) => {
    setSaving(true);
    try {
      const result = await updateSettings({
        environmentId,
        input: { patch: { github: { tokens: { [target]: token } } } },
      });
      if (result._tag === "Success") {
        setDraft("");
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (normalizedHost && draft.trim()) void save(normalizedHost, draft.trim());
      }}
    >
      {/* Locked while saving: a successful save clears the draft, which would drop edits made mid-request. */}
      <fieldset disabled={saving} className="contents">
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          此处保存的令牌优先于{" "}
          <code className="rounded bg-muted px-1 py-px text-2xs">GH_TOKEN</code> 和{" "}
          <code className="rounded bg-muted px-1 py-px text-2xs">gh</code> 登录账号，因此无需 GitHub
          CLI 也可使用 GitHub。请授予拉取请求及仓库内容的读写权限。{" "}
          <InlineButton
            render={
              <a
                href={newTokenUrl(normalizedHost || DEFAULT_HOST)}
                target="_blank"
                rel="noreferrer noopener"
              />
            }
          >
            创建令牌
            <ExternalLinkIcon aria-hidden className="size-3" />
          </InlineButton>
        </p>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor={`github-token-host-${environmentId}`}>主机</Label>
            <Input
              id={`github-token-host-${environmentId}`}
              autoComplete="off"
              size="sm"
              placeholder={DEFAULT_HOST}
              value={host}
              onChange={(event) => setHost(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`github-token-${environmentId}`}>令牌</Label>
            <Input
              id={`github-token-${environmentId}`}
              type="password"
              autoComplete="off"
              size="sm"
              placeholder={isSaved ? "已保存密钥，输入新值可替换" : "未设置"}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {savedHosts.length === 0
              ? "未保存令牌；服务器会使用 GH_TOKEN 或 gh 登录。"
              : `已为 ${savedHosts.join(", ")} 保存。`}
          </p>
          <div className="flex shrink-0 gap-2">
            {isSaved ? (
              <Button
                size="xs"
                variant="outline"
                disabled={saving}
                onClick={() => void save(normalizedHost, "")}
              >
                移除
              </Button>
            ) : null}
            <Button type="submit" size="xs" disabled={!normalizedHost || !draft.trim() || saving}>
              保存
            </Button>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
