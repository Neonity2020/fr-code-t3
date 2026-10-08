import { useState } from "react";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button, InlineButton } from "../ui/button";
import { useT3ConnectAccountPage } from "./T3ConnectAccountPages";

/**
 * Confirms removing a T3 Connect environment from this device. Removal here
 * leaves the account registration (and its host space) in place, so the dialog
 * says so and links to the account page where it can be deregistered.
 */
export function RemoveT3ConnectEnvironmentDialog({
  environmentLabel,
  onCancel,
  onConfirm,
}: {
  /** The environment awaiting confirmation; null keeps the dialog closed. */
  readonly environmentLabel: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const accountPage = useT3ConnectAccountPage();
  // Keep the label through the close animation.
  const [shownLabel, setShownLabel] = useState(environmentLabel);
  if (environmentLabel !== null && environmentLabel !== shownLabel) setShownLabel(environmentLabel);
  const openAccountPage = accountPage.open;

  return (
    <>
      <AlertDialog
        open={environmentLabel !== null}
        onOpenChange={(open) => {
          if (!open) onCancel();
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>移除 {shownLabel} 从此设备移除？</AlertDialogTitle>
            <AlertDialogDescription>
              这会清除此设备上的配对、凭据和会话缓存。
            </AlertDialogDescription>
            <AlertDialogDescription>
              它仍会保留在您的 T3 Connect 账号中并占用主机名额。请前往{" "}
              {openAccountPage ? (
                <InlineButton
                  onClick={() => {
                    onCancel();
                    openAccountPage();
                  }}
                >
                  T3 Connect 设置
                </InlineButton>
              ) : (
                "T3 Connect 设置"
              )}{" "}
              注销以释放名额。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>取消</AlertDialogClose>
            <Button variant="destructive" onClick={onConfirm}>
              从此设备移除
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      {accountPage.portals}
    </>
  );
}
