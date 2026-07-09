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
