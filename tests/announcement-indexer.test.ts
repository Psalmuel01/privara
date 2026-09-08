import { describe, expect, it, vi } from "vitest";
import { bytesToHex } from "@stacks/common";
import { Cl, serializeCVBytes } from "@stacks/transactions";
import { Point } from "@noble/secp256k1";
import {
  MemoryAnnouncementStore,
  announcementRecordId,
  fetchAnnouncementPage,
  hashStealthAnnouncement,
  parseStealthSettlementLog,
  type HiroContractLog,
  type StealthAnnouncementPayload,
} from "../sdk/src";
import { findKnownStealthOrigin, type RelayerConfig } from "../relayer/src/service";

const ROUTER = "ST000000000000000000002AMW42H.privara-router-m2";
const ASSET = "ST000000000000000000002AMW42H.mock-token";
const RECIPIENT = "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5";
const RELAYER = "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC";

function payload(): StealthAnnouncementPayload {
  return {
    version: 1,
    stealthPrincipal: RECIPIENT,
    ephemeralPublicKey: Point.BASE.multiply(19n).toRawBytes(true),
    nonce: new Uint8Array(12).fill(0x12),
    ciphertext: new Uint8Array(24).fill(0x34),
    asset: ASSET,
    registryEpoch: 4n,
  };
}

function settlementLog(
  payment = payload(),
  announcementHash = hashStealthAnnouncement(payment)
): HiroContractLog {
  const value = Cl.tuple({
    event: Cl.stringAscii("stealth-settlement"),
    "intent-hash": Cl.buffer(new Uint8Array(32).fill(0xaa)),
    "announcement-hash": Cl.buffer(announcementHash),
    version: Cl.uint(payment.version),
    "stealth-principal": Cl.principal(payment.stealthPrincipal),
    "ephemeral-key": Cl.buffer(payment.ephemeralPublicKey),
    nonce: Cl.buffer(payment.nonce),
    ciphertext: Cl.buffer(payment.ciphertext),
    asset: Cl.principal(payment.asset),
    "registry-epoch": Cl.uint(payment.registryEpoch),
    amount: Cl.uint(100_000),
    relayer: Cl.principal(RELAYER),
    "relayer-fee": Cl.uint(1_000),
    "payment-nonce": Cl.uint(99),
  });
  return {
    event_index: 3,
    event_type: "smart_contract_log",
    tx_id: `0x${"ab".repeat(32)}`,
    contract_log: {
      contract_id: ROUTER,
      topic: "print",
      value: { hex: `0x${bytesToHex(serializeCVBytes(value))}` },
    },
  };
}

