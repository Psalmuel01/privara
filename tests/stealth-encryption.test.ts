import { describe, expect, it } from "vitest";
import { bytesToHex } from "@stacks/common";
import { utils } from "@noble/secp256k1";
import { getAddressFromPrivateKey } from "@stacks/transactions";

import { exportPrivacySeed, importPrivacySeed } from "../sdk/src/stealth/backup";
import {
  hashStealthAnnouncement,
  serializeStealthAnnouncement,
} from "../sdk/src/stealth/announcement";
import { stealthPublicKeyToAddress } from "../sdk/src/stealth/address";
import { deriveStealthForSender } from "../sdk/src/stealth/derivation";
import {
  decryptStealthNote,
  encryptStealthNote,
  type AnnouncementContext,
} from "../sdk/src/stealth/encryption";
import { generateIdentity, identityFromSeed } from "../sdk/src/stealth/identity";
import { scanAnnouncement, scanAnnouncements } from "../sdk/src/stealth/scanning";

const NETWORK = "testnet" as const;
const ROUTER = "ST000000000000000000002AMW42H.privara-router-m2";
const ASSET = "ST000000000000000000002AMW42H.mock-token";

function setupPayment() {
  const recipient = generateIdentity();
  const ephemeralPrivateKey = utils.randomPrivateKey();
  const derived = deriveStealthForSender(
    recipient.spendingPublicKey,
    recipient.viewingPublicKey,
    ephemeralPrivateKey
  );
  const stealthPrincipal = stealthPublicKeyToAddress(derived.stealthPublicKey, NETWORK);
  const context: AnnouncementContext = {
    network: NETWORK,
    router: ROUTER,
    stealthPrincipal,
    asset: ASSET,
    registryEpoch: 1n,
  };
  return { recipient, ephemeralPrivateKey, derived, stealthPrincipal, context };
}

describe("stealth note encryption", () => {
  it("round-trips with sender rV and recipient vR", async () => {
    const payment = setupPayment();
    const plaintext = new TextEncoder().encode('{"memo":"invoice-42"}');
    const note = await encryptStealthNote(
      plaintext,
      payment.recipient.viewingPublicKey,
      payment.ephemeralPrivateKey,
      payment.context
    );
    const decrypted = await decryptStealthNote(
      note,
      payment.recipient.viewingPrivateKey,
      payment.derived.ephemeralPublicKey,
      payment.context
    );
    expect(new TextDecoder().decode(decrypted)).toBe('{"memo":"invoice-42"}');
  });

  it("rejects corrupted ciphertext", async () => {
    const payment = setupPayment();
    const note = await encryptStealthNote(
      new Uint8Array([1, 2, 3]),
      payment.recipient.viewingPublicKey,
      payment.ephemeralPrivateKey,
      payment.context
    );
    const corrupted = { ...note, ciphertext: new Uint8Array(note.ciphertext) };
    corrupted.ciphertext[0] ^= 0x01;
    await expect(
      decryptStealthNote(
        corrupted,
        payment.recipient.viewingPrivateKey,
        payment.derived.ephemeralPublicKey,
        payment.context
      )
    ).rejects.toThrow("authentication failed");
  });

  it("binds ciphertext to router, destination, asset, network, and epoch", async () => {
    const payment = setupPayment();
    const note = await encryptStealthNote(
      new Uint8Array([9]),
      payment.recipient.viewingPublicKey,
      payment.ephemeralPrivateKey,
      payment.context
    );
    await expect(
      decryptStealthNote(
        note,
        payment.recipient.viewingPrivateKey,
        payment.derived.ephemeralPublicKey,
        { ...payment.context, registryEpoch: 2n }
      )
    ).rejects.toThrow("authentication failed");
  });
});

