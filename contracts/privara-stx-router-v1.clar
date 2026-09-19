;; privara-stx-router-v1.clar
;; Custodial native-STX stealth settlement router.
;;
;; A payer first funds an account-specific router balance. A later relayer
;; transaction verifies the payer's SIP-018 signature, transfers STX to a fresh
;; one-time address, and publishes the bound encrypted announcement atomically.

(define-constant ERR_INTENT_USED          (err u300))
(define-constant ERR_INTENT_EXPIRED       (err u301))
(define-constant ERR_INVALID_SIG          (err u302))
(define-constant ERR_NOT_SIGNER           (err u303))
(define-constant ERR_INSUFFICIENT_FUNDS   (err u304))
(define-constant ERR_AMOUNT_TOO_LOW       (err u305))
(define-constant ERR_INVALID_ASSET        (err u306))
(define-constant ERR_HASH_FAILED          (err u307))
(define-constant ERR_ANNOUNCEMENT_MISMATCH (err u311))
(define-constant ERR_ANNOUNCEMENT_VERSION (err u312))
(define-constant ERR_EPHEMERAL_KEY        (err u313))
(define-constant ERR_ANNOUNCEMENT_NONCE   (err u314))
(define-constant ERR_CIPHERTEXT            (err u315))
(define-constant ERR_STX_GUARD             (err u316))

(define-constant ANNOUNCEMENT_VERSION u1)
(define-constant NATIVE_STX_ASSET .privara-stx-router-v1)
(define-constant STRUCTURED_DATA_PREFIX 0x534950303138)
(define-constant MESSAGE_DOMAIN_HASH
  (sha256 (unwrap-panic (to-consensus-buff?
    { name: "privara", version: "2", chain-id: chain-id,
      router: .privara-stx-router-v1 }))))

(define-map deposits principal uint)
(define-map settled-intents (buff 32) bool)

(define-read-only (asset-id) NATIVE_STX_ASSET)
(define-read-only (get-deposit (user principal))
  (default-to u0 (map-get? deposits user)))
(define-read-only (is-intent-settled (intent-hash (buff 32)))
  (default-to false (map-get? settled-intents intent-hash)))
(define-read-only (get-domain-hash) MESSAGE_DOMAIN_HASH)

(define-read-only (hash-intent
  (asset principal) (amount uint) (recipient principal) (relayer principal)
  (relayer-fee uint) (nonce uint) (expiry uint) (announcement-hash (buff 32)))
  (match (to-consensus-buff? {
      asset: asset, amount: amount, recipient: recipient, relayer: relayer,
      relayer-fee: relayer-fee, nonce: nonce, expiry: expiry,
      announcement-hash: announcement-hash })
    serialized (ok (sha256 serialized))
    ERR_HASH_FAILED))

(define-read-only (hash-announcement
  (asset principal) (stealth-principal principal) (version uint)
  (ephemeral-key (buff 33)) (announcement-nonce (buff 12))
  (ciphertext (buff 1024)) (registry-epoch uint))
  (match (to-consensus-buff? {
      asset: asset, ciphertext: ciphertext, ephemeral-key: ephemeral-key,
      nonce: announcement-nonce, registry-epoch: registry-epoch,
      stealth-principal: stealth-principal, version: version })
    serialized (ok (sha256 serialized))
    ERR_HASH_FAILED))

(define-read-only (message-digest (structured-data-hash (buff 32)))
  (sha256 (concat STRUCTURED_DATA_PREFIX
          (concat MESSAGE_DOMAIN_HASH structured-data-hash))))

(define-private (validate-announcement
  (version uint) (ephemeral-key (buff 33))
  (announcement-nonce (buff 12)) (ciphertext (buff 1024)))
  (begin
    (asserts! (is-eq version ANNOUNCEMENT_VERSION) ERR_ANNOUNCEMENT_VERSION)
    (asserts! (and (is-eq (len ephemeral-key) u33)
      (or (is-eq (element-at? ephemeral-key u0) (some 0x02))
          (is-eq (element-at? ephemeral-key u0) (some 0x03)))) ERR_EPHEMERAL_KEY)
    (asserts! (is-eq (len announcement-nonce) u12) ERR_ANNOUNCEMENT_NONCE)
    (asserts! (>= (len ciphertext) u16) ERR_CIPHERTEXT)
    (ok true)))

