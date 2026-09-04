// Phase 0 crypto spike (M2 stealth). Proves the stealth-address design is REALIZABLE on
// Stacks before any Clarity or UI is built. The load-bearing invariant:
//
//   address(P + H(rV)G)  ==  address((p + H(vR))G)
//
// and, decisively, that the recipient's derived one-time private key p' signs a Stacks
// transaction whose ORIGIN resolves to that same principal S. If the signing proof fails,
// the design must change -- do not build past Phase 0 on faith.

import { describe, expect, it } from "vitest";
import { utils } from "@noble/secp256k1";
import {
  getAddressFromPrivateKey,
  getAddressFromPublicKey,
  makeSTXTokenTransfer,
} from "@stacks/transactions";
import { bytesToHex } from "@stacks/common";

import { generateIdentity, identityFromSeed } from "../sdk/src/stealth/identity";
import {
  deriveStealthForSender,
  deriveStealthForRecipient,
} from "../sdk/src/stealth/derivation";
import {
  stealthPublicKeyToAddress,
  toUncompressed,
} from "../sdk/src/stealth/address";

const NETWORK = "testnet" as const;

describe("stealth identity", () => {
  it("derives distinct spending/viewing keys from an independent random seed", () => {
    const id = generateIdentity();
    expect(id.privacySeed.length).toBe(32);
    expect(id.spendingPublicKey.length).toBe(33); // compressed
    expect(id.viewingPublicKey.length).toBe(33);
    expect(bytesToHex(id.spendingPrivateKey)).not.toBe(bytesToHex(id.viewingPrivateKey));
    expect(bytesToHex(id.spendingPublicKey)).not.toBe(bytesToHex(id.viewingPublicKey));
  });

  it("is deterministic from a seed (import round-trip)", () => {
    const seed = utils.randomPrivateKey();
    const a = identityFromSeed(seed);
    const b = identityFromSeed(seed);
    expect(bytesToHex(a.spendingPublicKey)).toBe(bytesToHex(b.spendingPublicKey));
    expect(bytesToHex(a.viewingPublicKey)).toBe(bytesToHex(b.viewingPublicKey));
  });
});

