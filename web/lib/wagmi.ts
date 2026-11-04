import { passkeyProvider } from "./passkey";
import { createConfig, fallback, http, type CreateConnectorFn } from "wagmi";
import { base } from "wagmi/chains";
import { injected, mock, walletConnect } from "wagmi/connectors";
import type { Address } from "viem";

const PUBLIC_RPCS = [
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org",
  "https://1rpc.io/base",
  "https://mainnet.base.org",
];

/** Set only by the end-to-end suite, which points the app at a local fork with a test account. */
const testRpc = process.env.NEXT_PUBLIC_TEST_RPC_URL;
const testAccounts = (process.env.NEXT_PUBLIC_TEST_ACCOUNT ?? "").split(",").filter(Boolean) as Address[];
const testAccount = testAccounts[0];

/** The suite picks which unlocked fork account acts as this browser (seller or buyer). */
function testAccountOrder(): [Address, ...Address[]] {
  const i = typeof window === "undefined" ? 0 : Number(window.localStorage.getItem("qrush.testAccount") ?? 0) || 0;
  const pick = testAccounts[i] ?? testAccounts[0]!;
  return [pick, ...testAccounts.filter((a) => a !== pick)];
}

/** Needed for mobile wallets (Trust, MetaMask mobile, Rainbow) via QR or deep link. */
export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

function connectors(): CreateConnectorFn[] {
  if (testRpc && testAccount) {
    return [mock({ accounts: testAccountOrder(), features: { reconnect: true } })];
  }
  const list: CreateConnectorFn[] = [
    injected({ target: { id: "qrush.passkey", name: "Passkey wallet", provider: () => (typeof window === "undefined" ? undefined : (passkeyProvider as never)) } }),
    injected({ shimDisconnect: true }),
  ];
  if (WALLETCONNECT_PROJECT_ID) {
    list.push(
      walletConnect({
        projectId: WALLETCONNECT_PROJECT_ID,
        showQrModal: true,
        metadata: { name: "QRush", description: "Get paid in USDC by QR", url: typeof window !== "undefined" ? window.location.origin : "https://qrush.online", icons: ["https://qrush.online/icon.svg"] },
      }),
    );
  }
  return list;
}

/** In test mode the chain itself points at the fork, since the mock connector signs through chain.rpcUrls. */
const chain = testRpc ? { ...base, rpcUrls: { default: { http: [testRpc] } } } : base;

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: connectors(),
  transports: {
    [chain.id]: testRpc ? http(testRpc) : fallback(PUBLIC_RPCS.map((url) => http(url))),
  },
  ssr: true,
});

export const CHAIN = chain;
export const isTestMode = Boolean(testRpc && testAccount);

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
