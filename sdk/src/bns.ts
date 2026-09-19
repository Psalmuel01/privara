import { validateStacksAddress } from "@stacks/transactions";

export const BNS_V2_API_URL = "https://api.bnsv2.com";

export interface ResolvedRecipient {
  /** Normalized user input retained for the confirmation screen. */
  identifier: string;
  /** Exact mainnet principal used for P/V lookup and signing. */
  address: string;
  bnsName?: string;
}

export function isBnsName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 255 && /^(?:[a-z0-9](?:[a-z0-9_-]{0,36}[a-z0-9])?\.)+[a-z0-9-]{1,37}$/.test(normalized);
}

function mainnetAddress(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("SP") || !validateStacksAddress(value)) {
    throw new Error("BNS name did not resolve to a valid Stacks mainnet wallet address");
  }
  return value;
}

/** Resolve an address or BNSv2 name. BNS is deliberately mainnet-only here. */
export async function resolveMainnetRecipient(
  input: string,
  options: { apiUrl?: string; fetcher?: typeof fetch } = {}
): Promise<ResolvedRecipient> {
  const identifier = input.trim().toLowerCase();
  if (!identifier) throw new Error("Enter a Stacks address or BNS name");
  if (identifier.toUpperCase().startsWith("SP")) {
    const address = identifier.toUpperCase();
    if (!validateStacksAddress(address)) throw new Error("Enter a valid Stacks mainnet address");
    return { identifier: address, address };
  }
  if (!isBnsName(identifier)) throw new Error("Enter a valid Stacks mainnet address or BNS name");

  const base = (options.apiUrl ?? BNS_V2_API_URL).replace(/\/$/, "");
  const response = await (options.fetcher ?? fetch)(
    `${base}/names/${encodeURIComponent(identifier)}/owner`
  );
  if (response.status === 404) throw new Error("BNS name was not found");
  if (!response.ok) throw new Error(`BNS lookup failed with HTTP ${response.status}`);
  const result = await response.json() as { owner?: unknown };
  return { identifier, address: mainnetAddress(result.owner), bnsName: identifier };
}

/** Fail closed if a reviewed name changed owners before the wallet prompt. */
export async function assertBnsResolutionUnchanged(
  reviewed: ResolvedRecipient,
  options: { apiUrl?: string; fetcher?: typeof fetch } = {}
): Promise<void> {
  if (!reviewed.bnsName) return;
  const current = await resolveMainnetRecipient(reviewed.bnsName, options);
  if (current.address !== reviewed.address) {
    throw new Error("This BNS name changed owners after review. Review the resolved address again");
  }
}
