"use client";

import type { DesktopPreviewColorScheme } from "@t3tools/contracts";
import { Minus, MoreVertical, Plus as PlusIcon, RotateCcw } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuGroup,
  MenuGroupLabel,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

const COLOR_SCHEME_OPTIONS: ReadonlyArray<{
  value: DesktopPreviewColorScheme;
  label: string;
}> = [
  { value: "system", label: "系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

/**
 * What the menu's items do for the active tab. Desktop tabs run them through
 * the desktop bridge; server tabs, whether streamed or rendered natively by
 * the desktop app, run them through the environment server.
 */
export interface PreviewMoreMenuActions {
  readonly hardReload: () => void;
  readonly setColorScheme: (colorScheme: DesktopPreviewColorScheme) => void;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly resetZoom: () => void;
  readonly clearCookies: () => void;
  readonly clearCache: () => void;
  /** Absent where there is no inspector to open, such as a streamed server tab. */
  readonly openDevTools?: () => void;
  /** Absent where the tab cannot get its own window. */
  readonly toggleNativePictureInPicture?: () => void;
}

interface Props {
  /** False until the tab can take these actions, such as before its page attaches. */
  enabled: boolean;
  actions: PreviewMoreMenuActions;
  /** Current zoom factor as a number (1.0 = 100%). */
  zoomFactor: number;
  /** Emulated `prefers-color-scheme` for the page. */
  colorScheme: DesktopPreviewColorScheme;
  /** Fixed viewport modes expose the device toolbar and resize rails. */
  deviceToolbarVisible: boolean;
  /** Switches between fill-panel mode and a fixed responsive viewport. */
  onToggleDeviceToolbar: () => void;
  /** Whether the separate native always-on-top preview window is open. */
  nativePictureInPicture: boolean;
  /** Profile display name, shown so the menu says which data is being cleared. */
  profileName: string | undefined;
}

const MenuTriggerButton = () => (
  <Tooltip>
    <TooltipTrigger
      render={
        <MenuTrigger
          render={<Button variant="ghost" size="icon-xs" type="button" aria-label="预览菜单" />}
        />
      }
    >
      <MoreVertical />
    </TooltipTrigger>
    <TooltipPopup>更多</TooltipPopup>
  </Tooltip>
);

/** Three-dot menu in the chrome row; the same items for every kind of tab. */
export function PreviewMoreMenu({
  enabled,
  actions,
  zoomFactor,
  colorScheme,
  deviceToolbarVisible,
  onToggleDeviceToolbar,
  nativePictureInPicture,
  profileName,
}: Props) {
  const zoomLabel = `${Math.round(zoomFactor * 100)}%`;
  const disabled = !enabled;
  return (
    <Menu>
      <MenuTriggerButton />
      <MenuPopup align="end" sideOffset={6}>
        <MenuItem onClick={actions.hardReload} disabled={disabled}>
          强制刷新
        </MenuItem>
        {actions.openDevTools ? (
          <MenuItem onClick={actions.openDevTools} disabled={disabled}>
            打开开发者工具
          </MenuItem>
        ) : null}
        {actions.toggleNativePictureInPicture ? (
          <MenuItem onClick={actions.toggleNativePictureInPicture} disabled={disabled}>
            {nativePictureInPicture ? "关闭独立预览窗口" : "打开独立预览窗口"}
          </MenuItem>
        ) : null}
        <MenuItem onClick={onToggleDeviceToolbar} disabled={disabled}>
          {deviceToolbarVisible ? "隐藏设备工具栏" : "显示设备工具栏"}
        </MenuItem>
        <MenuSub>
          <MenuSubTrigger disabled={disabled}>外观</MenuSubTrigger>
          <MenuSubPopup>
            <MenuRadioGroup
              value={colorScheme}
              onValueChange={(value) => actions.setColorScheme(value as DesktopPreviewColorScheme)}
            >
              {COLOR_SCHEME_OPTIONS.map((option) => (
                <MenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>
        <MenuSeparator />
        {/*
          Zoom row: label + inline control cluster. `closeOnClick=false`
          keeps the menu open while the user clicks the +/− buttons.
        */}
        <MenuItem
          closeOnClick={false}
          onClick={(event: React.MouseEvent) => event.preventDefault()}
          className="justify-between"
          disabled={disabled}
        >
          <span>缩放</span>
          <span className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              type="button"
              onClick={actions.zoomOut}
              aria-label="缩小"
              disabled={disabled}
            >
              <Minus />
            </Button>
            <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">
              {zoomLabel}
            </span>
            <Button
              variant="outline"
              size="icon-xs"
              type="button"
              onClick={actions.zoomIn}
              aria-label="放大"
              disabled={disabled}
            >
              <PlusIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              type="button"
              onClick={actions.resetZoom}
              aria-label="重置缩放"
              disabled={disabled}
            >
              <RotateCcw />
            </Button>
          </span>
        </MenuItem>
        <MenuSeparator />
        {/*
          Grouped so the heading has a `MenuGroup` ancestor — `MenuGroupLabel`
          reads its context and throws without one. The heading also answers
          which profile the tab is in, which is otherwise invisible: it is fixed
          at open and nothing else in the chrome shows it.
        */}
        <MenuGroup>
          {profileName ? (
            // Truncation needs a block box: `text-overflow` on an inline child
            // never applies and a long name would push the popup past its width.
            <MenuGroupLabel className="max-w-64">
              <span className="block truncate">配置： {profileName}</span>
            </MenuGroupLabel>
          ) : null}
          <MenuItem onClick={actions.clearCookies}>清除 Cookie</MenuItem>
          <MenuItem onClick={actions.clearCache}>清除缓存</MenuItem>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
