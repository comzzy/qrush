import { join } from "node:path";
import { BlobSnapshotStore, createServerlessHandler } from "qrush-api/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Handler = ReturnType<typeof createServerlessHandler>["handle"];
let handler: Handler | undefined;

function apiHandler(): Handler {
  if (handler) return handler;
  // Migrations are copied into web/drizzle at build time (see scripts/copy-migrations.mjs).
  process.env.QRUSH_MIGRATIONS_DIR ??= join(process.cwd(), "drizzle");
  const env = { ...process.env };
  const host = env.VERCEL_PROJECT_PRODUCTION_URL;
  if (host) {
    env.PUBLIC_BASE_URL ??= `https://${host}/api`;
    env.PAY_BASE_URL ??= `https://${host}/pay`;
    env.SIWE_DOMAIN ??= host;
  }
  const store = env.BLOB_READ_WRITE_TOKEN ? new BlobSnapshotStore("qrush/state.sqlite") : undefined;
  handler = createServerlessHandler({ env, store, basePath: "/api" }).handle;
  return handler;
}

const handle = (req: Request) => apiHandler()(req);

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
