import { describe, expect, it, vi } from "vitest";
import { bytesToHex } from "@stacks/common";
import { Cl, serializeCVBytes } from "@stacks/transactions";
import { Point } from "@noble/secp256k1";
import {
  fetchStxAnnouncementPage,
  hashStealthAnnouncement,
  parseStxSettlementLog,
  type HiroContractLog,
  type StealthAnnouncementPayload,
} from "../sdk/src";

const CONTRACT = "SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE.privara-stx-router-v1";
const RECIPIENT = "SP000000000000000000002Q6VF78";
const PAYER = "SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE";

function payload(): StealthAnnouncementPayload {
  return { version: 1, stealthPrincipal: RECIPIENT, ephemeralPublicKey: Point.BASE.multiply(29n).toRawBytes(true), nonce: new Uint8Array(12).fill(1), ciphertext: new Uint8Array(24).fill(2), asset: CONTRACT, registryEpoch: 3n };
}
function log(input = payload()): HiroContractLog {
  const value = Cl.tuple({
    event: Cl.stringAscii("stealth-stx-settlement"),
    "announcement-hash": Cl.buffer(hashStealthAnnouncement(input)),
    version: Cl.uint(input.version),
    "stealth-principal": Cl.principal(input.stealthPrincipal),
    "ephemeral-key": Cl.buffer(input.ephemeralPublicKey),
    nonce: Cl.buffer(input.nonce),
    ciphertext: Cl.buffer(input.ciphertext),
    asset: Cl.principal(input.asset),
    "registry-epoch": Cl.uint(input.registryEpoch),
    amount: Cl.uint(101_000),
    "relayer-fee": Cl.uint(1_000),
    relayer: Cl.principal(PAYER),
    "payment-nonce": Cl.uint(42),
  });
  return { event_index: 1, event_type: "smart_contract_log", tx_id: `0x${"ab".repeat(32)}`, contract_log: { contract_id: CONTRACT, topic: "print", value: { hex: `0x${bytesToHex(serializeCVBytes(value))}` } } };
}

describe("native STX announcement indexer", () => {
  it("decodes a valid payment", () => {
    expect(parseStxSettlementLog(log())?.amount).toBe(101_000n);
  });

  it("skips one malformed record and continues the page", async () => {
    const broken = log();
    broken.contract_log.value.hex = "0x00";
    const invalid = vi.fn();
    const page = await fetchStxAnnouncementPage({
      apiUrl: "https://api.test",
      router: CONTRACT,
      fetcher: vi.fn(async () => Response.json({ results: [broken, log()] })) as typeof fetch,
      onInvalid: invalid,
    });
    expect(page.announcements).toHaveLength(1);
    expect(invalid).toHaveBeenCalledOnce();
  });
});