describe("canonical announcement", () => {
  it("has a deterministic consensus-serialized hash", () => {
    const identity = identityFromSeed(
      Uint8Array.from(Array.from({ length: 32 }, (_, index) => index))
    );
    const derived = deriveStealthForSender(
      identity.spendingPublicKey,
      identity.viewingPublicKey,
      Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1))
    );
    const stealthPrincipal = stealthPublicKeyToAddress(derived.stealthPublicKey, NETWORK);
    const payload = {
      version: 1 as const,
      stealthPrincipal,
      ephemeralPublicKey: derived.ephemeralPublicKey,
      nonce: Uint8Array.from(Array.from({ length: 12 }, (_, index) => index)),
      ciphertext: Uint8Array.from(Array.from({ length: 16 }, (_, index) => 0xa0 + index)),
      asset: ASSET,
      registryEpoch: 1n,
    };
    expect(serializeStealthAnnouncement(payload).length).toBeGreaterThan(100);
    expect(hashStealthAnnouncement(payload)).toHaveLength(32);
    expect(bytesToHex(hashStealthAnnouncement(payload))).toBe(
      "18b30d03c6570fb829a033d2e9ab253779ffb4226f70557790dbb413bb03c837"
    );
  });

  it("rejects ciphertext that cannot contain an authentication tag", () => {
    const payment = setupPayment();
    expect(() =>
      hashStealthAnnouncement({
        version: 1,
        stealthPrincipal: payment.stealthPrincipal,
        ephemeralPublicKey: payment.derived.ephemeralPublicKey,
        nonce: new Uint8Array(12),
        ciphertext: new Uint8Array(15),
        asset: ASSET,
        registryEpoch: 1n,
      })
    ).toThrow("authentication tag");
  });
});

describe("announcement scanning", () => {
  it("detects with a viewing key and does not expose a spending key in watch-only mode", async () => {
    const payment = setupPayment();
    const note = await encryptStealthNote(
      new TextEncoder().encode("received"),
      payment.recipient.viewingPublicKey,
      payment.ephemeralPrivateKey,
      payment.context
    );
    const detected = await scanAnnouncement(
      {
        stealthPrincipal: payment.stealthPrincipal,
        ephemeralPublicKey: payment.derived.ephemeralPublicKey,
        note,
        context: payment.context,
      },
      payment.recipient.viewingPrivateKey,
      payment.recipient.spendingPublicKey,
      NETWORK
    );
    expect(detected?.stealthPrincipal).toBe(payment.stealthPrincipal);
    expect(detected?.stealthPrivateKey).toBeUndefined();
  });

  it("derives spending authority only when the spending private key is supplied", async () => {
    const payment = setupPayment();
    const note = await encryptStealthNote(
      new Uint8Array([7]),
      payment.recipient.viewingPublicKey,
      payment.ephemeralPrivateKey,
      payment.context
    );
    const detected = await scanAnnouncement(
      {
        stealthPrincipal: payment.stealthPrincipal,
        ephemeralPublicKey: payment.derived.ephemeralPublicKey,
        note,
        context: payment.context,
      },
      payment.recipient.viewingPrivateKey,
      payment.recipient.spendingPublicKey,
      NETWORK,
      payment.recipient.spendingPrivateKey
    );
    expect(detected?.stealthPrivateKey).toBeDefined();
    expect(
      getAddressFromPrivateKey(bytesToHex(detected!.stealthPrivateKey!), NETWORK)
    ).toBe(payment.stealthPrincipal);
  });

  it("does not detect another recipient's payment", async () => {
    const payment = setupPayment();
    const other = generateIdentity();
    const note = await encryptStealthNote(
      new Uint8Array([4]),
      payment.recipient.viewingPublicKey,
      payment.ephemeralPrivateKey,
      payment.context
    );
    const detected = await scanAnnouncement(
      {
        stealthPrincipal: payment.stealthPrincipal,
        ephemeralPublicKey: payment.derived.ephemeralPublicKey,
        note,
        context: payment.context,
      },
      other.viewingPrivateKey,
      other.spendingPublicKey,
      NETWORK
    );
    expect(detected).toBeNull();
  });

  it("skips malformed candidates without aborting a batch", async () => {
    const payment = setupPayment();
    const note = await encryptStealthNote(
      new Uint8Array([5]),
      payment.recipient.viewingPublicKey,
      payment.ephemeralPrivateKey,
      payment.context
    );
    const valid = {
      stealthPrincipal: payment.stealthPrincipal,
      ephemeralPublicKey: payment.derived.ephemeralPublicKey,
      note,
      context: payment.context,
    };
    const malformed = { ...valid, ephemeralPublicKey: new Uint8Array(33) };
    const detected = await scanAnnouncements(
      [malformed, valid],
      payment.recipient.viewingPrivateKey,
      payment.recipient.spendingPublicKey,
      NETWORK
    );
    expect(detected).toHaveLength(1);
  });

  it("partitions 200 mixed announcements so only each intended recipient detects them", async () => {
    const alice = generateIdentity();
    const bob = generateIdentity();
    const candidates = [];
    const aliceMemos: string[] = [];
    const bobMemos: string[] = [];

    for (let index = 0; index < 200; index++) {
      const intended = index % 2 === 0 ? alice : bob;
      const ephemeralPrivateKey = utils.randomPrivateKey();
      const derived = deriveStealthForSender(
        intended.spendingPublicKey,
        intended.viewingPublicKey,
        ephemeralPrivateKey
      );
      const stealthPrincipal = stealthPublicKeyToAddress(derived.stealthPublicKey, NETWORK);
      const context: AnnouncementContext = {
        network: NETWORK,
        router: ROUTER,
        stealthPrincipal,
        asset: ASSET,
        registryEpoch: 1n,
      };
      const memo = `payment-${index}`;
      const note = await encryptStealthNote(
        new TextEncoder().encode(memo),
        intended.viewingPublicKey,
        ephemeralPrivateKey,
        context
      );
      candidates.push({
        stealthPrincipal,
        ephemeralPublicKey: derived.ephemeralPublicKey,
        note,
        context,
      });
      (index % 2 === 0 ? aliceMemos : bobMemos).push(memo);
    }

    const [forAlice, forBob] = await Promise.all([
      scanAnnouncements(candidates, alice.viewingPrivateKey, alice.spendingPublicKey, NETWORK),
      scanAnnouncements(candidates, bob.viewingPrivateKey, bob.spendingPublicKey, NETWORK),
    ]);
    expect(forAlice.map((payment) => new TextDecoder().decode(payment.plaintext))).toEqual(
      aliceMemos
    );
    expect(forBob.map((payment) => new TextDecoder().decode(payment.plaintext))).toEqual(
      bobMemos
    );
    expect(forAlice).toHaveLength(100);
    expect(forBob).toHaveLength(100);
  }, 20_000);
});

