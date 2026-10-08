import { parseSemver } from "@t3tools/shared/semver";
import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { SmartphoneIcon } from "lucide-react";
import { useEffect } from "react";

import { APP_VERSION, HOSTED_APP_CHANNEL } from "../branding";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { getLocalStorageItem, setLocalStorageItem } from "../hooks/useLocalStorage";
import { AndroidIcon, AppleIcon } from "./Icons";
import { SettingsRow } from "./settings/settingsLayout";
import { Button } from "./ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "./ui/popover";
import { QRCodeSvg } from "./ui/qr-code";
import { toastManager } from "./ui/toast";

// Orchestrator V2 ships to Nightly first. The App Store and Google Play apps are
// still V1 and cannot connect to a V2 server, so Nightly users need the V2 beta
// app. Delete this file when the store apps move to V2. See #14871.

/** True on Nightly desktop, `npx t3@nightly`, and the hosted Nightly app. */
export const IS_NIGHTLY_BUILD =
  parseSemver(APP_VERSION)?.prerelease[0] === "nightly" || HOSTED_APP_CHANNEL === "nightly";

const IOS_TESTFLIGHT_URL = "https://testflight.apple.com/join/XgaxaRtd";
const ANDROID_BETA_GROUP_URL = "https://groups.google.com/g/t3-code-v2-beta";
const ANDROID_PLAY_TESTING_URL = "https://play.google.com/apps/testing/com.t3tools.t3code";

const ROW_ID = "nightly-mobile-beta";
const NOTICE_DISMISSED_STORAGE_KEY = "t3code:nightly-mobile-beta-notice-dismissed:v1";

// Guards against a second toast from a remount or a Strict Mode effect replay.
let noticeShown = false;

function isNoticeDismissed(): boolean {
  try {
    return getLocalStorageItem(NOTICE_DISMISSED_STORAGE_KEY, Schema.Boolean) === true;
  } catch {
    return false;
  }
}

function dismissNotice() {
  try {
    setLocalStorageItem(NOTICE_DISMISSED_STORAGE_KEY, true, Schema.Boolean);
  } catch {
    // Storage is unavailable. The notice shows again on the next launch.
  }
}

/**
 * One-time Nightly toast that points to the beta mobile app. Any close (the
 * corner button, swipe, Dismiss, or the action) hides it for good on this client.
 */
export function NightlyMobileBetaNotice() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!IS_NIGHTLY_BUILD || noticeShown || isNoticeDismissed()) return;
    noticeShown = true;
    const toastId = toastManager.add({
      title: "每日构建版需要移动端测试版",
      description:
        "每日构建版使用新的编排系统。App Store 和 Google Play 上的 FR Code 版本无法连接。",
      timeout: 0,
      onClose: dismissNotice,
      actionProps: {
        children: "获取测试版应用",
        onClick: () => {
          toastManager.close(toastId);
          void navigate({ to: "/settings/general", hash: ROW_ID });
        },
      },
      data: {
        leadingIcon: <SmartphoneIcon className="size-4" />,
        actionLayout: "stacked-end",
        secondaryActionProps: {
          children: "关闭",
          onClick: () => toastManager.close(toastId),
        },
        secondaryActionVariant: "ghost",
      },
    });
  }, [navigate]);

  return null;
}

/** QR code plus a copy button for one beta link. */
function BetaLinkQr({ url, label }: { url: string; label: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-lg bg-white p-1.5">
        <QRCodeSvg value={url} size={128} level="M" marginSize={1} title={label} />
      </div>
      <Button size="xs" variant="outline" onClick={() => copyToClipboard(url)}>
        {isCopied ? "已复制" : "复制链接"}
      </Button>
    </div>
  );
}

/** Settings → General → About row with the beta app links. Render it only for Nightly. */
export function NightlyMobileBetaRow() {
  return (
    <SettingsRow
      id={ROW_ID}
      title="移动应用"
      description="每日构建版需要移动端测试版。App Store 和 Google Play 上的版本无法连接。"
      control={
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger render={<Button size="sm" variant="outline" />}>
              <AppleIcon />
              iPhone
            </PopoverTrigger>
            <PopoverPopup align="end">
              <div className="flex flex-col gap-3">
                <div className="space-y-1">
                  <PopoverTitle>TestFlight 测试版</PopoverTitle>
                  <p className="text-xs text-muted-foreground">使用 iPhone 相机扫描。</p>
                </div>
                <BetaLinkQr url={IOS_TESTFLIGHT_URL} label="TestFlight 测试版链接" />
              </div>
            </PopoverPopup>
          </Popover>
          <Popover>
            <PopoverTrigger render={<Button size="sm" variant="outline" />}>
              <AndroidIcon />
              Android
            </PopoverTrigger>
            <PopoverPopup align="end">
              <div className="flex flex-col gap-3">
                <div className="space-y-1">
                  <PopoverTitle>Google Play 测试版</PopoverTitle>
                  <p className="max-w-72 text-xs text-muted-foreground">
                    两步操作请使用同一个 Google 账号。加入群组后，第二步可能需要等待一小时才能生效。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-center text-xs font-medium">1. 加入群组</p>
                    <BetaLinkQr url={ANDROID_BETA_GROUP_URL} label="Android 测试群组链接" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-center text-xs font-medium">2. 成为测试用户</p>
                    <BetaLinkQr url={ANDROID_PLAY_TESTING_URL} label="Google Play 测试版链接" />
                  </div>
                </div>
              </div>
            </PopoverPopup>
          </Popover>
        </div>
      }
    />
  );
}
