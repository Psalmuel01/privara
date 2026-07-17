;; other-token.clar
;; A second SIP-010 token used ONLY as a test fixture: it is a valid, deployed
;; SIP-010 asset that is NOT the router's whitelisted SBTC, so it exercises the
;; ERR_ASSET_NOT_WHITELISTED (u109) rejection path in deposit/settle/withdraw.
;; Never registered on testnet/mainnet deployments.

(impl-trait .sip010-ft-trait.sip010-ft-trait)

(define-constant ERR_NOT_TOKEN_OWNER (err u1))

(define-fungible-token other)

(define-constant TOKEN_DECIMALS u6)

(define-public (transfer
    (amount uint)
    (sender principal)
    (recipient principal)
    (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) ERR_NOT_TOKEN_OWNER)
    ;; #[allow(unchecked_data)]
    (try! (ft-transfer? other amount sender recipient))
    (match memo to-print (print to-print) 0x)
    (ok true)
  )
)

(define-read-only (get-name)         (ok "Other Token"))
(define-read-only (get-symbol)       (ok "OTHER"))
(define-read-only (get-decimals)     (ok TOKEN_DECIMALS))
(define-read-only (get-balance (who principal)) (ok (ft-get-balance other who)))
(define-read-only (get-total-supply) (ok (ft-get-supply other)))
(define-read-only (get-token-uri)    (ok none))

(define-public (mint (amount uint) (recipient principal))
  (begin
    ;; #[allow(unchecked_data)]
    (try! (ft-mint? other amount recipient))
    (ok amount)
  )
)
