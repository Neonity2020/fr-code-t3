import { useAuth, useClerk } from "@clerk/react";
import { readConnectAuthorizeRequest } from "@t3tools/shared/connectAuth";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildConnectCliClerkAuthorizeUrl,
  connectCliSignInRedirectUrl,
} from "../../cloud/connectCliAuth";
import { isElectron } from "../../env";
import { AuthSurfaceShell } from "../auth/AuthSurfaceShell";
import { resolveClerkSignInProps } from "../clerk/authRedirect";
import { Button } from "../ui/button";

function ConnectCliAuthMessage({
  eyebrow,
  title,
  description,
}: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <>
      {eyebrow ? (
        <p className="text-3xs font-semibold tracking-widest text-primary uppercase">{eyebrow}</p>
      ) : null}
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </>
  );
}

const invalidLinkMessage = {
  eyebrow: "Authorization request",
  title: "此连接链接不完整",
  description: "链接缺少授权请求。请在终端重新运行 `t3 connect`，并打开新输出的网址。",
} as const;

/**
 * /connect: the URL the CLI prints for the loopback flow. Waits for a Clerk
 * session, then forwards the CLI's PKCE request to Clerk's authorize endpoint
 * with the loopback redirect URI so the code returns straight to the waiting
 * CLI. Headless hosts use Clerk's device authorization page instead.
 */
export function ConnectCliAuthorizeSurface() {
  const [request] = useState(() => readConnectAuthorizeRequest(new URL(window.location.href)));
  const clerk = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const signInOpened = useRef(false);
  const redirecting = useRef(false);

  const openSignIn = useCallback(() => {
    if (!request) {
      return;
    }
    clerk.openSignIn(
      resolveClerkSignInProps(
        connectCliSignInRedirectUrl(request, window.location.href),
        isElectron,
      ),
    );
  }, [clerk, request]);

  useEffect(() => {
    if (!request || !isLoaded || redirecting.current) {
      return;
    }
    if (!isSignedIn) {
      if (!signInOpened.current) {
        signInOpened.current = true;
        openSignIn();
      }
      return;
    }
    const authorizeUrl = buildConnectCliClerkAuthorizeUrl(request);
    if (!authorizeUrl) {
      return;
    }
    redirecting.current = true;
    window.location.assign(authorizeUrl);
  }, [isLoaded, isSignedIn, openSignIn, request]);

  if (!request) {
    return (
      <AuthSurfaceShell>
        <ConnectCliAuthMessage {...invalidLinkMessage} />
      </AuthSurfaceShell>
    );
  }

  return (
    <AuthSurfaceShell>
      <ConnectCliAuthMessage
        eyebrow="Browser authorization"
        title="正在连接您的终端"
        description={
          isSignedIn ? "正在跳转以为 CLI 授权 T3 Connect…" : "请登录以继续为 CLI 授权 T3 Connect。"
        }
      />
      {isLoaded && !isSignedIn ? (
        <div className="mt-6">
          <Button type="button" onClick={openSignIn}>
            登录
          </Button>
        </div>
      ) : null}
    </AuthSurfaceShell>
  );
}
