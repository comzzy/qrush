type Field = { name: string; type: string };
export type TypedDataJson = { domain: Record<string, unknown>; types: Record<string, Field[]>; primaryType: string; message: Record<string, unknown> };

/** The API returns bigints as strings; turn uint/int fields back into bigint before signing. */
export function reviveTypedData(td: TypedDataJson) {
  const revive = (type: string, value: unknown): unknown => {
    if (type.endsWith("[]")) return (value as unknown[]).map((v) => revive(type.slice(0, -2), v));
    if (/^u?int\d*$/.test(type)) return BigInt(value as string);
    const struct = td.types[type];
    if (struct) return Object.fromEntries(struct.map((f) => [f.name, revive(f.type, (value as Record<string, unknown>)[f.name])]));
    return value;
  };
  const domain = { ...td.domain };
  if (domain.chainId !== undefined) domain.chainId = Number(domain.chainId);
  return { domain, types: td.types, primaryType: td.primaryType, message: revive(td.primaryType, td.message) as Record<string, unknown> };
}
