import { Path, Svg } from "react-native-svg";
import { View } from "react-native";
import { providerInstanceInitials } from "@t3tools/client-runtime/state/provider-instance-display";
import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { AppText as Text } from "./AppText";
type ProviderIconProps = {
  readonly provider: string | null | undefined;
  readonly iconUrl?: string | null | undefined;
  readonly size?: number;
};
export function ProviderIcon(props: ProviderIconProps) {
  const { themeAppearance } = useAppearancePreferences();
  const isDarkMode = themeAppearance === "dark";
  const size = props.size ?? 16;
  const mono = isDarkMode ? "#e5e5e5" : "#171717";

  if (props.provider === "pi") {
    const foreground = isDarkMode ? "#F5F5F5" : "#0F0F0F";
    return (
      <Svg width={size} height={size} viewBox="165.29 165.29 469.43 469.43" fill="none">
        <Path
          fill={foreground}
          fillRule="evenodd"
          d="M165.29 165.29H517.36V400H400V517.36H282.65V634.72H165.29ZM282.65 282.65V400H400V282.65Z"
        />
        <Path fill={foreground} d="M517.36 400H634.72V634.72H517.36Z" />
      </Svg>
    );
  }

  return (
    <Text style={{ fontSize: size, color: mono }}>
      {providerInstanceInitials(props.provider ?? "?")}
    </Text>
  );
}

/**
 * `ProviderIcon` plus the web sidebar's account badge: an accent-color
 * initials bubble in the bottom-right corner, drawn when `showBadge` is set
 * (accent color present, or several instances share this driver). The glyph
 * dims to 60% opacity while the badge stays fully saturated, matching
 * `apps/web/src/components/chat/ProviderInstanceIcon.tsx`.
 */
export function ProviderInstanceIcon(props: {
  readonly iconUrl?: string | null;
  readonly provider: string | null | undefined;
  readonly size?: number;
  readonly displayName: string;
  readonly accentColor?: string;
  readonly showBadge?: boolean;
  readonly surfaceColor: string;
}) {
  return (
    <View style={{ position: "relative" }}>
      <View style={{ opacity: 0.6 }}>
        <ProviderIcon iconUrl={props.iconUrl} provider={props.provider} size={props.size} />
      </View>
      {props.showBadge ? (
        <View
          className={props.accentColor ? undefined : "bg-card"}
          style={{
            position: "absolute",
            right: -3,
            bottom: -3,
            height: 12,
            minWidth: 12,
            paddingHorizontal: 2,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: props.surfaceColor,
            backgroundColor: props.accentColor,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            className={props.accentColor ? undefined : "text-foreground-muted"}
            style={{
              fontSize: 7,
              fontWeight: "600",
              lineHeight: 9,
              color: props.accentColor ? "#ffffff" : undefined,
            }}
          >
            {providerInstanceInitials(props.displayName)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
