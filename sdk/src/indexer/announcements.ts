import { bytesToHex, hexToBytes } from "@stacks/common";
import {
  ClarityType,
  deserializeCV,
  type ClarityValue,
  type TupleCV,
} from "@stacks/transactions";
import {
  hashStealthAnnouncement,
  validateStealthAnnouncement,
  type StealthAnnouncementPayload,
} from "../stealth/announcement";

// The index contains public chain data only. No seed, viewing private key, spending
// private key, decrypted note, or derived stealth private key belongs in this shape.
export interface IndexedStealthAnnouncement extends StealthAnnouncementPayload {
  transactionId: string;
  eventIndex: number;
  settlementId: Uint8Array;
  announcementHash: Uint8Array;
  amount: bigint;
  relayer: string;
  relayerFee: bigint;
  paymentNonce: bigint;
}

export interface HiroContractLog {
  event_index: number;
  event_type: "smart_contract_log" | string;
  tx_id: string;
  contract_log: {
    contract_id: string;
    topic: string;
    value: { hex: string; repr?: string };
  };
}

interface HiroContractLogPage {
  results: HiroContractLog[];
  next_cursor?: string | null;
}

export interface FetchAnnouncementPageOptions {
  apiUrl: string;
  router: string;
  cursor?: string;
  limit?: number;
  fetcher?: typeof fetch;
}

export interface AnnouncementPage {
  announcements: IndexedStealthAnnouncement[];
  nextCursor?: string;
}

function tuple(value: ClarityValue): TupleCV {
  if (value.type !== ClarityType.Tuple) throw new Error("announcement event must be a tuple");
  return value;
}

function field(data: TupleCV["value"], name: string): ClarityValue {
  const value = data[name];
  if (!value) throw new Error(`announcement event is missing ${name}`);
  return value;
}

function ascii(data: TupleCV["value"], name: string): string {
  const value = field(data, name);
  if (value.type !== ClarityType.StringASCII) throw new Error(`${name} must be string-ascii`);
  return value.value;
}

function buffer(data: TupleCV["value"], name: string): Uint8Array {
  const value = field(data, name);
  if (value.type !== ClarityType.Buffer) throw new Error(`${name} must be a buffer`);
  return hexToBytes(value.value.replace(/^0x/, ""));
}

function principal(data: TupleCV["value"], name: string): string {
  const value = field(data, name);
  if (
    value.type !== ClarityType.PrincipalStandard &&
    value.type !== ClarityType.PrincipalContract
  ) {
    throw new Error(`${name} must be a principal`);
  }
  return value.value;
}

function uint(data: TupleCV["value"], name: string): bigint {
  const value = field(data, name);
  if (value.type !== ClarityType.UInt) throw new Error(`${name} must be a uint`);
  return BigInt(value.value);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function parseStealthSettlementLog(
  log: HiroContractLog
): IndexedStealthAnnouncement | null {
  if (log.event_type !== "smart_contract_log" || log.contract_log.topic !== "print") {
    return null;
  }
  const decoded = tuple(deserializeCV(log.contract_log.value.hex));
  if (ascii(decoded.value, "event") !== "stealth-settlement") return null;

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
  const computedHash = hashStealthAnnouncement(payload);
  if (!equalBytes(announcementHash, computedHash)) {
    throw new Error("announcement event hash does not match its canonical payload");
  }
  const settlementId = buffer(decoded.value, "intent-hash");
  if (settlementId.length !== 32) throw new Error("intent-hash must be 32 bytes");

  return {
    ...payload,
    transactionId: log.tx_id,
    eventIndex: log.event_index,
    settlementId,
    announcementHash,
    amount: uint(decoded.value, "amount"),
    relayer: principal(decoded.value, "relayer"),
    relayerFee: uint(decoded.value, "relayer-fee"),
    paymentNonce: uint(decoded.value, "payment-nonce"),
  };
}

export async function fetchAnnouncementPage(
  options: FetchAnnouncementPageOptions
): Promise<AnnouncementPage> {
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("announcement page limit must be an integer from 1 to 100");
  }
  const url = new URL(
    `/extended/v2/smart-contracts/${encodeURIComponent(options.router)}/logs`,
    options.apiUrl
  );
  url.searchParams.set("limit", String(limit));
  if (options.cursor) url.searchParams.set("cursor", options.cursor);

  const response = await (options.fetcher ?? fetch)(url);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `unable to fetch announcement logs: HTTP ${response.status}${detail ? ` ${detail}` : ""}`
    );
  }
  const page = (await response.json()) as HiroContractLogPage;
  if (!Array.isArray(page.results)) throw new Error("malformed announcement log response");

  const announcements: IndexedStealthAnnouncement[] = [];
  for (const log of page.results) {
    if (log.contract_log?.contract_id !== options.router) continue;
    const parsed = parseStealthSettlementLog(log);
    if (parsed) announcements.push(parsed);
  }
  return {
    announcements,
    nextCursor: page.next_cursor || undefined,
  };
}

export class MemoryAnnouncementStore {
  readonly #records = new Map<string, IndexedStealthAnnouncement>();

  put(records: IndexedStealthAnnouncement[]): number {
    let inserted = 0;
    for (const record of records) {
      const key = `${record.transactionId}:${record.eventIndex}`;
      if (!this.#records.has(key)) inserted++;
      this.#records.set(key, record);
    }
    return inserted;
  }

  all(): IndexedStealthAnnouncement[] {
    return [...this.#records.values()];
  }

  get size(): number {
    return this.#records.size;
  }
}

export function announcementRecordId(record: IndexedStealthAnnouncement): string {
  return `${record.transactionId}:${record.eventIndex}:${bytesToHex(record.settlementId)}`;
}
