import {
  inlineVisualizationDocument,
  inlineVisualizationHeight,
  inlineVisualizationResource,
  readInlineVisualization,
  inlineVisualizationTheme,
} from "@t3tools/client-runtime/inline-visualizations";
import type { EnvironmentId, InlineVisualization as Visualization } from "@t3tools/contracts";
import { memo, useEffect, useId, useMemo, useRef, useState } from "react";

import { useAssetUrlRefresh, useAssetUrlState } from "../../assets/assetUrls";
import { useTheme } from "../../hooks/useTheme";
import { Button } from "../ui/button";

export const InlineVisualization = memo(function InlineVisualization(props: {
  readonly environmentId: EnvironmentId | null;
  readonly visualization: Visualization;
}) {
  const resource = useMemo(
    () => inlineVisualizationResource(props.visualization),
    [props.visualization],
  );
  const asset = useAssetUrlState(props.environmentId, resource);
  const refresh = useAssetUrlRefresh(props.environmentId, resource);
  const { resolvedTheme } = useTheme();
  const channel = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(240);
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [visible, setVisible] = useState(false);
  const url = asset._tag === "Success" ? asset.url : null;
  const document = useMemo(
    () =>
      html === null
        ? null
        : inlineVisualizationDocument(
            html,
            channel,
            inlineVisualizationTheme((name) =>
              getComputedStyle(window.document.documentElement)
                .getPropertyValue(`--${name}`)
                .trim(),
            ),
          ),
    [html, channel],
  );

  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!url || !visible) return;
    const controller = new AbortController();
    void readInlineVisualization(url, controller.signal)
      .then((html) => {
        if (!controller.signal.aborted) {
          setHtml(html);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [url, visible, retry]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== frame.current?.contentWindow) return;
      const next = inlineVisualizationHeight(event.data, channel);
      if (next !== null) setHeight(next);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [channel]);

  useEffect(() => {
    const theme = inlineVisualizationTheme((name) =>
      getComputedStyle(window.document.documentElement).getPropertyValue(`--${name}`).trim(),
    );
    frame.current?.contentWindow?.postMessage({ channel, type: "theme", theme }, "*");
  }, [channel, resolvedTheme]);

  const unavailable = asset._tag === "Failure" || failed || props.environmentId === null;
  return (
    <div
      ref={container}
      className="my-3 w-full min-w-0"
      style={{ maxWidth: props.visualization.mode === "wide" ? 1024 : 736 }}
      data-inline-visualization={props.visualization.attachmentId}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{props.visualization.title}</span>
        {document && !unavailable && window.document.fullscreenEnabled ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              void container.current?.requestFullscreen().catch(() => {});
            }}
          >
            Expand
          </Button>
        ) : null}
      </div>
      {unavailable ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          Visualization unavailable.
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              setFailed(false);
              void refresh()
                .then(() => setRetry((value) => value + 1))
                .catch(() => setFailed(true));
            }}
          >
            Retry
          </Button>
        </div>
      ) : document ? (
        <iframe
          ref={frame}
          title={props.visualization.title}
          srcDoc={document}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          className="block w-full border-0"
          style={{ height }}
        />
      ) : (
        <div className="text-sm text-muted-foreground" role="status">
          Loading visualization...
        </div>
      )}
    </div>
  );
});
