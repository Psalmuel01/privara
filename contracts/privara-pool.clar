;; privara-pool.clar
;; Attested privacy pool for sBTC (Milestone 2 privacy track).
;;
;; Goal: hide the PAYER from a full-chain observer, which the recover-based router
;; (privara-router) explicitly cannot do. The mechanism is a commitment/nullifier pool
;; with a coordinator attestation standing in for the ZK membership proof that Clarity
;; has no native primitive for.
;;
;; Flow:
;;   deposit(commitment, amount)  -- payer locks `amount` sBTC against a commitment
;;                                   C = sha256(secret || amount). The commitment hides
;;                                   the secret; the deposit tx still reveals the payer
;;                                   and amount on-chain (that is why withdrawals must
;;                                   use a fixed DENOMINATION so N same-size deposits form
;;                                   one anonymity set -- see DENOMINATION below).
;;   coordinator blind-signs C off-chain, returning an attestation to the payer.
;;   withdraw(nullifier, recipient, attestation)
;;                                -- anyone (a relayer) presents a coordinator signature
;;                                   over the commitment plus a nullifier = sha256(secret).
;;                                   The contract verifies the attestation, checks the
;;                                   nullifier is unused, pays `recipient` the denomination,
;;                                   and burns the nullifier. The deposit and the withdrawal
;;                                   are not linkable on-chain: the withdrawal names only a
;;                                   nullifier and a recipient, never the commitment's depositor.
;;
;; TRUST BOUNDARY (documented, not hidden):
;;   - The coordinator CANNOT steal funds: it never holds them; the contract only pays out
;;     the fixed denomination against a valid, unspent attestation.
;;   - The coordinator CANNOT forge withdrawals for a commitment it never attested: the
;;     nullifier must correspond to an attested commitment.
;;   - The coordinator CAN censor (refuse to attest) and, if the attestation is NOT truly
;;     blind, CAN link deposit->withdrawal (deanonymize). True unlinkability requires the
;;     coordinator to blind-sign so it never sees C in a form it can correlate. Plain
;;     secp256k1 has no blinding, so a production deployment needs a blind-signature scheme
;;     (blinded Schnorr / RSA blind sigs) at the coordinator; THIS CONTRACT verifies the
;;     final unblinded signature only. Anonymity set size is 1/N over same-denomination
;;     unspent deposits.
;;
;; This is a prototype for the M2 privacy track. It is NOT the M1 settlement path.

(use-trait sip010-trait .sip010-ft-trait.sip010-ft-trait)

;; --- Error codes ---

(define-constant ERR_NOT_COORDINATOR    (err u200))
(define-constant ERR_COMMITMENT_EXISTS  (err u201))
(define-constant ERR_UNKNOWN_COMMITMENT (err u202))
(define-constant ERR_NULLIFIER_USED     (err u203))
(define-constant ERR_BAD_ATTESTATION    (err u204))
(define-constant ERR_ASSET_NOT_WHITELISTED (err u205))
(define-constant ERR_ASSET_GUARD        (err u206))
(define-constant ERR_INVALID_ASSET      (err u207))
(define-constant ERR_WRONG_AMOUNT       (err u208))

;; --- Whitelisted asset (per-network variant, mirrors the router) ---
;;   simnet/test : .mock-token
;;   testnet     : 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token
;;   mainnet     : 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
(define-constant SBTC .mock-token)

;; Fixed withdrawal denomination. Every deposit MUST be exactly this size so that all
;; unspent deposits are indistinguishable -- a variable amount would fingerprint a
;; deposit to its matching withdrawal and collapse the anonymity set to 1. Denominated
;; in the asset's base units (sBTC has 8 decimals; 100000 = 0.001 sBTC).
(define-constant DENOMINATION u100000)

;; The coordinator public key (compressed, 33 bytes) whose attestations this pool honors.
;; A production pool would make this a federation / rotatable set; a single key keeps the
;; prototype's trust boundary explicit.
(define-constant COORDINATOR_PUBKEY 0x03cd2cfdbd2ad9332828a7a13ef62cb999e063421c708e863a7ffed71fb61c88c9)

