# meta-mcp

A minimal [Model Context Protocol](https://modelcontextprotocol.io) server for Meta's **official** Graph API — Facebook Page posts and Instagram content publishing.

## Why this exists

Meta's Graph API is well-documented but has a real learning curve (Page vs. user tokens, the Instagram-via-linked-Page model, long-lived token exchange). This wraps the parts needed for posting — nothing more, no ad management, no messaging, no analytics — so an AI agent can use it without needing to understand all of that.

## Setup

```bash
npm install
npm run build
```

Requires a Facebook **Page** access token and an Instagram access token (in practice these are usually the same value — Instagram Graph API calls are authenticated via the linked Facebook Page's token when the accounts are connected the standard way).

### Getting tokens

1. Use the [Graph API Explorer](https://developers.facebook.com/tools/explorer) with your app selected.
2. Generate a **Page** access token (not a user token) with `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`.
3. **Exchange it for a long-lived token** — Page tokens derived this way from a long-lived user token typically don't expire at all:
   ```
   GET https://graph.facebook.com/v25.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id={app-id}
     &client_secret={app-secret}
     &fb_exchange_token={short-lived-page-token}
   ```
4. Get your Page id and linked Instagram Business Account id:
   ```
   GET https://graph.facebook.com/v25.0/me?fields=id,instagram_business_account
   ```

### Configuration

```json
{
  "mcpServers": {
    "meta": {
      "command": "node",
      "args": ["/path/to/meta-mcp/dist/index.js"],
      "env": {
        "META_PAGE_ACCESS_TOKEN": "<your-long-lived-page-token>",
        "META_IG_ACCESS_TOKEN": "<usually-the-same-token>"
      }
    }
  }
}
```

## Available tools

| Tool | Description |
|---|---|
| `meta_get_page_info` | Get basic Facebook Page info (name, about, follower count) |
| `meta_create_page_post` | Publish a real, **immediately-live** Facebook Page post |
| `meta_get_instagram_account` | Get basic Instagram account info |
| `meta_create_instagram_post` | Publish a real, **immediately-live** Instagram post or Reel |

**Note:** `meta_create_instagram_post` requires a publicly reachable `image_url`/`video_url` — Instagram's Content Publishing API doesn't accept direct file uploads for this flow, so the media has to already be hosted somewhere.

## ⚠️ No draft state

Neither the Facebook Page Feed API nor the Instagram Content Publishing API has an unpublished/draft state reachable through this server — both tools publish immediately, with no undo. If you want a human-review step, it has to happen entirely on your side before calling either tool.

## Security model: `agent_id` capability gating

Built for a multi-agent fleet where several AI agents share one MCP process, and the underlying platform doesn't propagate per-agent caller identity down to MCP tool calls. Both mutating tools **require an `agent_id` argument**, verified against an external authorization endpoint (`FLEET_BOARD_URL`, default `http://127.0.0.1:8420`) before doing anything.

**Honest limitation:** `agent_id` is self-reported by the caller, not cryptographically bound by the MCP protocol. This turns a *silent* wrong-agent action into a *loud, rejected, auditable* one — it does not stop a determined malicious actor from lying about its own identity.

Running standalone? Either stand up a minimal service at `FLEET_BOARD_URL` returning a JSON array of capability strings for `GET /agents/{id}/capabilities`, or remove the two `requireCapability` calls in `src/index.ts`.

## Notes on safety

- Every request goes to `graph.facebook.com` only — no telemetry, no third-party calls, no dynamic code execution.

## License

MIT — see [LICENSE](LICENSE).
