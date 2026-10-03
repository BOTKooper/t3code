// @effect-diagnostics globalFetch:off - This browser and WebView loader owns abortable signed asset requests without an Effect runtime.
import {
  INLINE_VISUALIZATION_LANGUAGE,
  INLINE_VISUALIZATION_MAX_BYTES,
  InlineVisualization,
  type AssetResource,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import remarkParse from "remark-parse";
import { unified } from "unified";

const decode = Schema.decodeUnknownOption(InlineVisualization);
const parser = unified().use(remarkParse).freeze();

export function resolveInlineVisualization(
  language: string | undefined,
  code: string,
): InlineVisualization | null {
  if (language !== INLINE_VISUALIZATION_LANGUAGE) return null;
  try {
    return Option.getOrNull(decode(JSON.parse(code)));
  } catch {
    return null;
  }
}

export function inlineVisualizationResource(visualization: InlineVisualization): AssetResource {
  return {
    _tag: "attachment",
    attachmentId: visualization.attachmentId,
    fileName: `${visualization.title}.html`,
    mimeType: "text/html",
    disposition: "inline",
  };
}

export type InlineVisualizationMarkdownSegment =
  | { readonly kind: "markdown"; readonly markdown: string; readonly sourceOffset: number }
  | {
      readonly kind: "visualization";
      readonly visualization: InlineVisualization;
      readonly sourceOffset: number;
    };

/** Native clients host visualizations between Markdown views, preserving the original offsets. */
export function splitInlineVisualizationMarkdown(
  markdown: string,
): ReadonlyArray<InlineVisualizationMarkdownSegment> {
  if (!markdown.includes(INLINE_VISUALIZATION_LANGUAGE))
    return [{ kind: "markdown", markdown, sourceOffset: 0 }];
  const segments: InlineVisualizationMarkdownSegment[] = [];
  let cursor = 0;
  for (const node of parser.parse(markdown).children) {
    if (node.type !== "code") continue;
    const visualization = resolveInlineVisualization(node.lang ?? undefined, node.value);
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (!visualization || start === undefined || end === undefined) continue;
    const source = markdown.slice(start, end);
    const opening = /^ {0,3}(`{3,}|~{3,})/.exec(source)?.[1];
    const closing = source.slice(source.lastIndexOf("\n") + 1).trim();
    // An incomplete streamed fence is still ordinary code.
    if (
      !opening ||
      closing.length < opening.length ||
      [...closing].some((character) => character !== opening[0])
    )
      continue;
    if (start > cursor)
      segments.push({
        kind: "markdown",
        markdown: markdown.slice(cursor, start),
        sourceOffset: cursor,
      });
    segments.push({ kind: "visualization", visualization, sourceOffset: start });
    cursor = end;
  }
  if (cursor < markdown.length || segments.length === 0)
    segments.push({ kind: "markdown", markdown: markdown.slice(cursor), sourceOffset: cursor });
  return segments;
}

export const INLINE_VISUALIZATION_THEME_VARIABLES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "blue",
  "orange",
  "green",
  "red",
  "purple",
  "yellow",
  "viz-series-1",
  "viz-series-2",
  "viz-series-3",
  "viz-series-4",
  "viz-series-5",
  "viz-series-6",
] as const;

export type InlineVisualizationTheme = Readonly<Record<string, string>>;

export function inlineVisualizationTheme(read: (name: string) => string): InlineVisualizationTheme {
  const theme: Record<string, string> = Object.fromEntries(
    INLINE_VISUALIZATION_THEME_VARIABLES.map((name) => [name, read(name)]),
  );
  for (const [index, name] of ["primary", "orange", "green", "purple", "red", "blue"].entries()) {
    theme[`viz-series-${index + 1}`] ||=
      theme[name] || theme.primary || theme.foreground || "currentColor";
  }
  return theme;
}

const CDN_ORIGINS =
  "https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://esm.sh https://unpkg.com https://fonts.googleapis.com https://fonts.gstatic.com https://fonts.bunny.net";
const CSP = `default-src 'none'; script-src 'unsafe-inline' ${CDN_ORIGINS}; style-src 'unsafe-inline' ${CDN_ORIGINS}; img-src data: blob: ${CDN_ORIGINS}; font-src data: ${CDN_ORIGINS}; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/** The same opaque-origin document runs in the web iframe and the native WebView's iframe. */
export function inlineVisualizationDocument(
  html: string,
  channel: string,
  theme: InlineVisualizationTheme,
): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${CSP}">
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--background);color:var(--foreground);font:14px/1.5 system-ui,sans-serif}#t3-visualization-root{padding:12px;display:flow-root;overflow-wrap:anywhere}svg,canvas,img{max-width:100%}button,input,select,textarea{font:inherit;color:inherit}button,.btn{background:var(--secondary);border:1px solid var(--border);border-radius:6px;padding:6px 12px;cursor:pointer}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--ring);outline-offset:2px}.btn-primary{background:var(--primary);color:var(--primary-foreground)}.btn-ghost{background:transparent;border-color:transparent}.form-control,.form-select{background:var(--background);border:1px solid var(--border);border-radius:6px;padding:6px 8px;max-width:100%}.form-range{accent-color:var(--primary);width:100%}.form-label{display:block}.viz-row,.viz-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.viz-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:12px}.card{background:var(--card);color:var(--card-foreground);border:1px solid var(--border);border-radius:8px;padding:12px}.text-small{font-size:12px}.text-muted{color:var(--muted-foreground)}.tabular-nums{font-variant-numeric:tabular-nums}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}h1,h2,h3{font-size:inherit;font-weight:500;margin:0 0 12px}.table{width:100%;border-collapse:collapse}.table td,.table th{text-align:start;padding:8px;border-bottom:1px solid var(--border)}.table-responsive{overflow:auto}.text-end{text-align:end}.text-center{text-align:center}[hidden]{display:none!important}
</style><script>
(()=>{const channel=${scriptJson(channel)};const applyTheme=(theme)=>{for(const name of ${scriptJson(INLINE_VISUALIZATION_THEME_VARIABLES)}){if(typeof theme[name]==='string')document.documentElement.style.setProperty('--'+name,theme[name]);}};applyTheme(${scriptJson(theme)});window.addEventListener('message',(event)=>{if(event.source===parent&&event.data?.channel===channel&&event.data.type==='theme')applyTheme(event.data.theme);});document.addEventListener('DOMContentLoaded',()=>{const root=document.getElementById('t3-visualization-root');let queued=false,lastHeight=0;const measure=()=>{queued=false;const height=Math.ceil(root.getBoundingClientRect().height);if(height!==lastHeight){lastHeight=height;parent.postMessage({channel,type:'resize',height},'*');}};new ResizeObserver(()=>{if(!queued){queued=true;requestAnimationFrame(measure);}}).observe(root);measure();document.addEventListener('click',(event)=>{if(event.target.closest('a'))event.preventDefault();});});})();
</script></head><body><div id="t3-visualization-root">${html}</div></body></html>`;
}

/** A narrow message contract: visualizations can resize their frame, never invoke app commands. */
export function inlineVisualizationHeight(message: unknown, channel: string): number | null {
  if (
    typeof message !== "object" ||
    message === null ||
    !("channel" in message) ||
    message.channel !== channel ||
    !("type" in message) ||
    message.type !== "resize" ||
    !("height" in message) ||
    typeof message.height !== "number" ||
    !Number.isFinite(message.height)
  )
    return null;
  return Math.max(96, Math.min(2400, Math.ceil(message.height)));
}

export async function readInlineVisualization(url: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal, credentials: "omit" });
  if (!response.ok) throw new Error("The visualization could not be loaded.");
  const html = await response.text();
  if (new TextEncoder().encode(html).byteLength > INLINE_VISUALIZATION_MAX_BYTES)
    throw new Error("The visualization is too large.");
  return html;
}

/** Keep untrusted HTML inside an iframe on native clients too, away from the WebView bridge. */
export function inlineVisualizationMobileDocument(document: string, channel: string): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;background:transparent}iframe{display:block;border:0;width:100%;height:240px}</style></head><body><script>(()=>{const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.srcdoc=${scriptJson(document)};document.body.appendChild(frame);window.addEventListener('message',(event)=>{const data=event.data;if(event.source!==frame.contentWindow||data?.channel!==${scriptJson(channel)}||data.type!=='resize'||typeof data.height!=='number'||!Number.isFinite(data.height))return;const height=Math.max(96,Math.min(2400,Math.ceil(data.height)));frame.style.height=height+'px';window.ReactNativeWebView.postMessage(JSON.stringify({channel:data.channel,type:'resize',height}));});})();</script></body></html>`;
}
