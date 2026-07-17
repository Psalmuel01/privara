;; sip018-spike.clar
;; Phase 0 spike: prove that a SIP-018 structured-data signature produced in
;; TypeScript verifies on-chain via secp256k1-recover? + principal-of?.
;; Throwaway contract - validates the digest construction before it is
;; transplanted into privara-router. Not part of the deployed protocol.
;;
;; SIP-018 digest:
;;   message-digest = sha256(0x534950303138 || domain-hash || structured-data-hash)
;;   domain-hash    = sha256(to-consensus-buff? { name, version, chain-id })
;;   structured-data-hash = sha256(to-consensus-buff? <message tuple>)

(define-constant ERR_RECOVER_FAILED   (err u900))
(define-constant ERR_PRINCIPAL_FAILED (err u901))

(define-constant STRUCTURED_DATA_PREFIX 0x534950303138)

(define-constant MESSAGE_DOMAIN_HASH
  (sha256 (unwrap-panic (to-consensus-buff?
    { name: "privara", version: "1", chain-id: chain-id }))))

;; Exposed so the TypeScript side can assert byte-for-byte parity.
(define-read-only (get-domain-hash)
  MESSAGE_DOMAIN_HASH
)

(define-read-only (get-chain-id)
  chain-id
)

;; Full SIP-018 message digest for a given structured-data hash.
(define-read-only (message-digest (structured-data-hash (buff 32)))
  (sha256 (concat STRUCTURED_DATA_PREFIX
          (concat MESSAGE_DOMAIN_HASH structured-data-hash)))
)

;; Recovers the signer principal from a structured-data hash and an RSV
;; signature. The router will compare this against nonce/deposit state;
;; the spike only needs to return it for the test to assert on.
(define-read-only (recover-signer
  (structured-data-hash (buff 32))
  (signature            (buff 65)))
  (let (
    (pubkey (unwrap! (secp256k1-recover? (message-digest structured-data-hash) signature)
                     ERR_RECOVER_FAILED))
  )
    (ok (unwrap! (principal-of? pubkey) ERR_PRINCIPAL_FAILED))
  )
)
