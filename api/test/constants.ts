import type { Address, Hex } from "viem";

export const ANVIL_PORT = 8546;

/** Default anvil deployer key (public, deterministic). */
export const ANVIL_KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
} as const satisfies Record<string, Hex>;

export const BASE = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  WETH: "0x4200000000000000000000000000000000000006",
  CBBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  SWAP_ROUTER_02: "0x2626664c2603336E57B271c5C0b26F421741e481",
} as const satisfies Record<string, Address>;
