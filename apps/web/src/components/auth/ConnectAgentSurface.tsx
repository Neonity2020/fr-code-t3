import {
  type AuthMcpApprovalDecision,
  type AuthMcpApprovalDetails,
  AuthMcpApprovalError,
  AuthMcpClientAccess,
  type AuthMcpAuthorizationRequest,
} from "@t3tools/contracts";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { EyeIcon, type LucideIcon } from "lucide-react";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { PrimaryEnvironmentHttpClient } from "~/environments/primary/httpClient";
import { runPrimaryHttp } from "~/lib/runtime";
import { cn } from "~/lib/utils";
import { runtimeModeConfig } from "../chat/runtimeModeConfig";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { RadioGroup } from "../ui/radio-group";
import { Spinner } from "../ui/spinner";
import { AuthSurfaceShell } from "./AuthSurfaceShell";

const accessConfig: Record<
  AuthMcpClientAccess,
  { readonly label: string; readonly description: string; readonly icon: LucideIcon }
> = {
  "read-only": {
    label: "只读",
    description: "读取项目和会话，无法启动、发送消息或更改内容。",
    icon: EyeIcon,
  },
  ...runtimeModeConfig,
};

type Loaded =
  | { readonly status: "loading" }
  | { readonly status: "invalid"; readonly message: string }
  | { readonly status: "ready"; readonly details: AuthMcpApprovalDetails };

const UNREACHABLE = "无法连接此环境，请重试。";
const isApprovalError = Schema.is(AuthMcpApprovalError);

type Answer<A> =
  | { readonly kind: "ok"; readonly value: A }
  | { readonly kind: "redirect"; readonly url: string }
  | { readonly kind: "error"; readonly message: string };

/**
 * Runs an approval call. The server validates the agent's request again on
 * every call and answers what the page asked for, a message to show, or a URL
 * the browser must follow (an approval, a denial, or a protocol error the
 * agent should receive).
 */
function runApproval<A>(
  call: (
    client: Context.Service.Shape<typeof PrimaryEnvironmentHttpClient>,
  ) => Effect.Effect<A | { readonly redirectTo: string }, unknown>,
): Promise<Answer<A>> {
  return runPrimaryHttp(
    PrimaryEnvironmentHttpClient.pipe(
      Effect.flatMap(call),
      Effect.map((value): Answer<A> =>
        typeof value === "object" && value !== null && "redirectTo" in value
          ? { kind: "redirect", url: value.redirectTo }
          : { kind: "ok", value: value as A },
      ),
      Effect.catch((error) =>
        Effect.succeed<Answer<A>>({
          kind: "error",
          message: isApprovalError(error) ? error.message : UNREACHABLE,
        }),
      ),
    ),
  ).catch((): Answer<A> => ({ kind: "error", message: UNREACHABLE }));
}

function readAuthorizationRequest(): AuthMcpAuthorizationRequest {
  return Object.fromEntries(new URL(window.location.href).searchParams);
}

/**
 * /connect-agent: where an outside agent's MCP sign-in lands after the server
 * checks the request. The user picks the most the agent may allow, then
 * approves with a pairing code, or in one click when this browser is already
 * signed in to the environment as an administrator.
 */
/**
 * Whether this browser's session may approve `access` without a pairing code.
 * A session may only grant access whose scopes it holds itself.
 */
function oneClickApproves(details: AuthMcpApprovalDetails, access: AuthMcpClientAccess) {
  return details.csrfToken !== undefined && (details.oneClickAccess ?? []).includes(access);
}

