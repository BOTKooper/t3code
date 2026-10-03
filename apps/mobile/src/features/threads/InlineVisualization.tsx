import {
  inlineVisualizationDocument,
  inlineVisualizationHeight,
  inlineVisualizationMobileDocument,
  inlineVisualizationResource,
  inlineVisualizationTheme,
  readInlineVisualization,
} from "@t3tools/client-runtime/inline-visualizations";
import type { EnvironmentId, InlineVisualization as Visualization } from "@t3tools/contracts";
import { memo, useEffect, useId, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { WebView } from "react-native-webview";

import { AppText } from "../../components/AppText";
import { useUniwindTheme } from "../../lib/useUniwindTheme";
import type { MobileThemeVariable } from "../../lib/mobileTheme";
import { useAssetUrlState, useRefreshAssetUrl } from "../../state/assets";

const THEME_KEYS: Readonly<Record<string, MobileThemeVariable>> = {
  background: "--color-screen",
  foreground: "--color-foreground",
  card: "--color-card",
  "card-foreground": "--color-foreground",
  popover: "--color-card",
  "popover-foreground": "--color-foreground",
  primary: "--color-primary",
  "primary-foreground": "--color-primary-foreground",
  secondary: "--color-secondary",
  "secondary-foreground": "--color-secondary-foreground",
  muted: "--color-subtle",
  "muted-foreground": "--color-foreground-muted",
  accent: "--color-subtle-strong",
  "accent-foreground": "--color-foreground",
  destructive: "--color-danger",
  border: "--color-border",
  input: "--color-border",
  ring: "--color-focus",
  orange: "--color-warning-foreground",
  red: "--color-danger-foreground",
};

export const InlineVisualization = memo(function InlineVisualization(props: {
  readonly environmentId: EnvironmentId;
  readonly visualization: Visualization;
}) {
  const resource = useMemo(
    () => inlineVisualizationResource(props.visualization),
    [props.visualization],
  );
  const asset = useAssetUrlState(props.environmentId, resource);
  const refresh = useRefreshAssetUrl(props.environmentId, resource);
  const palette = useUniwindTheme();
  const channel = useId();
  const [height, setHeight] = useState(240);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const url = asset._tag === "Success" ? asset.url : null;
  const source = useMemo(() => {
    if (html === null) return null;
    const theme = inlineVisualizationTheme((name) => {
      const key = THEME_KEYS[name];
      return key ? palette[key] : "";
    });
    return {
      html: inlineVisualizationMobileDocument(
        inlineVisualizationDocument(html, channel, theme),
        channel,
      ),
    };
  }, [html, channel, palette]);

  useEffect(() => {
    if (url === null) return;
    const controller = new AbortController();
    void readInlineVisualization(url, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setHtml(value);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [url, retry]);

  return (
    <View className="my-3 w-full">
      <AppText className="mb-1 text-xs text-foreground-muted">{props.visualization.title}</AppText>
      {failed || asset._tag === "Failure" ? (
        <View className="flex-row items-center gap-2">
          <AppText className="text-sm text-foreground-muted">Visualization unavailable.</AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setFailed(false);
              void refresh()
                .then(() => setRetry((value) => value + 1))
                .catch(() => setFailed(true));
            }}
            className="p-2"
          >
            <AppText className="text-sm text-primary">Retry</AppText>
          </Pressable>
        </View>
      ) : source ? (
        <WebView
          source={source}
          originWhitelist={["about:*"]}
          javaScriptEnabled
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          onShouldStartLoadWithRequest={(request) =>
            request.url === "about:blank" || request.url === "about:srcdoc"
          }
          onMessage={(event) => {
            try {
              const next = inlineVisualizationHeight(JSON.parse(event.nativeEvent.data), channel);
              if (next !== null) setHeight(next);
            } catch {
              /* Ignore messages outside the resize contract. */
            }
          }}
          onError={() => setFailed(true)}
          style={{ height, backgroundColor: "transparent" }}
        />
      ) : (
        <AppText className="text-sm text-foreground-muted">Loading visualization...</AppText>
      )}
    </View>
  );
});
