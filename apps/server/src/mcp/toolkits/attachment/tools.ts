import { McpAttachmentInput } from "./input.ts";
import {
  AttachmentCreateUploadUrlInput,
  AttachmentCreateUploadUrlResult,
  AttachmentDeleteInput,
  InlineVisualizationCreateInput,
  InlineVisualizationCreateResult,
  MessageId,
  RunId,
  ThreadId,
  OrchestrationV2RunStatus,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";
import * as ServerSecretStore from "../../../auth/ServerSecretStore.ts";
import * as ServerConfig from "../../../config.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as InlineVisualization from "../../../assets/InlineVisualization.ts";

const shared = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    McpInvocationContext.McpInvocationContext,
    ThreadManagementService.ThreadManagementService,
    ServerConfig.ServerConfig,
    ServerSecretStore.ServerSecretStore,
    FileSystem.FileSystem,
    Crypto.Crypto,
  ],
};
const AttachmentUploadTool = Tool.make("t3_attachment_prepare_upload", {
  ...shared,
  description:
    "Create the app's signed upload URL. POST the exact bytes to relativeUrl on this MCP server's HTTP origin, then pass the attachment metadata and returned ID to t3_thread_send_attachments. Upload is separate from sending; provider attachment support is decided by its adapter.",
  parameters: Schema.Struct({ upload: AttachmentCreateUploadUrlInput }),
  success: AttachmentCreateUploadUrlResult,
}).annotate(Tool.Destructive, true);
const AttachmentDiscardTool = Tool.make("t3_attachment_discard", {
  ...shared,
  description:
    "Discard a pending upload. Already-delivered thread attachments are never deleted by this operation.",
  parameters: AttachmentDeleteInput,
  success: Schema.Struct({}),
}).annotate(Tool.Destructive, true);
const AttachmentSendTool = Tool.make("t3_thread_send_attachments", {
  ...shared,
  description:
    "Send uploaded attachments to this thread or another thread in the calling project. Each call is a new message, without a retry key. Acceptance does not mean the provider can consume the attachment or has finished the turn. The target cannot have broader permission modes than the caller; failures retain claimed files when dispatch outcome is uncertain.",
  parameters: Schema.Struct({
    threadId: Schema.optional(ThreadId),
    message: Schema.optional(Schema.String.check(Schema.isMaxLength(120000))),
    attachments: Schema.Array(McpAttachmentInput).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(8),
    ),
  }),
  success: Schema.Struct({
    threadId: ThreadId,
    messageId: MessageId,
    runId: RunId,
    status: OrchestrationV2RunStatus,
  }),
})
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, true);
const VisualizationCreateTool = Tool.make("t3_visualization_create", {
  ...shared,
  dependencies: [...shared.dependencies, InlineVisualization.InlineVisualization],
  description:
    "Create an interactive visualization inline in this conversation. Provide a self-contained HTML fragment as source.html, or an absolute HTML file path on this environment as source.path. The app saves a durable snapshot, so it works on remote clients and survives source edits or deletion. Limit 1 MiB. Scripts run in an isolated sandbox; API calls, local files, forms and navigation are blocked. Inline CSS/JS and data are supported, as are scripts/styles from cdn.jsdelivr.net, cdnjs.cloudflare.com, esm.sh, unpkg.com and Google/Bunny fonts. Use CSS variables --background, --foreground, --muted-foreground, --border, --primary and --viz-series-1 through --viz-series-6 for theme-aware visuals. Return the exact markdown result in your final reply outside any enclosing code fence. For updates, create a new snapshot and return its new markdown. Use mode=wide only for wide multi-panel visuals.",
  parameters: InlineVisualizationCreateInput,
  success: InlineVisualizationCreateResult,
}).annotate(Tool.Destructive, false);

export const AttachmentToolkit = Toolkit.make(
  AttachmentUploadTool,
  AttachmentDiscardTool,
  AttachmentSendTool,
  VisualizationCreateTool,
);
