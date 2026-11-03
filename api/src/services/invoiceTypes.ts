import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

export const invoiceTypes = {
  Invoice: [
    { name: "id", type: "bytes32" },
    { name: "seller", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "expiresAt", type: "uint64" },
    { name: "maxUses", type: "uint32" },
    { name: "items", type: "Item[]" },
  ],
  Item: [
    { name: "name", type: "string" },
    { name: "quantity", type: "uint32" },
    { name: "unitPrice", type: "uint256" },
  ],
} as const;

export type OnchainInvoice = {
  id: Hex;
  seller: Address;
  amount: bigint;
  expiresAt: bigint;
  maxUses: number;
  items: { name: string; quantity: number; unitPrice: bigint }[];
};

export function invoiceDomain(chainId: number, verifyingContract: Address) {
  return { name: "QRushCheckout", version: "1", chainId, verifyingContract } as const;
}

export function invoiceKey(seller: Address, id: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [seller, id]));
}

export function toOnchainInvoice(row: {
  invoiceId: string;
  seller: string;
  amount: string;
  expiresAt: number;
  maxUses: number;
  items: { name: string; quantity: number; unitPrice: string }[];
}): OnchainInvoice {
  return {
    id: row.invoiceId as Hex,
    seller: row.seller as Address,
    amount: BigInt(row.amount),
    expiresAt: BigInt(row.expiresAt),
    maxUses: row.maxUses,
    items: row.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: BigInt(i.unitPrice) })),
  };
}
