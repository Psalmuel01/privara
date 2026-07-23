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
(define-constant ERR_INVALID_ASSET      (err u106))
(define-constant ERR_HASH_FAILED        (err u107))
(define-constant ERR_ASSET_NOT_WHITELISTED (err u108))
;; as-contract? asset guard rejected a transfer; unreachable given is-whitelisted.
(define-constant ERR_ASSET_GUARD        (err u109))

;; --- Whitelisted asset (per-network variant) ---
;; The only settlement asset the router will accept. The (with-ft SBTC "*" ...)
;; allowances below use the "*" wildcard, so the token's internal ft name is never
;; needed. This constant is the only line that changes per network:
;;   simnet/test : .mock-token
;;   testnet     : 'ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT.sbtc-token
;;   mainnet     : 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
(define-constant SBTC .mock-token)

;; --- SIP-018 structured-data signing domain ---
;; Intents are signed as SIP-018 structured data so browser wallets (Leather,
;; Xverse) can sign them natively in M2. The digest binds chain-id, so a
;; signature made for testnet can never be replayed on mainnet (and vice versa).
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

;; The intent is a Clarity tuple, consensus-serialized and hashed. The SDK produces
;; the identical hash with serializeCVBytes(tupleCV(...)); the parity test asserts it
;; byte-for-byte. Changing the field set or order on either side breaks all signatures.
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
    (asserts! (is-ok (contract-hash? asset-contract)) ERR_INVALID_ASSET)
    ;; Whitelist at the door: depositing a non-whitelisted token would trap it, since
    ;; withdraw and settle are both whitelist-gated and would refuse to move it back.
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

(define-read-only (is-whitelisted (asset-contract principal))
  (is-eq asset-contract SBTC)
)

;; --- Settle Intent ---

;; Called by a relayer to execute a user-signed payment intent, after verifying the
;; signature, nonce, expiry, and replay protection.
;;
;; Authorization recovers the signer from the signature (secp256k1-recover? +
;; principal-of?) rather than verifying against a caller-supplied pubkey: a Stacks
;; address is a hash of the pubkey, so the relayer can't supply it anyway. The caller
;; names `user`; we assert it equals the recovered signer, so a forgery fails with
;; ERR_INVALID_SIG rather than being misreported as ERR_INSUFFICIENT_FUNDS.
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
    ;; Identity-independent checks first. Whitelist before anything else so a
    ;; non-whitelisted asset gets a clear code, not a later asset-guard rollback.
    (asserts! (is-whitelisted asset-contract)  ERR_ASSET_NOT_WHITELISTED)
    (asserts! (not (is-intent-settled digest)) ERR_INTENT_USED)
    (asserts! (< stacks-block-height expiry)   ERR_INTENT_EXPIRED)
    ;; The user must net something; also guards the (- amount relayer-fee) underflow.
    (asserts! (> amount relayer-fee)           ERR_AMOUNT_TOO_LOW)

    (let (
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

      ;; Move at most `amount` (net + fee) of SBTC and nothing else. recipient/relayer
      ;; are part of the signed intent, so they are authorized despite being caller args.
      ;; #[allow(unchecked_data)]
      (unwrap!
        (as-contract? ((with-ft SBTC "*" amount))
          (begin
            (try! (contract-call? asset transfer net-amount tx-sender recipient none))
            (if (> relayer-fee u0)
              (try! (contract-call? asset transfer relayer-fee tx-sender relayer none))
              true
            )
          )
        )
        ERR_ASSET_GUARD
      )
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

;; Users reclaim unspent deposits. Also the self-settle fallback from the grant risk
;; disclosure: if every relayer censors a user, they can still pull their own funds.
(define-public (withdraw (asset <sip010-trait>) (amount uint))
  (let (
    (owner          tx-sender)
    (asset-contract (contract-of asset))
    (user-balance   (get-deposit owner asset-contract))
  )
    (asserts! (is-whitelisted asset-contract) ERR_ASSET_NOT_WHITELISTED)
    (asserts! (> amount u0)            ERR_AMOUNT_TOO_LOW)
    (asserts! (>= user-balance amount) ERR_INSUFFICIENT_FUNDS)

    ;; Debit before the external transfer (checks-effects-interactions).
    (map-set deposits { user: owner, asset: asset-contract } (- user-balance amount))
    (unwrap!
      (as-contract? ((with-ft SBTC "*" amount))
        (begin
          (try! (contract-call? asset transfer amount tx-sender owner none))
          true
        )
      )
      ERR_ASSET_GUARD
    )
    (print {
      event:  "withdraw",
      user:   owner,
      asset:  asset-contract,
      amount: amount,
    })
    (ok amount)
  )
)