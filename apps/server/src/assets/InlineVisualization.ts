import {
  INLINE_VISUALIZATION_LANGUAGE,
  INLINE_VISUALIZATION_MAX_BYTES,
  InlineVisualization as InlineVisualizationReference,
  type InlineVisualizationCreateInput,
  type InlineVisualizationCreateResult,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { createAttachmentId } from "../attachmentStore.ts";
import * as ServerConfig from "../config.ts";
import { openMediaFile, readMediaFileHeader } from "./MediaFile.ts";

export class InlineVisualizationError extends Schema.TaggedError<InlineVisualizationError>()(
  "InlineVisualizationError",
  {
    reason: Schema.Literals(["invalid-source", "too-large", "io"]),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    switch (this.reason) {
      case "invalid-source":
        return "Provide a nonempty HTML fragment or an absolute path to an HTML file.";
      case "too-large":
        return "Visualizations must be at most 1 MiB.";
      case "io":
        return "The visualization could not be saved.";
    }
  }
}

export class InlineVisualization extends Context.Service<
  InlineVisualization,
  {
    readonly create: (
      input: InlineVisualizationCreateInput & { readonly threadId: ThreadId },
    ) => Effect.Effect<InlineVisualizationCreateResult, InlineVisualizationError>;
  }
>()("t3/assets/InlineVisualization") {}

const isInlineVisualizationError = Schema.is(InlineVisualizationError);
const encodeReference = Schema.encodeSync(Schema.fromJsonString(InlineVisualizationReference));

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;

  const create = Effect.fn("InlineVisualization.create")(
    function* (input: InlineVisualizationCreateInput & { readonly threadId: ThreadId }) {
      let html: string;
      if ("html" in input.source) {
        html = input.source.html;
      } else {
        if (!path.isAbsolute(input.source.path) || !/\.html?$/i.test(input.source.path)) {
          return yield* new InlineVisualizationError({ reason: "invalid-source" });
        }
        const canonicalPath = yield* fs.realPath(input.source.path);
        const file = yield* openMediaFile(canonicalPath);
        if (file === null) return yield* new InlineVisualizationError({ reason: "invalid-source" });
        if (file.info.size > BigInt(INLINE_VISUALIZATION_MAX_BYTES)) {
          return yield* new InlineVisualizationError({ reason: "too-large" });
        }
        // Bound the read even if the source grows after opening it.
        const bytes = yield* readMediaFileHeader(
          canonicalPath,
          file,
          INLINE_VISUALIZATION_MAX_BYTES + 1,
        );
        if (bytes.byteLength > INLINE_VISUALIZATION_MAX_BYTES) {
          return yield* new InlineVisualizationError({ reason: "too-large" });
        }
        html = new TextDecoder().decode(bytes);
      }
      if (!html.trim()) return yield* new InlineVisualizationError({ reason: "invalid-source" });
      const bytes = new TextEncoder().encode(html);
      if (bytes.byteLength > INLINE_VISUALIZATION_MAX_BYTES) {
        return yield* new InlineVisualizationError({ reason: "too-large" });
      }
      const attachmentId = createAttachmentId(input.threadId, ".html");
      if (attachmentId === null)
        return yield* new InlineVisualizationError({ reason: "invalid-source" });
      yield* fs.makeDirectory(config.attachmentsDir, { recursive: true });
      yield* fs.writeFile(path.join(config.attachmentsDir, `${attachmentId}.html`), bytes);
      const visualization = {
        attachmentId,
        title: input.title,
        ...(input.mode ? { mode: input.mode } : {}),
      };
      return {
        visualization,
        markdown: `\`\`\`${INLINE_VISUALIZATION_LANGUAGE}\n${encodeReference(visualization)}\n\`\`\``,
      };
    },
    Effect.scoped,
    Effect.mapError((cause) =>
      isInlineVisualizationError(cause)
        ? cause
        : new InlineVisualizationError({ reason: "io", cause }),
    ),
  );

  return InlineVisualization.of({ create });
});

export const layer = Layer.effect(InlineVisualization, make);
