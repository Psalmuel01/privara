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
(define-constant ERR_ASSET_NOT_WHITELISTED (err u109))

;; --- Whitelisted asset (per-network variant) ---
;; A scoped (with-ft ...) allowance requires the token's contract principal AND
;; its internal define-fungible-token name as literals, neither of which the
;; SIP-010 trait exposes. So the router whitelists a single known asset and holds
;; its allowance in a literal. R1 simnet experiment confirmed: a (define-constant)
;; principal is accepted in with-ft, and a literal referencing a principal absent
;; on the deploy network still checks clean, so this one constant is the only line
;; that changes per network.
;;   simnet/test : .mock-token          (this file, as committed)
;;   testnet     : 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token
;;   mainnet     : 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
;; SBTC_ASSET_NAME is the internal ft name: "mock" for mock-token, "sbtc-token" for sBTC.
(define-constant SBTC .mock-token)
(define-constant SBTC_ASSET_NAME "mock")

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
    ;; Whitelist at the door: only the whitelisted asset may be deposited. Without
    ;; this, a user could deposit a non-whitelisted token that withdraw/settle (both
    ;; whitelist-gated) would then refuse to move, trapping the funds permanently.
    (asserts! (is-whitelisted asset-contract) ERR_ASSET_NOT_WHITELISTED)
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

;; --- Scoped asset movement (private) ---
;; These helpers hold the literal (with-ft SBTC SBTC_ASSET_NAME ...) allowance so
;; every router-initiated transfer is bounded to the whitelisted asset and a fixed
;; amount. Callers must first assert the incoming trait asset is the whitelisted one
;; (is-whitelisted below); otherwise the trait `asset` and the literal SBTC allowance
;; would name different tokens and the as-contract? boundary would roll back (err u128).
;; R1 confirmed a <sip010-trait> can be passed into a private fn holding a literal with-ft.

(define-read-only (is-whitelisted (asset-contract principal))
  (is-eq asset-contract SBTC)
)

;; Moves the settlement: net-amount to recipient, plus relayer-fee to relayer when
;; non-zero. One allowance of `amount` (= net + fee) caps the total outflow.
(define-private (settle-transfer
  (asset       <sip010-trait>)
  (amount      uint)
  (net-amount  uint)
  (recipient   principal)
  (relayer-fee uint)
  (relayer     principal))
  (as-contract? ((with-ft SBTC SBTC_ASSET_NAME amount))
    (begin
      (try! (contract-call? asset transfer net-amount tx-sender recipient none))
      (if (> relayer-fee u0)
        (try! (contract-call? asset transfer relayer-fee tx-sender relayer none))
        true
      )
    )
  )
)

;; Moves `amount` of the whitelisted asset back to `owner` on withdraw.
(define-private (withdraw-transfer
  (asset  <sip010-trait>)
  (amount uint)
  (owner  principal))
  (as-contract? ((with-ft SBTC SBTC_ASSET_NAME amount))
    (begin
      (try! (contract-call? asset transfer amount tx-sender owner none))
      true
    )
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
;; Asset movement goes through settle-transfer, which holds a scoped (with-ft ...)
;; allowance for the whitelisted asset only (no with-all-assets-unsafe).
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
    ;; Whitelist first: settle-transfer's allowance names SBTC literally, so a
    ;; non-whitelisted asset must be rejected here with a clear code rather than
    ;; rolled back later as an opaque allowance violation (u128).
    (asserts! (is-whitelisted asset-contract)  ERR_ASSET_NOT_WHITELISTED)
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

      ;; Scoped allowance via settle-transfer: the router may move at most `amount`
      ;; of the whitelisted SBTC asset (net to recipient + fee to relayer) and nothing
      ;; else. The is-whitelisted assert above guarantees `asset` IS SBTC, so the trait
      ;; object and the literal allowance inside settle-transfer name the same token.
      ;; recipient/relayer are part of the signature-verified intent tuple (the digest
      ;; recovered to `user`), so they are authorized despite being caller-supplied.
      ;; #[allow(unchecked_data)]
      (try! (settle-transfer asset amount net-amount recipient relayer-fee relayer))
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
    ;; Whitelist first: withdraw-transfer's allowance names SBTC literally, so a
    ;; non-whitelisted asset must be rejected here rather than rolled back as u128.
    (asserts! (is-whitelisted asset-contract) ERR_ASSET_NOT_WHITELISTED)
    (asserts! (> amount u0)            ERR_AMOUNT_TOO_LOW)
    (asserts! (>= user-balance amount) ERR_INSUFFICIENT_FUNDS)

    ;; Debit before the external transfer (checks-effects-interactions).
    (map-set deposits { user: owner, asset: asset-contract } (- user-balance amount))
    ;; Scoped allowance via withdraw-transfer: bounded to `amount` of SBTC only.
    (try! (withdraw-transfer asset amount owner))
    (print {
      event:  "withdraw",
      user:   owner,
      asset:  asset-contract,
      amount: amount,
    })
    (ok amount)
  )
)