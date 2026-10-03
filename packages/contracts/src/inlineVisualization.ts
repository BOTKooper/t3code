import * as Schema from "effect/Schema";

export const INLINE_VISUALIZATION_MAX_BYTES = 1024 * 1024;
export const INLINE_VISUALIZATION_LANGUAGE = "t3-visualization";

/** A durable attachment reference, resolved on the conversation's environment. */
export const InlineVisualization = Schema.Struct({
  attachmentId: Schema.String.check(
    Schema.isMaxLength(256),
    Schema.isPattern(
      /^[a-z0-9_-]+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-html$/i,
    ),
  ),
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  mode: Schema.optionalKey(Schema.Literals(["inline", "wide"])),
});
export type InlineVisualization = typeof InlineVisualization.Type;

export const InlineVisualizationCreateInput = Schema.Struct({
  title: InlineVisualization.fields.title,
  mode: InlineVisualization.fields.mode,
  source: Schema.Union([
    Schema.Struct({
      html: Schema.String.check(
        Schema.isMinLength(1),
        Schema.isMaxLength(INLINE_VISUALIZATION_MAX_BYTES),
      ),
    }),
    Schema.Struct({ path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096)) }),
  ]),
});
export type InlineVisualizationCreateInput = typeof InlineVisualizationCreateInput.Type;

export const InlineVisualizationCreateResult = Schema.Struct({
  visualization: InlineVisualization,
  markdown: Schema.String,
});
export type InlineVisualizationCreateResult = typeof InlineVisualizationCreateResult.Type;
