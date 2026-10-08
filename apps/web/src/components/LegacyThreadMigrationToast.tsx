import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef } from "react";

import { primaryServerLegacyThreadMigrationAtom } from "../state/server";
import { toastManager } from "./ui/toast";

type MigrationToastId = ReturnType<typeof toastManager.add>;

export function LegacyThreadMigrationToast() {
  const migration = useAtomValue(primaryServerLegacyThreadMigrationAtom);
  const toastIdRef = useRef<MigrationToastId | null>(null);

  useEffect(() => {
    if (migration?.status === "running") {
      if (toastIdRef.current !== null) {
        return;
      }
      toastIdRef.current = toastManager.add({
        type: "loading",
        title: "正在恢复您的会话…",
        description: `正在从旧版本迁移 ${migration.totalThreadCount.toLocaleString()} 个${"个会话"}，期间您可继续工作。`,
        timeout: 0,
      });
      return;
    }

    if (toastIdRef.current !== null) {
      toastManager.close(toastIdRef.current);
      toastIdRef.current = null;
    }
  }, [migration]);

  useEffect(
    () => () => {
      if (toastIdRef.current !== null) {
        toastManager.close(toastIdRef.current);
      }
    },
    [],
  );

  return null;
}
