#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from "@modelcontextprotocol/sdk/types.js";
import { MetaClient } from "./meta-client.js";
import { requireCapability, CapabilityError } from "./agent-capability.js";
import { requireBrand, BrandError } from "./brand-gate.js";

const REQUIRED_CAPABILITY = "social"; // ECHO owns social posting
// This server publishes for WITH NATE only - see brand-gate.ts. NAS Digital work goes to LinkedIn/X/Dev.to instead.
const SERVER_BRAND = "with_nate";

const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const IG_ACCESS_TOKEN = process.env.META_IG_ACCESS_TOKEN;
if (!PAGE_ACCESS_TOKEN || !IG_ACCESS_TOKEN) {
  console.error(
    "META_PAGE_ACCESS_TOKEN and META_IG_ACCESS_TOKEN environment variables are required " +
      "(get a Page/Instagram access token via Meta's Graph API Explorer, developers.facebook.com/tools/explorer)",
  );
  process.exit(1);
}

const client = new MetaClient(PAGE_ACCESS_TOKEN, IG_ACCESS_TOKEN);

const tools: Tool[] = [
  {
    name: "meta_get_page_info",
    description: "Get basic info about a Facebook Page (name, about, follower count)",
    inputSchema: {
      type: "object",
      properties: { page_id: { type: "string", description: "Facebook Page id" } },
      required: ["page_id"],
    },
  },
  {
    name: "meta_create_page_post",
    description:
      "Publish a real, immediately-live post to a Facebook Page. No draft/undo - only call after " +
      "HITL approval, never before. Requires agent_id (must hold the 'social' capability).",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Your fleet-board agent id, e.g. 'echo'" },
        task_id: {
          type: "string",
          description:
            "The board task this belongs to. This is a WITH NATE channel - the task's "
            + "brand must be with_nate, or it is refused. NAS Digital work goes to LinkedIn/X/Dev.to instead.",
        },
        page_id: { type: "string", description: "Facebook Page id" },
        message: { type: "string", description: "The post text" },
      },
      required: ["agent_id", "task_id", "page_id", "message"],
    },
  },
  {
    name: "meta_create_page_comment",
    description:
      "Comment on one of our own Facebook Page posts. This is how a product link reaches a Facebook " +
      "audience: Facebook deprioritises posts that send people off-platform, so publish the post " +
      "link-free, then call this with the id it returned and the link. Real and immediately live - " +
      "only call after HITL approval. Requires agent_id (must hold the 'social' capability).",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Your fleet-board agent id, e.g. 'echo'" },
        task_id: {
          type: "string",
          description:
            "The board task this belongs to. This is a WITH NATE channel - the task's "
            + "brand must be with_nate, or it is refused. NAS Digital work goes to LinkedIn/X/Dev.to instead.",
        },
        post_id: {
          type: "string",
          description: "The post id returned by meta_create_page_post (looks like <pageid>_<postid>)",
        },
        message: { type: "string", description: "The comment text - normally the product link plus a line of context" },
      },
      required: ["agent_id", "task_id", "post_id", "message"],
    },
  },
  {
    name: "meta_get_instagram_account",
    description: "Get basic info about an Instagram professional account (username, follower count)",
    inputSchema: {
      type: "object",
      properties: { ig_user_id: { type: "string", description: "Instagram business/creator account id" } },
      required: ["ig_user_id"],
    },
  },
  {
    name: "meta_create_instagram_post",
    description:
      "Publish a real, immediately-live Instagram post (image or Reel). No draft/undo - only call after " +
      "HITL approval, never before. Requires a publicly reachable image_url or video_url (no direct file " +
      "upload). Requires agent_id (must hold the 'social' capability).",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "Your fleet-board agent id, e.g. 'echo'" },
        task_id: {
          type: "string",
          description:
            "The board task this belongs to. This is a WITH NATE channel - the task's "
            + "brand must be with_nate, or it is refused. NAS Digital work goes to LinkedIn/X/Dev.to instead.",
        },
        ig_user_id: { type: "string", description: "Instagram business/creator account id" },
        caption: { type: "string" },
        image_url: { type: "string", description: "Publicly reachable image URL (for a photo post)" },
        video_url: { type: "string", description: "Publicly reachable video URL (for a Reel)" },
      },
      required: ["agent_id", "task_id", "ig_user_id"],
    },
  },
];

const server = new Server({ name: "meta-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  let result: unknown;

  try {
    switch (name) {
    case "meta_get_page_info":
      result = await client.getPageInfo(args.page_id as string);
      break;
    case "meta_create_page_post":
      await requireCapability(args.agent_id as string | undefined, REQUIRED_CAPABILITY);
      await requireBrand(args.task_id as string | undefined, SERVER_BRAND);
      result = await client.createPagePost(args.page_id as string, args.message as string);
      break;
    case "meta_create_page_comment":
      await requireCapability(args.agent_id as string | undefined, REQUIRED_CAPABILITY);
      await requireBrand(args.task_id as string | undefined, SERVER_BRAND);
      result = await client.createPostComment(args.post_id as string, args.message as string);
      break;
    case "meta_get_instagram_account":
      result = await client.getInstagramAccount(args.ig_user_id as string);
      break;
    case "meta_create_instagram_post":
      await requireCapability(args.agent_id as string | undefined, REQUIRED_CAPABILITY);
      await requireBrand(args.task_id as string | undefined, SERVER_BRAND);
      result = await client.createInstagramPost({
        igUserId: args.ig_user_id as string,
        caption: args.caption as string | undefined,
        imageUrl: args.image_url as string | undefined,
        videoUrl: args.video_url as string | undefined,
      });
      break;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
  } catch (err) {
    // A gate rejection is a real answer to the caller, not a crash. Thrown, it
    // surfaced as an opaque transport error and the agent could not tell a
    // refusal from an outage - so it retried. Returned as isError, the reason
    // is readable and actionable.
    if (err instanceof BrandError || err instanceof CapabilityError) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
    throw err;
  }

  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("meta-mcp server running on stdio");
