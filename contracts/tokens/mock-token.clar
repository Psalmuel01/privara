;; mock-token.clar
;; Minimal SIP-010 fungible token for tests and testnet demos.
;; Implements the sip010-ft-trait and adds an unrestricted public `mint` so
;; simnet/testnet accounts can fund themselves. NOT for mainnet: `mint` has no
;; access control by design (it exists only to bootstrap deposits in the demo).

(impl-trait .sip010-ft-trait.sip010-ft-trait)

(define-constant ERR_NOT_TOKEN_OWNER (err u1))

(define-fungible-token mock)

(define-data-var token-name (string-ascii 32) "Mock Token")
(define-data-var token-symbol (string-ascii 32) "MOCK")
(define-data-var token-uri (optional (string-utf8 256)) none)
(define-constant TOKEN_DECIMALS u6)

;; --- SIP-010 transfer ---

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34))))
  (begin
    ;; SIP-010: only the owner of the funds may move them.
    (asserts! (is-eq tx-sender sender) ERR_NOT_TOKEN_OWNER)
    ;; ft-transfer? enforces the balance check; the assert above enforces ownership.
    ;; #[allow(unchecked_data)]
    (try! (ft-transfer? mock amount sender recipient))
    (match memo to-print (print to-print) 0x)
    (ok true)
  )
)

;; --- SIP-010 read-only metadata ---

(define-read-only (get-name)         (ok (var-get token-name)))
(define-read-only (get-symbol)       (ok (var-get token-symbol)))
(define-read-only (get-decimals)     (ok TOKEN_DECIMALS))
(define-read-only (get-balance (who principal)) (ok (ft-get-balance mock who)))
(define-read-only (get-total-supply) (ok (ft-get-supply mock)))
(define-read-only (get-token-uri)    (ok (var-get token-uri)))

;; --- Test/demo mint (no access control on purpose) ---

(define-public (mint (amount uint) (recipient principal))
  (begin
    ;; Intentionally unrestricted: a demo faucet. ft-mint? validates the amount.
    ;; #[allow(unchecked_data)]
    (try! (ft-mint? mock amount recipient))
    (ok amount)
  )
)
