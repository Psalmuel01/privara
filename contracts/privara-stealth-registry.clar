;; privara-stealth-registry.clar
;; Public discovery of recipient stealth keys for Privara M2.
;;
;; A user's normal Stacks principal owns one current spending/viewing public-key pair.
;; Private keys and the privacy seed never enter this contract. Rotation affects future
;; payments only; recipients must retain historical recovery seeds for older addresses.

;; --- Error codes ---

(define-constant ERR_NOT_REGISTERED      (err u300))
(define-constant ERR_ALREADY_REGISTERED  (err u301))
(define-constant ERR_INVALID_PUBKEY      (err u302))
(define-constant ERR_KEYS_MUST_DIFFER    (err u303))

;; --- Storage ---

(define-map stealth-keys principal {
  spending-key: (buff 33),
  viewing-key:  (buff 33),
  epoch:        uint
})

;; --- Internal validation ---

;; Clarity cannot perform a full secp256k1 point-membership check without an attempted
;; crypto operation. The contract enforces the canonical compressed encoding shape;
;; senders MUST additionally parse/validate the point in the SDK before deriving funds.
(define-private (is-compressed-key (key (buff 33)))
  (and
    (is-eq (len key) u33)
    (or
      (is-eq (element-at? key u0) (some 0x02))
      (is-eq (element-at? key u0) (some 0x03))
    )
  )
)

(define-private (validate-keys (spending-key (buff 33)) (viewing-key (buff 33)))
  (begin
    (asserts! (is-compressed-key spending-key) ERR_INVALID_PUBKEY)
    (asserts! (is-compressed-key viewing-key) ERR_INVALID_PUBKEY)
    (asserts! (not (is-eq spending-key viewing-key)) ERR_KEYS_MUST_DIFFER)
    (ok true)
  )
)

;; --- Read-only interface ---

(define-read-only (get-stealth-keys (user principal))
  (map-get? stealth-keys user)
)

(define-read-only (is-registered (user principal))
  (is-some (map-get? stealth-keys user))
)

;; --- Public interface ---

(define-public (register-stealth-keys
  (spending-key (buff 33))
  (viewing-key  (buff 33)))
  (begin
    (asserts! (is-none (map-get? stealth-keys tx-sender)) ERR_ALREADY_REGISTERED)
    (try! (validate-keys spending-key viewing-key))
    (map-set stealth-keys tx-sender {
      spending-key: spending-key,
      viewing-key:  viewing-key,
      epoch:        u1
    })
    (print {
      event: "register-stealth-keys",
      user: tx-sender,
      epoch: u1
    })
    (ok u1)
  )
)

(define-public (update-stealth-keys
  (spending-key (buff 33))
  (viewing-key  (buff 33)))
  (let (
    (current (unwrap! (map-get? stealth-keys tx-sender) ERR_NOT_REGISTERED))
    (next-epoch (+ (get epoch current) u1))
  )
    (try! (validate-keys spending-key viewing-key))
    (map-set stealth-keys tx-sender {
      spending-key: spending-key,
      viewing-key:  viewing-key,
      epoch:        next-epoch
    })
    (print {
      event: "update-stealth-keys",
      user: tx-sender,
      epoch: next-epoch
    })
    (ok next-epoch)
  )
)
