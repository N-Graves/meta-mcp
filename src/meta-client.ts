const BASE_URL = "https://graph.facebook.com/v25.0";

interface CreateInstagramPostArgs {
  igUserId: string;
  caption?: string;
  imageUrl?: string;
  videoUrl?: string;
}

export class MetaClient {
  constructor(
    private readonly pageAccessToken: string,
    private readonly igAccessToken: string,
  ) {}

  private async get(path: string, token: string): Promise<unknown> {
    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("access_token", token);
    const res = await fetch(url.toString());
    return res.json();
  }

  private async post(path: string, token: string, body: Record<string, string>): Promise<unknown> {
    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("access_token", token);
    for (const [k, v] of Object.entries(body)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), { method: "POST" });
    return res.json();
  }

  async getPageInfo(pageId: string): Promise<unknown> {
    return this.get(`/${pageId}?fields=id,name,about,fan_count`, this.pageAccessToken);
  }

  /** Creates a real, immediately-live Facebook Page post. No draft, no undo. */
  async createPagePost(pageId: string, message: string): Promise<unknown> {
    return this.post(`/${pageId}/feed`, this.pageAccessToken, { message });
  }

  /**
   * Comments on one of our own Facebook Page posts.
   *
   * This is the link-delivery mechanism, not a nicety: Facebook has
   * deprioritised posts that send people off-platform since 2018, so the post
   * body stays link-free and the link goes in the first comment.
   *
   * Unlike the other methods here, this one throws on failure rather than
   * returning Graph's error envelope. A silently-failed comment means a live
   * post with no route to the product, which is worse than a loud error - and
   * this needs the pages_manage_engagement permission, which is a realistic
   * thing for the token to be missing.
   */
  async createPostComment(postId: string, message: string): Promise<unknown> {
    const result = (await this.post(`/${postId}/comments`, this.pageAccessToken, { message })) as {
      id?: string;
      error?: { message?: string; type?: string; code?: number };
    };
    if (result.error || !result.id) {
      throw new Error(
        `createPostComment failed for ${postId}: ${result.error?.message ?? "no comment id returned"}` +
          (result.error?.code ? ` (code ${result.error.code})` : ""),
      );
    }
    return result;
  }

  /*
   * There is deliberately no read-comments method. Probed live 2026-07-27:
   * every Page read endpoint (/{page}/feed, /me/feed, and by extension
   * /{post}/comments) returns
   *   (#10) "This endpoint requires the 'pages_read_engagement' permission or
   *   the 'Page Public Content Access' feature"
   * even though debug_token lists pages_read_engagement among the token's
   * scopes - so the scope is granted but not effective, which points at App
   * Review rather than at re-auth.
   *
   * Note this does NOT apply to writing: the same probe against
   * POST /{post}/comments got "(#100) Invalid post_id parameter", i.e. it
   * cleared the permission check and failed on the fake id. Writing a comment
   * works; reading one back does not. Don't infer one from the other here.
   */

  async getInstagramAccount(igUserId: string): Promise<unknown> {
    return this.get(`/${igUserId}?fields=id,username,name,followers_count`, this.igAccessToken);
  }

  /**
   * Creates a real, immediately-published Instagram post. Two Graph API
   * calls under the hood (create media container, then publish it) - no
   * draft, no undo once publish succeeds. Requires a publicly reachable
   * image_url or video_url (Instagram's Content Publishing API does not
   * accept direct file uploads for this flow).
   */
  async createInstagramPost(args: CreateInstagramPostArgs): Promise<unknown> {
    const containerBody: Record<string, string> = {};
    if (args.caption) containerBody.caption = args.caption;
    if (args.imageUrl) containerBody.image_url = args.imageUrl;
    if (args.videoUrl) {
      containerBody.video_url = args.videoUrl;
      containerBody.media_type = "REELS";
    }

    const container = (await this.post(`/${args.igUserId}/media`, this.igAccessToken, containerBody)) as {
      id?: string;
      error?: unknown;
    };
    if (!container.id) {
      return { error: "Failed to create media container", detail: container };
    }

    return this.post(`/${args.igUserId}/media_publish`, this.igAccessToken, {
      creation_id: container.id,
    });
  }
}
