import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { INLINE_VISUALIZATION_MAX_BYTES, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import * as ProjectFaviconResolver from "../project/ProjectFaviconResolver.ts";
import * as T3ProjectFileLoader from "../project/T3ProjectFileLoader.ts";
import * as NativeAppIconResolver from "./NativeAppIconResolver.ts";
import { issueAssetUrl, resolveAsset, ASSET_ROUTE_PREFIX } from "./AssetAccess.ts";
import * as InlineVisualization from "./InlineVisualization.ts";

const testLayer = Layer.mergeAll(
  InlineVisualization.layer,
  ServerSecretStore.layer,
  WorkspacePaths.layer,
  ProjectFaviconResolver.layer.pipe(
    Layer.provide(WorkspacePaths.layer),
    Layer.provide(T3ProjectFileLoader.layer),
  ),
  NativeAppIconResolver.layer,
).pipe(
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-visualization-" })),
  Layer.provideMerge(NodeServices.layer),
);
const threadId = ThreadId.make("thread:visualization");
const source =
  '<div><input type="range"><output>42</output></div><script>document.querySelector("input").oninput=event=>document.querySelector("output").textContent=event.target.value;</script>';

describe("InlineVisualization", () => {
  it.effect(
    "snapshots a host file and serves the saved bytes through a signed attachment URL after the source is deleted",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const config = yield* ServerConfig.ServerConfig;
        const visualizations = yield* InlineVisualization.InlineVisualization;
        const sourcePath = path.join(config.stateDir, "chart.html");
        yield* fs.writeFileString(sourcePath, source);
        const created = yield* visualizations.create({
          title: "Chart",
          source: { path: sourcePath },
          threadId,
        });
        expect(created.markdown).toContain(created.visualization.attachmentId);
        expect(created.markdown).not.toContain(sourcePath);
        yield* fs.remove(sourcePath);
        const issued = yield* issueAssetUrl({
          resource: {
            _tag: "attachment",
            attachmentId: created.visualization.attachmentId,
            mimeType: "text/html",
            disposition: "inline",
          },
        });
        const [token, relativePath] = issued.relativeUrl
          .slice(ASSET_ROUTE_PREFIX.length + 1)
          .split("/");
        const asset = yield* resolveAsset(token ?? "", relativePath ?? "");
        expect(asset?.kind).toBe("file");
        if (asset?.kind !== "file") return;
        expect(asset.mimeType).toBe("text/html");
        expect(yield* fs.readFileString(asset.path)).toBe(source);
      }).pipe(Effect.scoped, Effect.provide(testLayer)),
  );

  it.effect("keeps prior snapshots intact when publishing an update", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const config = yield* ServerConfig.ServerConfig;
      const visualizations = yield* InlineVisualization.InlineVisualization;
      const first = yield* visualizations.create({
        title: "Chart",
        source: { html: source },
        threadId,
      });
      const next = yield* visualizations.create({
        title: "Chart",
        mode: "wide",
        source: { html: "<div>Updated</div>" },
        threadId,
      });
      expect(first.visualization.attachmentId).not.toBe(next.visualization.attachmentId);
      expect(
        yield* fs.readFileString(
          path.join(config.attachmentsDir, `${first.visualization.attachmentId}.html`),
        ),
      ).toBe(source);
      expect(next.visualization.mode).toBe("wide");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("rejects oversized UTF-8 content, empty content and relative paths", () =>
    Effect.gen(function* () {
      const visualizations = yield* InlineVisualization.InlineVisualization;
      for (const invalid of [
        {
          source: { html: "🙂".repeat(INLINE_VISUALIZATION_MAX_BYTES / 4 + 1) },
          reason: "too-large",
        },
        { source: { html: "   " }, reason: "invalid-source" },
        { source: { path: "chart.html" }, reason: "invalid-source" },
      ]) {
        const error = yield* visualizations
          .create({ threadId, title: "Chart", source: invalid.source })
          .pipe(Effect.flip);
        expect(error.reason).toBe(invalid.reason);
      }
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("rejects directories and oversized files before reading them", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const config = yield* ServerConfig.ServerConfig;
      const visualizations = yield* InlineVisualization.InlineVisualization;
      const directory = path.join(config.stateDir, "directory.html");
      yield* fs.makeDirectory(directory);
      expect(
        (yield* visualizations
          .create({ threadId, title: "Chart", source: { path: directory } })
          .pipe(Effect.flip)).reason,
      ).toBe("invalid-source");
      const large = path.join(config.stateDir, "large.html");
      yield* fs.writeFileString(large, "x".repeat(INLINE_VISUALIZATION_MAX_BYTES + 1));
      expect(
        (yield* visualizations
          .create({ threadId, title: "Chart", source: { path: large } })
          .pipe(Effect.flip)).reason,
      ).toBe("too-large");
    }).pipe(Effect.provide(testLayer)),
  );
});
