;; privara-router.clar
;; SIP-010 intent settlement contract.
;; Users deposit tokens and sign offchain payment intents.
;; Relayers submit settlement transactions, separating authorization from execution.

(use-trait sip010-trait .sip010-ft-trait.sip010-ft-trait)

;; --- Error codes ---

(define-constant ERR_INTENT_USED        (err u100))
(define-constant ERR_INTENT_EXPIRED     (err u101))
(define-constant ERR_INVALID_SIG        (err u102))
(define-constant ERR_NONCE_MISMATCH     (err u103))
(define-constant ERR_INSUFFICIENT_FUNDS (err u104))
(define-constant ERR_AMOUNT_TOO_LOW     (err u105))
;; u106 (ERR_INVALID_PUBKEY) retired: the signer is recovered from the signature
;; via secp256k1-recover?, so there is no caller-supplied pubkey that could be
;; invalid. Left as a numbering gap rather than renumbered, to keep u107/u108
;; stable for the SDK and existing test references.
(define-constant ERR_INVALID_ASSET      (err u107))
(define-constant ERR_HASH_FAILED        (err u108))

;; --- SIP-018 structured-data signing domain ---
;; Intents are signed as SIP-018 structured data so browser wallets (Leather,
;; Xverse) can sign them natively in M2. The digest binds chain-id, so a
;; signature made for testnet can never be replayed on mainnet (and vice versa).
;; Verified byte-for-byte against the TypeScript SDK in the SIP-018 spike.
(define-constant STRUCTURED_DATA_PREFIX 0x534950303138) ;; ascii "SIP018"

(define-constant MESSAGE_DOMAIN_HASH
  (sha256 (unwrap-panic (to-consensus-buff?
    { name: "privara", version: "1", chain-id: chain-id }))))

;; --- Storage ---

;; Replay protection: settled intent hashes cannot be reused.
(define-map settled-intents (buff 32) bool)

;; Per-user nonce prevents intent reordering and double-submission.
(define-map user-nonces principal uint)

;; Per-user per-asset balances deposited to the router.
(define-map deposits { user: principal, asset: principal } uint)

;; --- Read-only ---

(define-read-only (get-nonce (user principal))
  (default-to u0 (map-get? user-nonces user))
)

(define-read-only (is-intent-settled (intent-hash (buff 32)))
  (default-to false (map-get? settled-intents intent-hash))
)

(define-read-only (get-deposit (user principal) (asset principal))
  (default-to u0 (map-get? deposits { user: user, asset: asset }))
)

;; --- SIP-018 intent digest ---

;; The intent is a Clarity tuple, consensus-serialized and hashed. The SDK
;; produces the identical structured-data hash with serializeCVBytes(tupleCV(...)),
;; asserted byte-for-byte by the SDK<->contract parity test. Field set and order
;; here are the contract with the SDK: changing either side breaks every signature.
(define-read-only (hash-intent
  (asset       principal)
  (amount      uint)
  (recipient   principal)
  (relayer     principal)
  (relayer-fee uint)
  (nonce       uint)
  (expiry      uint))
  (match (to-consensus-buff? {
      asset:       asset,
      amount:      amount,
      recipient:   recipient,
      relayer:     relayer,
      relayer-fee: relayer-fee,
      nonce:       nonce,
      expiry:      expiry,
    })
    serialized (ok (sha256 serialized))
    ERR_HASH_FAILED)
)

;; Full SIP-018 message digest that the user actually signs:
;;   sha256(0x534950303138 || domain-hash || structured-data-hash)
;; This is what secp256k1-recover? recovers the signer from.
(define-read-only (message-digest (structured-data-hash (buff 32)))
  (sha256 (concat STRUCTURED_DATA_PREFIX
          (concat MESSAGE_DOMAIN_HASH structured-data-hash)))
)

;; Read-only helpers exposed for the SDK to assert byte-for-byte parity.
(define-read-only (get-domain-hash) MESSAGE_DOMAIN_HASH)
(define-read-only (get-chain-id) chain-id)

;; --- Deposit ---

;; User deposits SIP-010 tokens into the router before creating intents.
(define-public (deposit (asset <sip010-trait>) (amount uint))
  (let (
    (asset-contract (contract-of asset))
    (current (get-deposit tx-sender asset-contract))
  )
    ;; Verify the asset contract actually exists on-chain (also clears check_checker
    ;; warning on the trait parameter by using it in an asserts! path).
    (asserts! (is-ok (contract-hash? asset-contract)) ERR_INVALID_ASSET)
    (asserts! (> amount u0) ERR_AMOUNT_TOO_LOW)
    (try! (contract-call? asset transfer amount tx-sender .privara-router none))
    (map-set deposits { user: tx-sender, asset: asset-contract } (+ current amount))
    (print {
      event:   "deposit",
      user:    tx-sender,
      asset:   asset-contract,
      amount:  amount,
      balance: (+ current amount),
    })
    (ok amount)
  )
)

