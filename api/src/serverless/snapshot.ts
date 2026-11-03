/** Where the serialized SQLite database lives between serverless invocations. */
export interface SnapshotStore {
  /** Version tag of the stored snapshot, or null when nothing is stored yet. */
  version(): Promise<string | null>;
  load(): Promise<{ bytes: Buffer; version: string } | null>;
  /** Write only if the stored version still equals `expected`. Returns the new version, or null on conflict. */
  save(bytes: Buffer, expected: string | null): Promise<string | null>;
  /** Keep a copy of a snapshot before a migration touches it. Returns where it went. */
  backup?(bytes: Buffer, label: string): Promise<string>;
}

export class MemorySnapshotStore implements SnapshotStore {
  private bytes: Buffer | null = null;
  private tag = 0;

  async version() {
    return this.bytes ? String(this.tag) : null;
  }

  async load() {
    return this.bytes ? { bytes: Buffer.from(this.bytes), version: String(this.tag) } : null;
  }

  async save(bytes: Buffer, expected: string | null) {
    if ((await this.version()) !== expected) return null;
    this.bytes = Buffer.from(bytes);
    this.tag++;
    return String(this.tag);
  }
}

/** Private Vercel Blob object guarded by ETag preconditions. */
export class BlobSnapshotStore implements SnapshotStore {
  constructor(
    private readonly pathname: string,
    private readonly token?: string,
  ) {}

  private async sdk() {
    return import("@vercel/blob");
  }

  async version() {
    const { head, BlobNotFoundError } = await this.sdk();
    try {
      const meta = await head(this.pathname, { token: this.token });
      return meta.etag;
    } catch (e) {
      if (e instanceof BlobNotFoundError) return null;
      throw e;
    }
  }

  async load() {
    const { get, BlobNotFoundError } = await this.sdk();
    let res;
    try {
      res = await get(this.pathname, { access: "private", token: this.token, useCache: false });
    } catch (e) {
      if (e instanceof BlobNotFoundError) return null;
      throw e;
    }
    if (!res || res.statusCode !== 200 || !res.stream) return null;
    const bytes = Buffer.from(await new Response(res.stream).arrayBuffer());
    return { bytes, version: res.blob.etag };
  }

  async backup(bytes: Buffer, label: string) {
    const { put } = await this.sdk();
    const dir = this.pathname.replace(/[^/]+$/, "");
    const out = await put(`${dir}backups/${label}.sqlite`, bytes, {
      access: "private",
      token: this.token,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/vnd.sqlite3",
    });
    return out.pathname;
  }

  async save(bytes: Buffer, expected: string | null) {
    const { put, BlobPreconditionFailedError } = await this.sdk();
    try {
      const out = await put(this.pathname, bytes, {
        access: "private",
        token: this.token,
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/vnd.sqlite3",
        cacheControlMaxAge: 60,
        ...(expected ? { ifMatch: expected } : {}),
      });
      return out.etag;
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) return null;
      throw e;
    }
  }
}
