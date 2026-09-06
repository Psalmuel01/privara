;; privara-router-m2.clar
;; Versioned stealth settlement router. M1 remains deployed and unchanged.
;;
;; An M2 intent signs the hash of a canonical encrypted announcement. Settlement
;; succeeds only when the supplied payload hashes to that signed commitment, then
;; transfers and emits the payload in the same atomic transaction.

(use-trait sip010-trait .sip010-ft-trait.sip010-ft-trait)

;; --- Error codes (u100-u110 retain the M1 meanings) ---

(define-constant ERR_INTENT_USED           (err u100))
(define-constant ERR_INTENT_EXPIRED        (err u101))
(define-constant ERR_INVALID_SIG           (err u102))
(define-constant ERR_NOT_SIGNER            (err u103))
(define-constant ERR_INSUFFICIENT_FUNDS    (err u104))
(define-constant ERR_AMOUNT_TOO_LOW        (err u105))
(define-constant ERR_INVALID_ASSET         (err u106))
(define-constant ERR_HASH_FAILED           (err u107))
(define-constant ERR_ASSET_NOT_WHITELISTED (err u108))
(define-constant ERR_ASSET_GUARD           (err u109))
(define-constant ERR_NO_DEPOSIT             (err u110))
(define-constant ERR_ANNOUNCEMENT_MISMATCH  (err u111))
(define-constant ERR_ANNOUNCEMENT_VERSION   (err u112))
(define-constant ERR_EPHEMERAL_KEY          (err u113))
(define-constant ERR_ANNOUNCEMENT_NONCE     (err u114))
(define-constant ERR_CIPHERTEXT             (err u115))

(define-constant SBTC .mock-token)
(define-constant ANNOUNCEMENT_VERSION u1)
(define-constant STRUCTURED_DATA_PREFIX 0x534950303138)

;; A separate version and self-principal prevent signatures from crossing either
;; the M1/M2 boundary or another deployment of this contract.
(define-constant MESSAGE_DOMAIN_HASH
  (sha256 (unwrap-panic (to-consensus-buff?
    { name: "privara", version: "2", chain-id: chain-id, router: .privara-router-m2 }))))

(define-map settled-intents (buff 32) bool)
(define-map deposits { user: principal, asset: principal } uint)

;; --- Read-only protocol helpers ---

(define-read-only (is-intent-settled (intent-hash (buff 32)))
  (default-to false (map-get? settled-intents intent-hash))
)

(define-read-only (get-deposit (user principal) (asset principal))
  (default-to u0 (map-get? deposits { user: user, asset: asset }))
)

(define-read-only (is-whitelisted (asset-contract principal))
  (is-eq asset-contract SBTC)
)

(define-read-only (get-domain-hash) MESSAGE_DOMAIN_HASH)
(define-read-only (get-chain-id) chain-id)

;; The unordered nonce is a uniqueness salt. Replay protection is per final SIP-018
;; digest, exactly as in M1. announcement-hash is part of the signed field set.
(define-read-only (hash-intent
  (asset             principal)
  (amount            uint)
  (recipient         principal)
  (relayer           principal)
  (relayer-fee       uint)
  (nonce             uint)
  (expiry            uint)
  (announcement-hash (buff 32)))
  (match (to-consensus-buff? {
      asset:             asset,
      amount:            amount,
      recipient:         recipient,
      relayer:           relayer,
      relayer-fee:       relayer-fee,
      nonce:             nonce,
      expiry:            expiry,
      announcement-hash: announcement-hash,
    })
    serialized (ok (sha256 serialized))
    ERR_HASH_FAILED)
)

