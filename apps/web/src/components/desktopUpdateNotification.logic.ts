import type { DesktopUpdateState } from "@t3tools/contracts";

/** A release should prompt once per renderer session, even after later polling. */
export function getDesktopUpdateNotificationKey(state: DesktopUpdateState | null): string | null {
  if (state?.status !== "available") return null;

  const version = state.availableVersion?.trim();
  return version ? `${state.channel}:${version}` : null;
}
