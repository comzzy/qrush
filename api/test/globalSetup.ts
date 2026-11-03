import { spawn, type ChildProcess } from "node:child_process";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import type { TestProject } from "vitest/node";
import { qrushCheckoutAbi, qrushCheckoutBytecode } from "../src/contracts/artifact.js";
import { ANVIL_KEYS, ANVIL_PORT, BASE } from "./constants.js";

declare module "vitest" {
  export interface ProvidedContext {
    rpcUrl: string;
    checkout: Address;
    deployBlock: string;
  }
}

let anvil: ChildProcess | undefined;

async function waitForRpc(url: string, timeoutMs: number) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("anvil did not start");
}

export default async function setup(project: TestProject) {
  const forkUrl = process.env.BASE_RPC_URL ?? "https://base-rpc.publicnode.com";
  const anvilBin = process.env.ANVIL_BIN ?? "anvil";
  anvil = spawn(
    anvilBin,
    ["--fork-url", forkUrl, "--port", String(ANVIL_PORT), "--chain-id", "8453", "--fork-retry-backoff", "1000", "--retries", "10", "--silent"],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  const rpcUrl = `http://127.0.0.1:${ANVIL_PORT}`;
  await waitForRpc(rpcUrl, 60_000);

  const chain = { ...base, rpcUrls: { default: { http: [rpcUrl] } } };
  const deployer = createWalletClient({ account: privateKeyToAccount(ANVIL_KEYS.deployer), chain, transport: http(rpcUrl) });
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const hash = await deployer.deployContract({
    abi: qrushCheckoutAbi,
    bytecode: qrushCheckoutBytecode,
    args: [BASE.USDC, BASE.WETH, BASE.SWAP_ROUTER_02],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });

  project.provide("rpcUrl", rpcUrl);
  project.provide("checkout", receipt.contractAddress!);
  project.provide("deployBlock", receipt.blockNumber.toString());

  return () => {
    anvil?.kill("SIGTERM");
  };
}