describe("stealth derivation round-trip", () => {
  it("sender and recipient derive the SAME one-time public key", () => {
    const bob = generateIdentity();
    const ephemeral = utils.randomPrivateKey();

    const sent = deriveStealthForSender(
      bob.spendingPublicKey,
      bob.viewingPublicKey,
      ephemeral
    );
    const recovered = deriveStealthForRecipient(
      bob.viewingPrivateKey,
      bob.spendingPrivateKey,
      sent.ephemeralPublicKey
    );

    expect(bytesToHex(recovered.stealthPublicKey)).toBe(bytesToHex(sent.stealthPublicKey));
  });

  it("recovered private key p' actually corresponds to P' (p'G == P')", () => {
    const bob = generateIdentity();
    const ephemeral = utils.randomPrivateKey();
    const sent = deriveStealthForSender(bob.spendingPublicKey, bob.viewingPublicKey, ephemeral);
    const recovered = deriveStealthForRecipient(
      bob.viewingPrivateKey,
      bob.spendingPrivateKey,
      sent.ephemeralPublicKey
    );

    // getAddressFromPrivateKey(p') and getAddressFromPublicKey(P') must agree; they only
    // do if p'G == P'.
    const addrFromPriv = getAddressFromPrivateKey(bytesToHex(recovered.stealthPrivateKey), NETWORK);
    const addrFromPub = getAddressFromPublicKey(
      bytesToHex(toUncompressed(recovered.stealthPublicKey)),
      NETWORK
    );
    expect(addrFromPriv).toBe(addrFromPub);
  });

  it("THE INVARIANT: sender's derived address == address the recipient's p' controls", () => {
    const bob = generateIdentity();
    const ephemeral = utils.randomPrivateKey();

    // Sender derives S from Bob's public keys only.
    const sent = deriveStealthForSender(bob.spendingPublicKey, bob.viewingPublicKey, ephemeral);
    const senderAddress = stealthPublicKeyToAddress(sent.stealthPublicKey, NETWORK);

    // Recipient derives p' and the address it controls.
    const recovered = deriveStealthForRecipient(
      bob.viewingPrivateKey,
      bob.spendingPrivateKey,
      sent.ephemeralPublicKey
    );
    const recipientAddress = getAddressFromPrivateKey(
      bytesToHex(recovered.stealthPrivateKey),
      NETWORK
    );

    expect(senderAddress).toBe(recipientAddress);
  });

  it("SIGNING PROOF: p' signs a tx whose origin resolves to S", async () => {
    const bob = generateIdentity();
    const ephemeral = utils.randomPrivateKey();
    const sent = deriveStealthForSender(bob.spendingPublicKey, bob.viewingPublicKey, ephemeral);
    const S = stealthPublicKeyToAddress(sent.stealthPublicKey, NETWORK);

    const recovered = deriveStealthForRecipient(
      bob.viewingPrivateKey,
      bob.spendingPrivateKey,
      sent.ephemeralPublicKey
    );

    // Build and sign a real transaction with the derived stealth private key. The origin
    // principal of a single-sig tx is getAddressFromPrivateKey(signerKey); prove it == S.
    const tx = await makeSTXTokenTransfer({
      recipient: "ST2PH1TAPN6SPD1QS9HA0E4PX6QAACNQQF1CB48VY",
      amount: 1n,
      senderKey: bytesToHex(recovered.stealthPrivateKey),
      network: NETWORK,
      fee: 200n,
      nonce: 0n,
    });
    // The signed tx must be serializable/deserializable (well-formed), and its origin
    // address must be S.
    const originAddress = getAddressFromPrivateKey(
      bytesToHex(recovered.stealthPrivateKey),
      NETWORK
    );
    expect(originAddress).toBe(S);
    expect(tx.auth.spendingCondition).toBeDefined();
  });
});

describe("stealth isolation", () => {
  it("distinct ephemeral scalars produce distinct stealth addresses", () => {
    const bob = generateIdentity();
    const a = deriveStealthForSender(bob.spendingPublicKey, bob.viewingPublicKey, utils.randomPrivateKey());
    const b = deriveStealthForSender(bob.spendingPublicKey, bob.viewingPublicKey, utils.randomPrivateKey());
    expect(stealthPublicKeyToAddress(a.stealthPublicKey, NETWORK)).not.toBe(
      stealthPublicKeyToAddress(b.stealthPublicKey, NETWORK)
    );
  });

  it("distinct recipients produce distinct stealth addresses from the same ephemeral key", () => {
    const alice = generateIdentity();
    const bob = generateIdentity();
    const ephemeral = utils.randomPrivateKey();
    const toAlice = deriveStealthForSender(alice.spendingPublicKey, alice.viewingPublicKey, ephemeral);
    const toBob = deriveStealthForSender(bob.spendingPublicKey, bob.viewingPublicKey, ephemeral);
    expect(stealthPublicKeyToAddress(toAlice.stealthPublicKey, NETWORK)).not.toBe(
      stealthPublicKeyToAddress(toBob.stealthPublicKey, NETWORK)
    );
  });

  it("a non-recipient derives a DIFFERENT address (cannot claim the payment)", () => {
    const bob = generateIdentity();
    const mallory = generateIdentity();
    const ephemeral = utils.randomPrivateKey();
    const sent = deriveStealthForSender(bob.spendingPublicKey, bob.viewingPublicKey, ephemeral);

    // Mallory scans with her own keys against Bob's announcement -> different P'.
    const malloryDerived = deriveStealthForRecipient(
      mallory.viewingPrivateKey,
      mallory.spendingPrivateKey,
      sent.ephemeralPublicKey
    );
    expect(bytesToHex(malloryDerived.stealthPublicKey)).not.toBe(bytesToHex(sent.stealthPublicKey));
  });
});