;; Canonical announcement hash. Field names and types must match
;; sdk/src/stealth/announcement.ts byte-for-byte.
(define-read-only (hash-announcement
  (asset              principal)
  (stealth-principal  principal)
  (version            uint)
  (ephemeral-key      (buff 33))
  (announcement-nonce (buff 12))
  (ciphertext         (buff 1024))
  (registry-epoch     uint))
  (match (to-consensus-buff? {
      asset:             asset,
      ciphertext:        ciphertext,
      ephemeral-key:     ephemeral-key,
      nonce:             announcement-nonce,
      registry-epoch:    registry-epoch,
      stealth-principal: stealth-principal,
      version:           version,
    })
    serialized (ok (sha256 serialized))
    ERR_HASH_FAILED)
)

(define-read-only (message-digest (structured-data-hash (buff 32)))
  (sha256 (concat STRUCTURED_DATA_PREFIX
          (concat MESSAGE_DOMAIN_HASH structured-data-hash)))
)

(define-private (validate-announcement
  (version            uint)
  (ephemeral-key      (buff 33))
  (announcement-nonce (buff 12))
  (ciphertext         (buff 1024)))
  (begin
    (asserts! (is-eq version ANNOUNCEMENT_VERSION) ERR_ANNOUNCEMENT_VERSION)
    (asserts!
      (and
        (is-eq (len ephemeral-key) u33)
        (or
          (is-eq (element-at? ephemeral-key u0) (some 0x02))
          (is-eq (element-at? ephemeral-key u0) (some 0x03))))
      ERR_EPHEMERAL_KEY)
    (asserts! (is-eq (len announcement-nonce) u12) ERR_ANNOUNCEMENT_NONCE)
    ;; AES-GCM ciphertext includes a 16-byte authentication tag.
    (asserts! (>= (len ciphertext) u16) ERR_CIPHERTEXT)
    (ok true)
  )
)

;; --- Custody ---

(define-public (deposit (asset <sip010-trait>) (amount uint))
  (let (
    (asset-contract (contract-of asset))
    (current (get-deposit tx-sender asset-contract))
  )
    (asserts! (is-ok (contract-hash? asset-contract)) ERR_INVALID_ASSET)
    (asserts! (is-whitelisted asset-contract) ERR_ASSET_NOT_WHITELISTED)
    (asserts! (> amount u0) ERR_AMOUNT_TOO_LOW)
    (try! (contract-call? asset transfer amount tx-sender .privara-router-m2 none))
    (map-set deposits { user: tx-sender, asset: asset-contract } (+ current amount))
    (print {
      event: "deposit",
      user: tx-sender,
      asset: asset-contract,
      amount: amount,
      balance: (+ current amount),
    })
    (ok amount)
  )
)

;; --- Atomic stealth settlement ---