describe("announcement event indexer", () => {
  it("decodes and verifies a canonical stealth-settlement event", () => {
    const payment = payload();
    const record = parseStealthSettlementLog(settlementLog(payment));
    expect(record).not.toBeNull();
    expect(record?.stealthPrincipal).toBe(payment.stealthPrincipal);
    expect(record?.ephemeralPublicKey).toEqual(payment.ephemeralPublicKey);
    expect(record?.ciphertext).toEqual(payment.ciphertext);
    expect(record?.registryEpoch).toBe(4n);
    expect(record?.amount).toBe(100_000n);
    expect(record?.relayerFee).toBe(1_000n);
    expect(announcementRecordId(record!)).toContain(record!.transactionId);
  });

  it("ignores other router print events", () => {
    const value = Cl.tuple({ event: Cl.stringAscii("deposit"), amount: Cl.uint(1) });
    const log = settlementLog();
    log.contract_log.value.hex = `0x${bytesToHex(serializeCVBytes(value))}`;
    expect(parseStealthSettlementLog(log)).toBeNull();
  });

  it("rejects an event whose hash does not authenticate its payload", () => {
    expect(() =>
      parseStealthSettlementLog(settlementLog(payload(), new Uint8Array(32).fill(0xff)))
    ).toThrow("hash does not match");
  });

  it("fetches the supported Hiro contract-log endpoint and filters by router", async () => {
    const requested: URL[] = [];
    const other = settlementLog();
    other.contract_log.contract_id = `${RECIPIENT}.other-router`;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      requested.push(new URL(String(input)));
      return new Response(
        JSON.stringify({ results: [settlementLog(), other], next_cursor: "next:cursor" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const page = await fetchAnnouncementPage({
      apiUrl: "https://api.test/",
      router: ROUTER,
      cursor: "old:cursor",
      limit: 25,
      fetcher,
    });
    expect(page.announcements).toHaveLength(1);
    expect(page.nextCursor).toBe("next:cursor");
    expect(requested[0].pathname).toContain("/extended/v2/smart-contracts/");
    expect(requested[0].searchParams.get("cursor")).toBe("old:cursor");
    expect(requested[0].searchParams.get("limit")).toBe("25");
  });

  it("skips malformed logs and malformed secp256k1 keys without aborting the page", async () => {
    const malformedKey = settlementLog(
      { ...payload(), ephemeralPublicKey: new Uint8Array(33) },
      new Uint8Array(32)
    );
    malformedKey.tx_id = `0x${"cd".repeat(32)}`;
    malformedKey.event_index = 4;
    const invalidEncoding = settlementLog();
    invalidEncoding.tx_id = `0x${"ef".repeat(32)}`;
    invalidEncoding.event_index = 5;
    invalidEncoding.contract_log.value.hex = "0x00";
    const invalid = vi.fn();
    const page = await fetchAnnouncementPage({
      apiUrl: "https://api.test/",
      router: ROUTER,
      fetcher: vi.fn(async () => Response.json({
        results: [malformedKey, invalidEncoding, settlementLog()],
      })) as typeof fetch,
      onInvalid: invalid,
    });
    expect(page.announcements).toHaveLength(1);
    expect(invalid).toHaveBeenCalledTimes(2);
    expect(invalid.mock.calls[0][0]).toEqual({
      transactionId: malformedKey.tx_id,
      eventIndex: 4,
      reason: "invalid_announcement",
    });
    expect(JSON.stringify(invalid.mock.calls)).not.toContain("ciphertext");
    expect(JSON.stringify(invalid.mock.calls)).not.toContain("ephemeral");
  });

  it("keeps sponsor known-origin verification alive across an invalid earlier log", async () => {
    const broken = settlementLog();
    broken.tx_id = `0x${"ef".repeat(32)}`;
    broken.contract_log.value.hex = "0x00";
    const invalid = vi.fn();
    const config: RelayerConfig = {
      network: "testnet",
      coreAddress: ROUTER.split(".")[0],
      relayerPrivateKey: "01".repeat(32),
      sponsorPrivateKey: "02".repeat(32),
      assetContract: ASSET,
      tokenName: "mock",
      spendContract: `${ROUTER.split(".")[0]}.privara-sponsored-spend-v2`,
      feeRecipient: RELAYER,
      exactTokenSponsorFee: 100n,
      maxIntentAmount: 1_000_000n,
      maxRelayerFeeBps: 100,
      maxSweepAmount: 1_000_000n,
      maxSponsorFee: 10_000n,
      maxTransactionBytes: 4_096,
      sponsorshipsPerWindow: 10,
      sponsorshipWindowMs: 60_000,
      stacksApiUrl: "https://api.test",
    };
    await expect(findKnownStealthOrigin(
      RECIPIENT,
      ASSET,
      config,
      vi.fn(async () => Response.json({ results: [broken, settlementLog()] })) as typeof fetch,
      invalid
    )).resolves.toBe(true);
    expect(invalid).toHaveBeenCalledOnce();
  });

  it("stores only deduplicated public records", () => {
    const record = parseStealthSettlementLog(settlementLog())!;
    const store = new MemoryAnnouncementStore();
    expect(store.put([record, record])).toBe(1);
    expect(store.size).toBe(1);
    expect(store.all()[0]).toEqual(record);
    expect("privacySeed" in store.all()[0]).toBe(false);
    expect("viewingPrivateKey" in store.all()[0]).toBe(false);
    expect("spendingPrivateKey" in store.all()[0]).toBe(false);
  });

  it("rejects page sizes above Hiro's supported maximum", async () => {
    await expect(
      fetchAnnouncementPage({ apiUrl: "https://api.test/", router: ROUTER, limit: 101 })
    ).rejects.toThrow("integer from 1 to 100");
  });
});
