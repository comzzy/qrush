// End-to-end runner: Base mainnet fork -> deploy checkout -> fund buyer -> build + start Next -> Playwright.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createPublicClient, createWalletClient, http, parseEther } from "viem";
import { base } from "viem/chains";
import { qrushCheckoutAbi, qrushCheckoutBytecode } from "../../api/dist/src/contracts/artifact.js";

const PORT = 8547;
const WEB_PORT = 3000;
const rpcUrl = `http://127.0.0.1:${PORT}`;
// Anvil's well-known unlocked dev accounts.
const SELLER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const BUYER = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const DEPLOYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const procs = [];
const cleanup = () => procs.forEach((p) => p.kill("SIGTERM"));
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));

const run = (cmd, args, env) =>
  new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });

async function waitFor(url, init, ms) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      const r = await fetch(url, init);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${url}`);
}

const anvil = spawn("anvil", ["--fork-url", process.env.BASE_RPC_URL ?? "https://base-rpc.publicnode.com", "--port", String(PORT), "--chain-id", "8453", "--retries", "10", "--fork-retry-backoff", "1000", "--silent"], { stdio: "inherit" });
procs.push(anvil);
await waitFor(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) }, 60_000);

const chain = { ...base, rpcUrls: { default: { http: [rpcUrl] } } };
const client = createPublicClient({ chain, transport: http(rpcUrl) });
const wallet = createWalletClient({ account: DEPLOYER, chain, transport: http(rpcUrl) });
const rpc = (method, params) => client.request({ method, params });
for (const a of [DEPLOYER, SELLER, BUYER]) await rpc("anvil_setBalance", [a, `0x${parseEther("100").toString(16)}`]);
const hash = await wallet.deployContract({ abi: qrushCheckoutAbi, bytecode: qrushCheckoutBytecode, args: [USDC, "0x4200000000000000000000000000000000000006", "0x2626664c2603336E57B271c5C0b26F421741e481"] });
const receipt = await client.waitForTransactionReceipt({ hash });
await rpc("anvil_dealERC20", [BUYER, USDC, `0x${(500n * 10n ** 6n).toString(16)}`]);
console.log(`[e2e] checkout ${receipt.contractAddress} at block ${receipt.blockNumber}`);

const env = {
  NEXT_PUBLIC_TEST_RPC_URL: rpcUrl,
  NEXT_PUBLIC_TEST_ACCOUNT: `${SELLER},${BUYER}`,
  NEXT_PUBLIC_SITE_URL: `http://localhost:${WEB_PORT}`,
  RPC_URL: rpcUrl,
  RPC_FALLBACK_URLS: "none",
  CHECKOUT_ADDRESS: receipt.contractAddress,
  NEXT_PUBLIC_CHECKOUT_ADDRESS: receipt.contractAddress,
  CHECKOUT_DEPLOY_BLOCK: receipt.blockNumber.toString(),
  SIWE_DOMAIN: `localhost:${WEB_PORT}`,
  PUBLIC_BASE_URL: `http://localhost:${WEB_PORT}/api`,
  PAY_BASE_URL: `http://localhost:${WEB_PORT}/pay`,
  INDEXER_CONFIRMATIONS: "0",
  JWT_SECRET: randomBytes(32).toString("hex"),
  E2E_SELLER: SELLER,
  E2E_BUYER: BUYER,
};
await run("pnpm", ["build"], env);
const web = spawn("pnpm", ["exec", "next", "start", "-p", String(WEB_PORT)], { stdio: "inherit", env: { ...process.env, ...env } });
procs.push(web);
await waitFor(`http://localhost:${WEB_PORT}/api/health`, undefined, 60_000);
try {
  await run("pnpm", ["exec", "playwright", "test", ...process.argv.slice(2)], env);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
cleanup();
process.exit(process.exitCode ?? 0);