;; --- Settle Intent ---

;; Called by a relayer to execute a user-signed payment intent.
;; Verifies the signature, nonce, expiry, and replay protection before settling.
;;
;; Authorization uses secp256k1-recover? + principal-of? (recover the signer from
;; the signature) rather than secp256k1-verify against a caller-supplied pubkey:
;; a Stacks address is a *hash* of the pubkey, so a relayer cannot derive the
;; user's pubkey from their address, so recovery removes that out-of-band burden
;; and 33 bytes of calldata. The caller still names `user`; we assert it equals the
;; recovered signer so a forged signature fails crisply with ERR_INVALID_SIG
;; instead of being misreported downstream as ERR_INSUFFICIENT_FUNDS.
;;
;; with-all-assets-unsafe is used here during prototyping. Production should declare
;; specific (with-ft asset amount) allowances once it is confirmed that the allowance
;; list accepts a dynamic (trait-parameter) contract principal on the Clarity 4 runtime.
(define-public (settle-intent
  (asset       <sip010-trait>)
  (amount      uint)
  (recipient   principal)
  (relayer     principal)
  (relayer-fee uint)
  (nonce       uint)
  (expiry      uint)
  (user        principal)
  (user-sig    (buff 65)))

  (let (
    (asset-contract (contract-of asset))
    (data-hash      (try! (hash-intent asset-contract amount recipient relayer relayer-fee nonce expiry)))
    (digest         (message-digest data-hash))
  )
    ;; Checks that do not depend on the user's identity come first.
    (asserts! (not (is-intent-settled digest)) ERR_INTENT_USED)
    (asserts! (< stacks-block-height expiry)   ERR_INTENT_EXPIRED)
    ;; Strict: the user must receive something. Also guards the net-amount
    ;; subtraction below against a uint underflow (which would abort the tx with a
    ;; runtime error instead of returning this error code).
    (asserts! (> amount relayer-fee)           ERR_AMOUNT_TOO_LOW)

    (let (
      ;; Recover the signer from the signature and require it to match the named user.
      ;; A forged signature recovers to some random principal, so the is-eq guard
      ;; rejects it here rather than letting it fall through to a balance check.
      (recovered-pubkey (unwrap! (secp256k1-recover? digest user-sig) ERR_INVALID_SIG))
      (recovered-signer (unwrap! (principal-of? recovered-pubkey)      ERR_INVALID_SIG))
      (net-amount       (- amount relayer-fee))
      (expected-nonce   (get-nonce user))
      (user-balance     (get-deposit user asset-contract))
    )
      (asserts! (is-eq recovered-signer user) ERR_INVALID_SIG)
      (asserts! (is-eq nonce expected-nonce)  ERR_NONCE_MISMATCH)
      (asserts! (>= user-balance amount)      ERR_INSUFFICIENT_FUNDS)

      (map-set settled-intents digest true)
      (map-set user-nonces user (+ expected-nonce u1))
      (map-set deposits { user: user, asset: asset-contract } (- user-balance amount))

      (try! (as-contract? ((with-all-assets-unsafe))
        (begin
          (try! (contract-call? asset transfer net-amount tx-sender recipient none))
          (if (> relayer-fee u0)
            (try! (contract-call? asset transfer relayer-fee tx-sender relayer none))
            true
          )
        )
      ))
      (print {
        event:       "settle-intent",
        intent-hash: digest,
        user:        user,
        recipient:   recipient,
        relayer:     relayer,
        asset:       asset-contract,
        amount:      amount,
        relayer-fee: relayer-fee,
        nonce:       nonce,
      })
      (ok digest)
    )
  )
)

;; --- Withdraw ---

;; Users reclaim unspent deposits. This is also the self-settle fallback promised in
;; the grant risk disclosure: if every relayer censors a user, they can always pull
;; their own funds back out with no relayer involvement.
(define-public (withdraw (asset <sip010-trait>) (amount uint))
  (let (
    (owner          tx-sender)
    (asset-contract (contract-of asset))
    (user-balance   (get-deposit owner asset-contract))
  )
    (asserts! (is-ok (contract-hash? asset-contract)) ERR_INVALID_ASSET)
    (asserts! (> amount u0)            ERR_AMOUNT_TOO_LOW)
    (asserts! (>= user-balance amount) ERR_INSUFFICIENT_FUNDS)

    ;; Debit before the external transfer (checks-effects-interactions).
    (map-set deposits { user: owner, asset: asset-contract } (- user-balance amount))
    ;; Inside as-contract?, tx-sender is the router, so funds move router -> owner.
    (try! (as-contract? ((with-all-assets-unsafe))
      (begin
        (try! (contract-call? asset transfer amount tx-sender owner none))
        true
      )))
    (print {
      event:  "withdraw",
      user:   owner,
      asset:  asset-contract,
      amount: amount,
    })
    (ok amount)
  )
)