(define-public (settle-intent
  (asset              <sip010-trait>)
  (amount             uint)
  (recipient          principal)
  (relayer            principal)
  (relayer-fee        uint)
  (nonce              uint)
  (expiry             uint)
  (announcement-hash  (buff 32))
  (version            uint)
  (ephemeral-key      (buff 33))
  (announcement-nonce (buff 12))
  (ciphertext         (buff 1024))
  (registry-epoch     uint)
  (user-sig           (buff 65)))

  (let (
    (asset-contract (contract-of asset))
    (data-hash (try! (hash-intent asset-contract amount recipient relayer
                                  relayer-fee nonce expiry announcement-hash)))
    (digest (message-digest data-hash))
  )
    (asserts! (is-whitelisted asset-contract) ERR_ASSET_NOT_WHITELISTED)
    (asserts! (not (is-intent-settled digest)) ERR_INTENT_USED)
    (asserts! (< stacks-block-height expiry) ERR_INTENT_EXPIRED)
    (asserts! (> amount relayer-fee) ERR_AMOUNT_TOO_LOW)
    (try! (validate-announcement version ephemeral-key announcement-nonce ciphertext))
    (asserts!
      (is-eq announcement-hash
        (try! (hash-announcement asset-contract recipient version ephemeral-key
                                 announcement-nonce ciphertext registry-epoch)))
      ERR_ANNOUNCEMENT_MISMATCH)

    (let (
      (recovered-pubkey (unwrap! (secp256k1-recover? digest user-sig) ERR_INVALID_SIG))
      (user (unwrap! (principal-of? recovered-pubkey) ERR_INVALID_SIG))
      (net-amount (- amount relayer-fee))
      (user-balance (get-deposit user asset-contract))
    )
      (asserts! (> user-balance u0) ERR_NO_DEPOSIT)
      (asserts! (>= user-balance amount) ERR_INSUFFICIENT_FUNDS)

      (map-set settled-intents digest true)
      ;; `user` is authenticated by secp256k1-recover? + principal-of? above.
      ;; #[allow(unchecked_data)]
      (map-set deposits { user: user, asset: asset-contract } (- user-balance amount))

      ;; #[allow(unchecked_data)]
      (unwrap!
        (as-contract? ((with-ft SBTC "*" amount))
          (begin
            (try! (contract-call? asset transfer net-amount tx-sender recipient none))
            (if (> relayer-fee u0)
              (try! (contract-call? asset transfer relayer-fee tx-sender relayer none))
              true)
          )
        )
        ERR_ASSET_GUARD)

      ;; This is the only announcement publication path. If transfer or print fails,
      ;; the whole transaction rolls back; there is no unbound discovery event.
      (print {
        event:             "stealth-settlement",
        intent-hash:       digest,
        announcement-hash: announcement-hash,
        version:           version,
        stealth-principal: recipient,
        ephemeral-key:     ephemeral-key,
        nonce:             announcement-nonce,
        ciphertext:        ciphertext,
        asset:             asset-contract,
        registry-epoch:    registry-epoch,
        amount:            amount,
        relayer:           relayer,
        relayer-fee:       relayer-fee,
        payment-nonce:     nonce,
      })
      (ok digest)
    )
  )
)

;; Cancellation commits to the same signed intent but needs no announcement payload;
;; a cancelled payment emits no recipient discovery event.
;; #[allow(unchecked_data)]
(define-public (cancel-intent
  (asset             principal)
  (amount            uint)
  (recipient         principal)
  (relayer           principal)
  (relayer-fee       uint)
  (nonce             uint)
  (expiry            uint)
  (announcement-hash (buff 32))
  (user-sig          (buff 65)))
  (let (
    (data-hash (try! (hash-intent asset amount recipient relayer relayer-fee
                                  nonce expiry announcement-hash)))
    (digest (message-digest data-hash))
    (recovered-pubkey (unwrap! (secp256k1-recover? digest user-sig) ERR_INVALID_SIG))
    (signer (unwrap! (principal-of? recovered-pubkey) ERR_INVALID_SIG))
  )
    (asserts! (is-eq signer tx-sender) ERR_NOT_SIGNER)
    (if (is-intent-settled digest)
      (ok false)
      (begin
        (map-set settled-intents digest true)
        (print { event: "cancel-intent", intent-hash: digest, signer: signer })
        (ok true)))
  )
)

(define-public (withdraw (asset <sip010-trait>) (amount uint))
  (let (
    (owner tx-sender)
    (asset-contract (contract-of asset))
    (user-balance (get-deposit owner asset-contract))
  )
    (asserts! (is-whitelisted asset-contract) ERR_ASSET_NOT_WHITELISTED)
    (asserts! (> amount u0) ERR_AMOUNT_TOO_LOW)
    (asserts! (>= user-balance amount) ERR_INSUFFICIENT_FUNDS)
    (map-set deposits { user: owner, asset: asset-contract } (- user-balance amount))
    (unwrap!
      (as-contract? ((with-ft SBTC "*" amount))
        (begin
          (try! (contract-call? asset transfer amount tx-sender owner none))
          true))
      ERR_ASSET_GUARD)
    (print { event: "withdraw", user: owner, asset: asset-contract, amount: amount })
    (ok amount)
  )
)
