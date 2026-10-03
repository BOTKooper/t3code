import { describe, expect, it } from "vite-plus/test";

import {
  inlineVisualizationHeight,
  inlineVisualizationResource,
  resolveInlineVisualization,
  splitInlineVisualizationMarkdown,
} from "./inlineVisualizations.ts";

const visualization = {
  attachmentId: "thread-00000000-0000-4000-8000-000000000001-html",
  title: "Slider",
};
const reference = `\`\`\`t3-visualization\n${JSON.stringify(visualization)}\n\`\`\``;

describe("inline visualization references", () => {
  it("splits multiple visuals while preserving surrounding markdown and offsets", () => {
    const markdown = `Before\n\n${reference}\n\nBetween\n\n${reference}\n\nAfter`;
    const parts = splitInlineVisualizationMarkdown(markdown);
    expect(parts.map((part) => part.kind)).toEqual([
      "markdown",
      "visualization",
      "markdown",
      "visualization",
      "markdown",
    ]);
    expect(parts[1]).toMatchObject({ visualization, sourceOffset: markdown.indexOf(reference) });
    expect(
      parts
        .filter((part) => part.kind === "markdown")
        .map((part) => part.markdown)
        .join(""),
    ).toBe("Before\n\n\n\nBetween\n\n\n\nAfter");
  });

  it("leaves incomplete streamed fences, invalid references and quoted examples as code", () => {
    for (const markdown of [
      reference.slice(0, -3),
      '```t3-visualization\n{"attachmentId":"../../secrets","title":"Bad"}\n```',
      `\`\`\`\`markdown\n${reference}\n\`\`\`\``,
      reference
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n"),
    ]) {
      expect(splitInlineVisualizationMarkdown(markdown)).toEqual([
        { kind: "markdown", markdown, sourceOffset: 0 },
      ]);
    }
    expect(resolveInlineVisualization("html", JSON.stringify(visualization))).toBeNull();
    expect(resolveInlineVisualization("t3-visualization", "{")).toBeNull();
  });

  it("resolves stable attachment IDs without viewer-side paths or origins", () => {
    expect(inlineVisualizationResource(visualization)).toEqual({
      _tag: "attachment",
      attachmentId: visualization.attachmentId,
      fileName: "Slider.html",
      mimeType: "text/html",
      disposition: "inline",
    });
  });

  it("accepts finite resize messages only for the active frame channel and bounds layout", () => {
    expect(
      inlineVisualizationHeight({ channel: "ours", type: "resize", height: 310.2 }, "ours"),
    ).toBe(311);
    expect(inlineVisualizationHeight({ channel: "ours", type: "resize", height: -3 }, "ours")).toBe(
      96,
    );
    expect(
      inlineVisualizationHeight({ channel: "ours", type: "resize", height: 999999 }, "ours"),
    ).toBe(2400);
    for (const message of [
      null,
      { channel: "other", type: "resize", height: 310 },
      { channel: "ours", type: "command", height: 310 },
      { channel: "ours", type: "resize", height: Infinity },
      { channel: "ours", type: "resize", height: "300" },
    ]) {
      expect(inlineVisualizationHeight(message, "ours")).toBeNull();
    }
  });
});