describe("privacy seed backup", () => {
  it("exports and imports an authenticated encrypted recovery root", async () => {
    const identity = generateIdentity();
    const backup = await exportPrivacySeed(identity.privacySeed, "correct horse battery staple");
    const restoredSeed = await importPrivacySeed(backup, "correct horse battery staple");
    const restored = identityFromSeed(restoredSeed);
    expect(bytesToHex(restoredSeed)).toBe(bytesToHex(identity.privacySeed));
    expect(bytesToHex(restored.spendingPublicKey)).toBe(bytesToHex(identity.spendingPublicKey));
  });

  it("rejects a wrong password", async () => {
    const backup = await exportPrivacySeed(
      generateIdentity().privacySeed,
      "correct horse battery staple"
    );
    await expect(importPrivacySeed(backup, "wrong password still long")).rejects.toThrow(
      "authentication failed"
    );
  });

  it("rejects tampered backup ciphertext", async () => {
    const backup = await exportPrivacySeed(
      generateIdentity().privacySeed,
      "correct horse battery staple"
    );
    const first = backup.cipher.ciphertext.slice(0, 2) === "00" ? "01" : "00";
    const tampered = {
      ...backup,
      cipher: { ...backup.cipher, ciphertext: first + backup.cipher.ciphertext.slice(2) },
    };
    await expect(importPrivacySeed(tampered, "correct horse battery staple")).rejects.toThrow(
      "authentication failed"
    );
  });
});
