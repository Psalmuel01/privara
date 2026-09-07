;; privara-sponsored-spend.clar
;; Non-custodial atomic SIP-010 payment + sponsorship-service fee.
;;
;; The transaction origin is the one-time stealth principal. It signs all arguments,
;; including both recipients and both amounts, before a separate Stacks sponsor adds
;; its authorization. This contract never takes custody and never switches tx-sender.

(use-trait sip010-ft-trait .sip010-ft-trait.sip010-ft-trait)

(define-constant ERR_PAYMENT_ZERO (err u400))
(define-constant ERR_FEE_ZERO (err u401))
(define-constant ERR_INVALID_DESTINATION (err u402))
(define-constant ERR_INVALID_FEE_RECIPIENT (err u403))

(define-public (sponsored-spend
    (asset <sip010-ft-trait>)
    (destination principal)
    (payment-amount uint)
    (fee-recipient principal)
    (sponsor-fee uint))
  (let (
    (origin tx-sender)
    (asset-contract (contract-of asset))
    (total-amount (+ payment-amount sponsor-fee))
  )
    (asserts! (> payment-amount u0) ERR_PAYMENT_ZERO)
    (asserts! (> sponsor-fee u0) ERR_FEE_ZERO)
    (asserts! (not (is-eq destination origin)) ERR_INVALID_DESTINATION)
    (asserts! (not (is-eq fee-recipient origin)) ERR_INVALID_FEE_RECIPIENT)
    (asserts! (not (is-eq fee-recipient destination)) ERR_INVALID_FEE_RECIPIENT)

    ;; Nested contract calls retain the transaction origin as tx-sender. Both transfers
    ;; are one atomic Clarity execution: failure of either rolls back the other.
    (try! (contract-call? asset transfer payment-amount origin destination none))
    (try! (contract-call? asset transfer sponsor-fee origin fee-recipient none))

    (print {
      event: "sponsored-spend",
      origin: origin,
      asset: asset-contract,
      destination: destination,
      payment-amount: payment-amount,
      fee-recipient: fee-recipient,
      sponsor-fee: sponsor-fee,
      total-amount: total-amount,
      sponsor: tx-sponsor?,
    })
    (ok total-amount)
  )
)
