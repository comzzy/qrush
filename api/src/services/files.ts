/** Private storage for digital products. Files are never public; buyers get short-lived links. */
export interface FileStore {
  /** Answers the browser's client-upload handshake (Vercel Blob `handleUpload`). */
  handleUpload(
    request: Request,
    body: unknown,
    check: (pathname: string) => void,
    maxBytes: number,
  ): Promise<unknown>;
  head(pathname: string): Promise<{ size: number; contentType: string } | null>;
  /** A URL that works for `ttlMs`, or a streamed response when presigning is unavailable. */
  open(
    pathname: string,
    ttlMs: number,
    fileName: string,
    disposition?: "inline" | "attachment",
    stream?: boolean,
  ): Promise<{ redirect: string } | { response: Response }>;
  remove(pathname: string): Promise<void>;
  read(pathname: string): Promise<Uint8Array>;
  /** Saves a private file and returns its final pathname. */
  write(
    pathname: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<string>;
}

export class BlobFileStore implements FileStore {
  constructor(private readonly token?: string) {}

  private sdk() {
    return import("@vercel/blob");
  }

  async handleUpload(
    request: Request,
    body: unknown,
    check: (pathname: string) => void,
    maxBytes: number,
  ) {
    const { handleUpload } = await import("@vercel/blob/client");
    return handleUpload({
      token: this.token,
      request,
      body: body as Parameters<typeof handleUpload>[0]["body"],
      onBeforeGenerateToken: async (pathname) => {
        check(pathname);
        return {
          maximumSizeInBytes: maxBytes,
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + 30 * 60_000,
        };
      },
    });
  }

  async head(pathname: string) {
    const { head, BlobNotFoundError } = await this.sdk();
    try {
      const m = await head(pathname, { token: this.token });
      return { size: m.size, contentType: m.contentType };
    } catch (e) {
      if (e instanceof BlobNotFoundError) return null;
      throw e;
    }
  }

  async open(
    pathname: string,
    ttlMs: number,
    fileName: string,
    disposition: "inline" | "attachment" = "attachment",
    stream = false,
  ) {
    const sdk = await this.sdk();
    const validUntil = Date.now() + ttlMs;
    if (!stream)
      try {
        const signed = await sdk.issueSignedToken({
          token: this.token,
          pathname,
          operations: ["get"],
          validUntil,
        });
        const { presignedUrl } = await sdk.presignUrl(signed, {
          operation: "get",
          pathname,
          validUntil,
          access: "private",
        });
        return { redirect: presignedUrl };
      } catch (e) {
        console.error(
          "presign failed, streaming instead:",
          e instanceof Error ? e.message : e,
        );
      }
    const res = await sdk.get(pathname, {
      access: "private",
      token: this.token,
      useCache: false,
    });
    if (!res || res.statusCode !== 200 || !res.stream)
      throw new Error("File missing");
    return {
      response: new Response(res.stream, {
        headers: {
          "content-type": res.blob.contentType || "application/octet-stream",
          "content-disposition": `${disposition}; filename="${fileName.replace(/["\\\r\n]/g, "_")}"`,
          "cache-control": "private, no-store",
        },
      }),
    };
  }

  async read(pathname: string) {
    const sdk = await this.sdk();
    const res = await sdk.get(pathname, {
      access: "private",
      token: this.token,
      useCache: false,
    });
    if (!res || res.statusCode !== 200 || !res.stream)
      throw new Error("File missing");
    return new Uint8Array(await new Response(res.stream).arrayBuffer());
  }

  async write(pathname: string, bytes: Uint8Array, contentType: string) {
    const { put } = await this.sdk();
    const r = await put(pathname, Buffer.from(bytes), {
      access: "private",
      token: this.token,
      contentType,
      addRandomSuffix: true,
    });
    return r.pathname;
  }

  async remove(pathname: string) {
    const { del } = await this.sdk();
    await del(pathname, { token: this.token }).catch(() => undefined);
  }
}
