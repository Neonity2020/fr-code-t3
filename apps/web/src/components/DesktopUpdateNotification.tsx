import { useNavigate } from "@tanstack/react-router";
import { DownloadIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { isElectron } from "../env";
import { useDesktopUpdateState } from "../state/desktopUpdate";
import { toastManager } from "./ui/toast";
import { getDesktopUpdateNotificationKey } from "./desktopUpdateNotification.logic";

const notifiedUpdateKeys = new Set<string>();

/** Prompts once when the desktop updater discovers a new release. */
export function DesktopUpdateNotification() {
  const navigate = useNavigate();
  const state = useDesktopUpdateState();
  const activeToastIdRef = useRef<ReturnType<typeof toastManager.add> | null>(null);
  const notificationKey = getDesktopUpdateNotificationKey(state);

  useEffect(
    () => () => {
      if (activeToastIdRef.current !== null) {
        toastManager.close(activeToastIdRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isElectron || !notificationKey || notifiedUpdateKeys.has(notificationKey)) return;

    notifiedUpdateKeys.add(notificationKey);
    const version = state?.availableVersion?.trim();
    let toastId!: ReturnType<typeof toastManager.add>;
    toastId = toastManager.add({
      type: "info",
      title: "有可用更新",
      description: version ? `FR Code ${version} 已可下载。` : "FR Code 更新已可下载。",
      timeout: 0,
      actionProps: {
        children: "查看更新",
        onClick: () => {
          toastManager.close(toastId);
          void navigate({ to: "/settings/general" });
        },
      },
      data: {
        leadingIcon: <DownloadIcon className="size-4" />,
        actionLayout: "stacked-end",
        secondaryActionProps: {
          children: "稍后",
          onClick: () => toastManager.close(toastId),
        },
        secondaryActionVariant: "ghost",
      },
    });
    activeToastIdRef.current = toastId;
  }, [navigate, notificationKey, state?.availableVersion]);

  return null;
}
