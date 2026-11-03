import { describe, expect, it } from "vitest";
import { inject } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { createServerlessHandler, MemorySnapshotStore, type SnapshotStore } from "../src/serverless/index.js";

const HOST = "qrush.test";

function env(extra: Record<string, string> = {}) {
  return {
    RPC_URL: inject("rpcUrl"),
    RPC_FALLBACK_URLS: "none",
    CHECKOUT_ADDRESS: inject("checkout"),
    CHECKOUT_DEPLOY_BLOCK: inject("deployBlock"),
    JWT_SECRET: "test-secret-test-secret-test-secret-0123",
    PUBLIC_BASE_URL: `https://${HOST}/api`,
    SIWE_DOMAIN: HOST,
    INDEXER_CONFIRMATIONS: "0",
    ...extra,
  };
}

function instance(store: SnapshotStore, extra?: Record<string, string>) {
  const { handle } = createServerlessHandler({ env: env(extra), store, basePath: "/api" });
  return async <T>(path: string, init: { method?: string; json?: unknown; token?: string; headers?: Record<string, string> } = {}) => {
    const headers = new Headers(init.headers);
    if (init.token) headers.set("authorization", `Bearer ${init.token}`);
    if (init.json !== undefined) headers.set("content-type", "application/json");
    const res = await handle(
      new Request(`https://${HOST}/api${path}`, {
        method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
        headers,
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      }),
    );
    return { status: res.status, body: (await res.json()) as T };
  };
}

async function signIn(call: ReturnType<typeof instance>, key: `0x${string}`) {
  const account = privateKeyToAccount(key);
  const nonce = await call<{ nonce: string; uri: string; chainId: number }>("/auth/nonce");
  const message = createSiweMessage({
    address: account.address,
    chainId: nonce.body.chainId,
    domain: HOST,
    nonce: nonce.body.nonce,
    uri: nonce.body.uri,
    version: "1",
  });
  const signature = await account.signMessage({ message });
  const verified = await call<{ token: string }>("/auth/verify", { json: { message, signature } });
  expect(verified.status).toBe(200);
  return verified.body.token;
}

describe("serverless handler", () => {
  it("shares state between instances through the snapshot store", async () => {
    const store = new MemorySnapshotStore();
    const a = instance(store);
    const b = instance(store);

    // Nonce issued by one instance is redeemed on another.
    const token = await signIn(a, generatePrivateKey());
    const shop = await b<{ id: string; name: string }>("/shops", { token, json: { name: "Corner Coffee" } });
    expect(shop.status).toBe(201);

    const fromA = await a<{ id: string }[]>("/shops", { token });
    expect(fromA.body.map((s) => s.id)).toContain(shop.body.id);
    expect((await a<{ ok: boolean }>("/health")).status).toBe(200);
  });

  it("replays a write after a concurrent snapshot update", async () => {
    const store = new MemorySnapshotStore();
    const a = instance(store);
    const b = instance(store);
    const token = await signIn(a, generatePrivateKey());
    await b("/shops", { token }); // b loads the current snapshot

    // a writes, so b's cached version is stale; b's next write must not overwrite a's shop.
    let saves = 0;
    const save = store.save.bind(store);
    store.save = async (bytes, expected) => {
      saves++;
      return save(bytes, expected);
    };
    const first = await a<{ id: string }>("/shops", { token, json: { name: "First" } });
    const second = await b<{ id: string }>("/shops", { token, json: { name: "Second" } });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(saves).toBeGreaterThanOrEqual(2);

    const names = (await a<{ name: string }[]>("/shops", { token })).body.map((s) => s.name).sort();
    expect(names).toEqual(["First", "Second"]);
  });

  it("guards the cron endpoint and reports index progress", async () => {
    const call = instance(new MemorySnapshotStore(), { CRON_SECRET: "cron-secret-value" });
    expect((await call("/cron/index")).status).toBe(401);
    const ok = await call<{ lastIndexedBlock: string }>("/cron/index", { headers: { authorization: "Bearer cron-secret-value" } });
    expect(ok.status).toBe(200);
    expect(BigInt(ok.body.lastIndexedBlock)).toBeGreaterThanOrEqual(BigInt(inject("deployBlock")) - 1n);
  });

  it("does not hold a connection open for SSE", async () => {
    const call = instance(new MemorySnapshotStore());
    expect((await call("/feed/live")).status).toBe(501);
  });
});
