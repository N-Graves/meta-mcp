#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from "@modelcontextprotocol/sdk/types.js";
import { MetaClient } from "./meta-client.js";
import { requireCapability } from "./agent-capability.js";

const REQUIRED_CAPABILITY = "social"; // ECHO owns social posting

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
        page_id: { type: "string", description: "Facebook Page id" },
        message: { type: "string", description: "The post text" },
      },
      required: ["agent_id", "page_id", "message"],
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
        post_id: {
          type: "string",
          description: "The post id returned by meta_create_page_post (looks like <pageid>_<postid>)",
        },
        message: { type: "string", description: "The comment text - normally the product link plus a line of context" },
      },
      required: ["agent_id", "post_id", "message"],
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
        ig_user_id: { type: "string", description: "Instagram business/creator account id" },
        caption: { type: "string" },
        image_url: { type: "string", description: "Publicly reachable image URL (for a photo post)" },
        video_url: { type: "string", description: "Publicly reachable video URL (for a Reel)" },
      },
      required: ["agent_id", "ig_user_id"],
    },
  },
];

const server = new Server({ name: "meta-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  let result: unknown;

  switch (name) {
    case "meta_get_page_info":
      result = await client.getPageInfo(args.page_id as string);
      break;
    case "meta_create_page_post":
      await requireCapability(args.agent_id as string | undefined, REQUIRED_CAPABILITY);
      result = await client.createPagePost(args.page_id as string, args.message as string);
      break;
    case "meta_create_page_comment":
      await requireCapability(args.agent_id as string | undefined, REQUIRED_CAPABILITY);
      result = await client.createPostComment(args.post_id as string, args.message as string);
      break;
    case "meta_get_instagram_account":
      result = await client.getInstagramAccount(args.ig_user_id as string);
      break;
    case "meta_create_instagram_post":
      await requireCapability(args.agent_id as string | undefined, REQUIRED_CAPABILITY);
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

  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("meta-mcp server running on stdio");
