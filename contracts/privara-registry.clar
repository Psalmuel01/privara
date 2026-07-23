;; privara-registry.clar
;; Relayer registration and discovery.
;; Relayers register their pubkey, fee rate, and API endpoint.
;; The router uses this to validate registered relayers.

;; --- Error codes ---

(define-constant ERR_NOT_REGISTERED     (err u200))
(define-constant ERR_ALREADY_REGISTERED (err u201))
(define-constant ERR_INVALID_PUBKEY     (err u202))
(define-constant ERR_FEE_TOO_HIGH       (err u203))
(define-constant ERR_EMPTY_ENDPOINT     (err u204))

;; Maximum fee rate a relayer can advertise (basis points: 10000 = 100%)
(define-constant MAX_FEE_RATE u10000)

;; --- Storage ---

(define-map relayers principal {
  pubkey:   (buff 33),
  fee-rate: uint,
  endpoint: (string-utf8 128),
  active:   bool
})

(define-data-var relayer-count uint u0)

;; --- Read-only ---

(define-read-only (get-relayer (relayer principal))
  (map-get? relayers relayer)
)

(define-read-only (is-registered (relayer principal))
  (is-some (map-get? relayers relayer))
)

(define-read-only (get-relayer-count)
  (var-get relayer-count)
)

;; --- Public ---

(define-public (register
  (pubkey   (buff 33)) ;; why pubkey?
  (fee-rate uint)
  (endpoint (string-utf8 128)))
  (begin
    (asserts! (not (is-registered tx-sender)) ERR_ALREADY_REGISTERED)
    ;; First byte of a compressed secp256k1 public key must be 0x02 or 0x03.
    (asserts! (or (is-eq (element-at? pubkey u0) (some 0x02))
                  (is-eq (element-at? pubkey u0) (some 0x03)))
              ERR_INVALID_PUBKEY)
    (asserts! (<= fee-rate MAX_FEE_RATE) ERR_FEE_TOO_HIGH)
    (asserts! (> (len endpoint) u0) ERR_EMPTY_ENDPOINT)
    (map-set relayers tx-sender {
      pubkey:   pubkey,
      fee-rate: fee-rate,
      endpoint: endpoint,
      active:   true
    })
    (var-set relayer-count (+ (var-get relayer-count) u1))
    (ok tx-sender)
  )
)

(define-public (update-endpoint (endpoint (string-utf8 128)))
  (let ((entry (unwrap! (map-get? relayers tx-sender) ERR_NOT_REGISTERED)))
    (map-set relayers tx-sender (merge entry { endpoint: endpoint }))
    (ok true)
  )
)

(define-public (deactivate)
  (let ((entry (unwrap! (map-get? relayers tx-sender) ERR_NOT_REGISTERED)))
    (map-set relayers tx-sender (merge entry { active: false }))
    (ok true)
  )
)
