import { concatHex, getAddress, keccak256, toBytes, type Address, type PublicClient } from "viem";
import { namehash, normalize } from "viem/ens";

const l2ResolverAbi = [
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const l2ReverseRegistrarAbi = [
  {
    type: "function",
    name: "nameForAddr",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

/** ENSIP-19 L2ReverseRegistrar, same address on every supported L2. */
export const L2_REVERSE_REGISTRAR: Address = "0x0000000000D8e504002cC26E3Ec46D81971C1664";

/** ENSIP-11 coin type for Base mainnet: 0x80000000 | 8453. */
const BASE_COIN_TYPE_HEX = (0x80000000 | 8453).toString(16).toUpperCase();

export function baseReverseNode(address: Address) {
  const parentNode = namehash(`${BASE_COIN_TYPE_HEX.toLowerCase()}.reverse`);
  const label = keccak256(toBytes(address.toLowerCase().slice(2)));
  return keccak256(concatHex([parentNode, label]));
}

export function normalizeBasename(input: string): string {
  const name = normalize(input.trim());
  if (name.endsWith(".base.eth")) return name;
  if (name.includes(".")) throw new Error("Only *.base.eth names are supported");
  return `${name}.base.eth`;
}

export async function resolveBasename(client: PublicClient, resolver: Address, input: string) {
  const name = normalizeBasename(input);
  const address = await client.readContract({
    address: resolver,
    abi: l2ResolverAbi,
    functionName: "addr",
    args: [namehash(name)],
  });
  return { name, address: address === "0x0000000000000000000000000000000000000000" ? null : getAddress(address) };
}

/**
 * Reverse-resolve via the ENSIP-19 L2ReverseRegistrar, falling back to the legacy Basenames
 * reverse record on the L2 resolver, then confirm the forward record points back at the address.
 */
export async function reverseBasename(client: PublicClient, resolver: Address, address: Address) {
  const ensip19Name = await client
    .readContract({
      address: L2_REVERSE_REGISTRAR,
      abi: l2ReverseRegistrarAbi,
      functionName: "nameForAddr",
      args: [address],
    })
    .catch(() => "");
  const name =
    ensip19Name ||
    (await client.readContract({
      address: resolver,
      abi: l2ResolverAbi,
      functionName: "name",
      args: [baseReverseNode(address)],
    }));
  if (!name) return { address: getAddress(address), name: null };
  const forward = await resolveBasename(client, resolver, name).catch(() => null);
  const verified = forward?.address?.toLowerCase() === address.toLowerCase();
  return { address: getAddress(address), name: verified ? name : null };
}