(define-public (deposit (amount uint))
  (let ((current (get-deposit tx-sender)))
    (asserts! (> amount u0) ERR_AMOUNT_TOO_LOW)
    (try! (stx-transfer? amount tx-sender current-contract))
    (map-set deposits tx-sender (+ current amount))
    (print { event: "stx-deposit", user: tx-sender, amount: amount,
             balance: (+ current amount) })
    (ok amount)))

(define-public (settle-intent
  (asset principal) (amount uint) (recipient principal) (relayer principal)
  (relayer-fee uint) (nonce uint) (expiry uint) (announcement-hash (buff 32))
  (version uint) (ephemeral-key (buff 33)) (announcement-nonce (buff 12))
  (ciphertext (buff 1024)) (registry-epoch uint) (user-sig (buff 65)))
  (let (
    (data-hash (try! (hash-intent asset amount recipient relayer relayer-fee
                                  nonce expiry announcement-hash)))
    (digest (message-digest data-hash)))
    (asserts! (is-eq asset NATIVE_STX_ASSET) ERR_INVALID_ASSET)
    (asserts! (not (is-intent-settled digest)) ERR_INTENT_USED)
    (asserts! (< stacks-block-height expiry) ERR_INTENT_EXPIRED)
    (asserts! (> amount relayer-fee) ERR_AMOUNT_TOO_LOW)
    (try! (validate-announcement version ephemeral-key announcement-nonce ciphertext))
    (asserts! (is-eq announcement-hash
      (try! (hash-announcement asset recipient version ephemeral-key
                               announcement-nonce ciphertext registry-epoch)))
      ERR_ANNOUNCEMENT_MISMATCH)
    (let (
      (recovered-pubkey (unwrap! (secp256k1-recover? digest user-sig) ERR_INVALID_SIG))
      (user (unwrap! (principal-of? recovered-pubkey) ERR_INVALID_SIG))
      (net-amount (- amount relayer-fee))
      (user-balance (get-deposit user)))
      (asserts! (>= user-balance amount) ERR_INSUFFICIENT_FUNDS)
      (map-set settled-intents digest true)
      (map-set deposits user (- user-balance amount))
      (unwrap! (as-contract? ((with-stx amount))
        (begin
          (try! (stx-transfer? net-amount current-contract recipient))
          (if (> relayer-fee u0)
            (try! (stx-transfer? relayer-fee current-contract relayer))
            true))) ERR_STX_GUARD)
      (print {
        event: "stealth-stx-settlement", intent-hash: digest,
        announcement-hash: announcement-hash, version: version,
        stealth-principal: recipient, ephemeral-key: ephemeral-key,
        nonce: announcement-nonce, ciphertext: ciphertext, asset: asset,
        registry-epoch: registry-epoch, amount: amount, relayer: relayer,
        relayer-fee: relayer-fee, payment-nonce: nonce })
      (ok digest))))

(define-public (cancel-intent
  (asset principal) (amount uint) (recipient principal) (relayer principal)
  (relayer-fee uint) (nonce uint) (expiry uint) (announcement-hash (buff 32))
  (user-sig (buff 65)))
  (let (
    (data-hash (try! (hash-intent asset amount recipient relayer relayer-fee
                                  nonce expiry announcement-hash)))
    (digest (message-digest data-hash))
    (recovered-pubkey (unwrap! (secp256k1-recover? digest user-sig) ERR_INVALID_SIG))
    (signer (unwrap! (principal-of? recovered-pubkey) ERR_INVALID_SIG)))
    (asserts! (is-eq asset NATIVE_STX_ASSET) ERR_INVALID_ASSET)
    (asserts! (is-eq signer tx-sender) ERR_NOT_SIGNER)
    (if (is-intent-settled digest) (ok false)
      (begin (map-set settled-intents digest true)
             (print { event: "cancel-intent", intent-hash: digest, signer: signer })
             (ok true)))))

(define-public (withdraw (amount uint))
  (let ((owner tx-sender) (balance (get-deposit tx-sender)))
    (asserts! (> amount u0) ERR_AMOUNT_TOO_LOW)
    (asserts! (>= balance amount) ERR_INSUFFICIENT_FUNDS)
    (map-set deposits owner (- balance amount))
    (unwrap! (as-contract? ((with-stx amount))
      (begin (try! (stx-transfer? amount current-contract owner)) true)) ERR_STX_GUARD)
    (print { event: "stx-withdraw", user: owner, amount: amount })
    (ok amount)))