export function ConnectAgentSurface() {
  const [authorization] = useState(readAuthorizationRequest);
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [access, setAccess] = useState<AuthMcpClientAccess>("read-only");
  const [pairingCode, setPairingCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void runApproval((client) => client.mcpOAuth.approval({ payload: authorization })).then(
      (answer) => {
        if (cancelled) return;
        if (answer.kind === "redirect") {
          window.location.replace(answer.url);
          return;
        }
        setLoaded(
          answer.kind === "error"
            ? { status: "invalid", message: answer.message }
            : { status: "ready", details: answer.value },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [authorization]);

  const decide = useCallback(
    async (choice: "approve" | "deny") => {
      if (loaded.status !== "ready") return;
      setPending(choice);
      setErrorMessage("");
      const { csrfToken } = loaded.details;
      const decision: AuthMcpApprovalDecision =
        choice === "deny"
          ? { _tag: "deny" }
          : csrfToken !== undefined && oneClickApproves(loaded.details, access)
            ? { _tag: "browser-session", access, csrfToken }
            : { _tag: "pairing-code", access, code: pairingCode.trim() };
      const answer = await runApproval((client) =>
        client.mcpOAuth.decision({ payload: { authorization, decision } }),
      );
      if (answer.kind === "redirect") {
        window.location.replace(answer.url);
        return;
      }
      setPending(null);
      setErrorMessage(answer.kind === "error" ? answer.message : "无法继续登录。");
    },
    [access, authorization, loaded, pairingCode],
  );

  if (loaded.status === "loading") {
    return (
      <AuthSurfaceShell>
        <ConnectAgentHeading
          title="正在检查登录请求"
          description="请稍候，环境正在验证智能体的请求。"
        />
        <Spinner className="mt-6" size="lg" tone="muted" />
      </AuthSurfaceShell>
    );
  }

  if (loaded.status === "invalid") {
    return (
      <AuthSurfaceShell>
        <ConnectAgentHeading title="无法继续此登录" description={loaded.message} />
        <p className="mt-4 text-sm text-muted-foreground">请关闭此页面，并从智能体重新发起登录。</p>
      </AuthSurfaceShell>
    );
  }

  const { details } = loaded;
  const oneClick = oneClickApproves(details, access);
  const canApprove = pending === null && (oneClick || pairingCode.trim().length > 0);

  return (
    <AuthSurfaceShell>
      <ConnectAgentHeading
        title={`连接 ${details.clientName}`}
        description={
          <>
            此智能体希望使用以下环境中所有项目的会话：{" "}
            <span className="font-medium text-foreground">{details.environmentHost}</span>.
          </>
        }
      />
      <p className="mt-2 text-xs text-muted-foreground">
        名称由智能体指定。授权结果将返回 {details.redirectHost}{" "}
        在打开此页面的计算机上。请仅批准您刚刚发起的登录。
      </p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canApprove) void decide("approve");
        }}
      >
        <div className="space-y-2">
          <span id="connect-agent-access-label" className="text-sm font-medium">
            允许的操作
          </span>
          <RadioGroup
            aria-labelledby="connect-agent-access-label"
            value={access}
            onValueChange={(value) => setAccess(value as AuthMcpClientAccess)}
          >
            {AuthMcpClientAccess.literals.map((option) => (
              <AccessOption key={option} access={option} selected={option === access} />
            ))}
          </RadioGroup>
          <p className="text-xs text-muted-foreground">
            除读取外，还可启动会话、发送消息和停止会话；运行权限不会超过您选择的模式。
          </p>
        </div>

        {oneClick ? null : (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="connect-agent-pairing-code">
              配对码
            </label>
            <Input
              id="connect-agent-pairing-code"
              autoCapitalize="none"
              autoComplete="one-time-code"
              autoCorrect="off"
              disabled={pending !== null}
              nativeInput
              onChange={(event) => setPairingCode(event.currentTarget.value)}
              placeholder="粘贴一次性配对码"
              spellCheck={false}
              value={pairingCode}
            />
            <p className="text-xs text-muted-foreground">
              在“设置 → 连接”中创建，或在此机器上运行 <code>t3 auth pairing create</code> 。
            </p>
          </div>
        )}

        {errorMessage ? (
          <Alert variant="error">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button disabled={!canApprove} type="submit">
            {pending === "approve" ? "正在批准…" : "批准"}
          </Button>
          <Button
            disabled={pending !== null}
            onClick={() => void decide("deny")}
            type="button"
            variant="outline"
          >
            {pending === "deny" ? "正在拒绝…" : "拒绝"}
          </Button>
        </div>
      </form>
    </AuthSurfaceShell>
  );
}

function ConnectAgentHeading({
  title,
  description,
}: {
  readonly title: string;
  readonly description: ReactNode;
}) {
  return (
    <>
      <p className="text-3xs font-semibold tracking-widest text-primary uppercase">智能体登录</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </>
  );
}

function AccessOption({
  access,
  selected,
}: {
  readonly access: AuthMcpClientAccess;
  readonly selected: boolean;
}) {
  const { label, description, icon: Icon } = accessConfig[access];
  return (
    <RadioPrimitive.Root
      value={access}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left outline-none transition-[background-color,border-color,box-shadow]",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        selected
          ? "border-primary bg-background ring-2 ring-primary/25 dark:border-transparent dark:bg-primary/10 dark:ring-1 dark:ring-primary/30"
          : "border-border bg-background hover:bg-muted/50 dark:border-transparent dark:bg-white/[0.035] dark:hover:bg-accent",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          selected ? "text-primary" : "text-muted-foreground",
        )}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </RadioPrimitive.Root>
  );
}
