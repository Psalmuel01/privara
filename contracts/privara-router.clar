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
(define-constant ERR_INVALID_PUBKEY     (err u106))
(define-constant ERR_INVALID_ASSET      (err u107))
(define-constant ERR_HASH_FAILED        (err u108))

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

;; Computes the canonical intent hash used for signature verification.
;; Each field is individually hashed to (buff 32) before concatenation to keep
;; concat operands at a fixed known width and avoid the (buff 1048576) type
;; overflow that would occur when chaining to-consensus-buff? results directly.
;; The SDK must apply the same construction: sha256(field) for each, concat, sha256.
(define-read-only (hash-intent
  (asset       principal)
  (amount      uint)
  (recipient   principal)
  (relayer     principal)
  (relayer-fee uint)
  (nonce       uint)
  (expiry      uint))
  (ok (sha256
    (concat (sha256 (unwrap! (to-consensus-buff? asset)       ERR_HASH_FAILED))
    (concat (sha256 (unwrap! (to-consensus-buff? amount)      ERR_HASH_FAILED))
    (concat (sha256 (unwrap! (to-consensus-buff? recipient)   ERR_HASH_FAILED))
    (concat (sha256 (unwrap! (to-consensus-buff? relayer)     ERR_HASH_FAILED))
    (concat (sha256 (unwrap! (to-consensus-buff? relayer-fee) ERR_HASH_FAILED))
    (concat (sha256 (unwrap! (to-consensus-buff? nonce)       ERR_HASH_FAILED))
            (sha256 (unwrap! (to-consensus-buff? expiry)      ERR_HASH_FAILED))
    ))))))
  ))
)

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
    (ok amount)
  )
)

;; --- Settle Intent ---

;; Called by a relayer to execute a user-signed payment intent.
;; Verifies the signature, nonce, expiry, and replay protection before settling.
;; with-all-assets-unsafe is used here during prototyping. production should declare specific (with-ft asset amount) allowances once the with-ft syntax is confirmed against the deployed Clarity 4 runtime.
(define-public (settle-intent
  (asset       <sip010-trait>)
  (amount      uint)
  (recipient   principal)
  (relayer     principal)
  (relayer-fee uint)
  (nonce       uint)
  (expiry      uint)
  (user-pubkey (buff 33))
  (user-sig    (buff 65)))

  (let (
    (asset-contract (contract-of asset))
    (intent-hash    (try! (hash-intent asset-contract amount recipient relayer relayer-fee nonce expiry)))
    (net-amount     (- amount relayer-fee))
  )
    ;; Checks that do not depend on the user's identity come first.
    (asserts! (not (is-intent-settled intent-hash)) ERR_INTENT_USED)
    (asserts! (< stacks-block-height expiry)        ERR_INTENT_EXPIRED)
    (asserts! (> amount relayer-fee)                ERR_AMOUNT_TOO_LOW)
    ;; Signature check validates user-pubkey before we derive the user principal from it.
    ;; This satisfies check_checker: user-pubkey is asserted before user is ever computed.
    (asserts! (secp256k1-verify intent-hash user-sig user-pubkey) ERR_INVALID_SIG)

    (let (
      (user           (unwrap! (principal-of? user-pubkey) ERR_INVALID_PUBKEY))
      (expected-nonce (get-nonce user))
      (user-balance   (get-deposit user asset-contract))
    )
      (asserts! (is-eq nonce expected-nonce)  ERR_NONCE_MISMATCH)
      (asserts! (>= user-balance amount)      ERR_INSUFFICIENT_FUNDS)

      (map-set settled-intents intent-hash true)
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
      (ok intent-hash)
    )
  )
)

;; --- Withdraw --- or self settlement of funds back to the user's wallet.
;; Implement withdraw function with proper checks and balance updates.