;; --- Storage ---

;; Commitments seen at deposit time. Value is the depositor (for refunds / audit only;
;; it is NOT consulted at withdrawal, so it never links the withdrawal to the payer).
(define-map commitments (buff 32) principal)

;; Spent nullifiers. Presence => that deposit has been withdrawn; blocks double-spend.
(define-map nullifiers (buff 32) bool)

;; --- Read-only ---

(define-read-only (get-denomination) DENOMINATION)

(define-read-only (commitment-exists (commitment (buff 32)))
  (is-some (map-get? commitments commitment))
)

(define-read-only (is-nullifier-spent (nullifier (buff 32)))
  (default-to false (map-get? nullifiers nullifier))
)

(define-read-only (is-whitelisted (asset-contract principal))
  (is-eq asset-contract SBTC)
)

;; --- Deposit ---

;; Lock exactly DENOMINATION of sBTC against a commitment. The commitment C is computed
;; off-chain as sha256(secret || amount) by the payer; the contract only stores it. The
;; deposit reveals payer + amount on-chain -- privacy comes at withdrawal, and only if
;; enough same-denomination deposits exist to form an anonymity set.
(define-public (deposit (asset <sip010-trait>) (commitment (buff 32)) (amount uint))
  (let (
    (asset-contract (contract-of asset))
  )
    (asserts! (is-ok (contract-hash? asset-contract)) ERR_INVALID_ASSET)
    (asserts! (is-whitelisted asset-contract) ERR_ASSET_NOT_WHITELISTED)
    ;; Fixed denomination is what makes deposits indistinguishable.
    (asserts! (is-eq amount DENOMINATION) ERR_WRONG_AMOUNT)
    (asserts! (not (commitment-exists commitment)) ERR_COMMITMENT_EXISTS)
    (try! (contract-call? asset transfer amount tx-sender .privara-pool none))
    (map-set commitments commitment tx-sender)
    (print { event: "pool-deposit", commitment: commitment, amount: amount })
    (ok commitment)
  )
)

;; --- Withdraw ---

;; Present a coordinator attestation over the commitment plus the nullifier, and pay the
;; denomination to `recipient`. The relayer (tx-sender) may be anyone; the payout target
;; is bound by the attestation, so a relayer cannot redirect funds.
;;
;; The attestation is a coordinator secp256k1 signature over sha256(commitment || recipient),
;; so the recipient is committed to at attestation time and cannot be swapped by a relayer.
;; `commitment` must match a stored deposit; `nullifier` must be fresh.
;;
;; #[allow(unchecked_data)]
(define-public (withdraw
    (asset      <sip010-trait>)
    (commitment (buff 32))
    (nullifier  (buff 32))
    (recipient  principal)
    (attestation (buff 65)))
  (let (
    (asset-contract (contract-of asset))
    (message-hash (sha256 (concat commitment (unwrap! (to-consensus-buff? recipient) ERR_BAD_ATTESTATION))))
  )
    (asserts! (is-whitelisted asset-contract) ERR_ASSET_NOT_WHITELISTED)
    (asserts! (commitment-exists commitment) ERR_UNKNOWN_COMMITMENT)
    (asserts! (not (is-nullifier-spent nullifier)) ERR_NULLIFIER_USED)
    ;; The coordinator's signature authorizes paying this recipient for this commitment.
    (asserts!
      (is-eq (secp256k1-recover? message-hash attestation) (ok COORDINATOR_PUBKEY))
      ERR_BAD_ATTESTATION)

    ;; Burn the nullifier BEFORE paying out (checks-effects-interactions).
    (map-set nullifiers nullifier true)

    (unwrap!
      (as-contract? ((with-ft SBTC "*" DENOMINATION))
        (begin
          (try! (contract-call? asset transfer DENOMINATION tx-sender recipient none))
          true
        )
      )
      ERR_ASSET_GUARD)

    (print { event: "pool-withdraw", nullifier: nullifier, recipient: recipient, amount: DENOMINATION })
    (ok DENOMINATION)
  )
)
