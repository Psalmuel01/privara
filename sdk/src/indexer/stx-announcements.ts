import { hexToBytes } from "@stacks/common";
import { ClarityType, deserializeCV, type ClarityValue, type TupleCV } from "@stacks/transactions";
import { hashStealthAnnouncement, validateStealthAnnouncement, type StealthAnnouncementPayload } from "../stealth/announcement";
import type { HiroContractLog, InvalidAnnouncementMetadata } from "./announcements";

export interface IndexedStxAnnouncement extends StealthAnnouncementPayload {
  transactionId: string;
  eventIndex: number;
  announcementHash: Uint8Array;
  amount: bigint;
  relayerFee: bigint;
  relayer: string;
  paymentNonce: bigint;
}

export interface StxAnnouncementPage {
  announcements: IndexedStxAnnouncement[];
  nextCursor?: string;
}

function tuple(value: ClarityValue): TupleCV {
  if (value.type !== ClarityType.Tuple) throw new Error("announcement event must be a tuple");
  return value;
}
function value(data: TupleCV["value"], name: string): ClarityValue {
  const found = data[name];
  if (!found) throw new Error(`announcement event is missing ${name}`);
  return found;
}
function ascii(data: TupleCV["value"], name: string): string {
  const found = value(data, name);
  if (found.type !== ClarityType.StringASCII) throw new Error(`${name} must be string-ascii`);
  return found.value;
}
function principal(data: TupleCV["value"], name: string): string {
  const found = value(data, name);
  if (found.type !== ClarityType.PrincipalStandard && found.type !== ClarityType.PrincipalContract) throw new Error(`${name} must be principal`);
  return found.value;
}
function uint(data: TupleCV["value"], name: string): bigint {
  const found = value(data, name);
  if (found.type !== ClarityType.UInt) throw new Error(`${name} must be uint`);
  return BigInt(found.value);
}
function buffer(data: TupleCV["value"], name: string): Uint8Array {
  const found = value(data, name);
  if (found.type !== ClarityType.Buffer) throw new Error(`${name} must be buffer`);
  return hexToBytes(found.value.replace(/^0x/, ""));
}
function equal(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function parseStxSettlementLog(log: HiroContractLog): IndexedStxAnnouncement | null {
  if (log.event_type !== "smart_contract_log" || log.contract_log.topic !== "print") return null;
  const decoded = tuple(deserializeCV(log.contract_log.value.hex));
  if (ascii(decoded.value, "event") !== "stealth-stx-settlement") return null;
  const payload: StealthAnnouncementPayload = {
    version: Number(uint(decoded.value, "version")) as 1,
    stealthPrincipal: principal(decoded.value, "stealth-principal"),
    ephemeralPublicKey: buffer(decoded.value, "ephemeral-key"),
    nonce: buffer(decoded.value, "nonce"),
    ciphertext: buffer(decoded.value, "ciphertext"),
    asset: principal(decoded.value, "asset"),
    registryEpoch: uint(decoded.value, "registry-epoch"),
  };
  validateStealthAnnouncement(payload);
  const announcementHash = buffer(decoded.value, "announcement-hash");
  if (!equal(announcementHash, hashStealthAnnouncement(payload))) throw new Error("announcement event hash does not match its canonical payload");
  return {
    ...payload,
    transactionId: log.tx_id,
    eventIndex: log.event_index,
    announcementHash,
    amount: uint(decoded.value, "amount"),
    relayerFee: uint(decoded.value, "relayer-fee"),
    relayer: principal(decoded.value, "relayer"),
    paymentNonce: uint(decoded.value, "payment-nonce"),
  };
}

export async function fetchStxAnnouncementPage(options: {
  apiUrl: string;
  router: string;
  cursor?: string;
  limit?: number;
  fetcher?: typeof fetch;
  onInvalid?: (metadata: InvalidAnnouncementMetadata) => void;
}): Promise<StxAnnouncementPage> {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("announcement page limit must be an integer from 1 to 100");
  const url = new URL(`/extended/v2/smart-contracts/${encodeURIComponent(options.router)}/logs`, options.apiUrl);
  url.searchParams.set("limit", String(limit));
  if (options.cursor) url.searchParams.set("cursor", options.cursor);
  const response = await (options.fetcher ?? fetch)(url);
  if (!response.ok) throw new Error(`unable to fetch STX announcement logs: HTTP ${response.status}`);
  const page = await response.json() as { results?: HiroContractLog[]; next_cursor?: string | null };
  if (!Array.isArray(page.results)) throw new Error("malformed announcement log response");
  const announcements: IndexedStxAnnouncement[] = [];
  for (const log of page.results) {
    try {
      if (log?.contract_log?.contract_id !== options.router) continue;
      const parsed = parseStxSettlementLog(log);
      if (parsed) announcements.push(parsed);
    } catch {
      options.onInvalid?.({
        transactionId: typeof log?.tx_id === "string" && /^0x[0-9a-f]{64}$/i.test(log.tx_id) ? log.tx_id : undefined,
        eventIndex: Number.isSafeInteger(log?.event_index) ? log.event_index : undefined,
        reason: "invalid_announcement",
      });
    }
  }
  return { announcements, nextCursor: page.next_cursor || undefined };
}
