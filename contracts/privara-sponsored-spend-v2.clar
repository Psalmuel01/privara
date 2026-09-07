;; privara-sponsored-spend-v2.clar
;; Non-custodial atomic SIP-010 payment + sponsorship-service fee.
;; Version 2 additionally binds the expected Stacks sponsor in the origin-signed payload.

(use-trait sip010-ft-trait .sip010-ft-trait.sip010-ft-trait)

(define-constant ERR_PAYMENT_ZERO (err u400))
(define-constant ERR_FEE_ZERO (err u401))
(define-constant ERR_INVALID_DESTINATION (err u402))
(define-constant ERR_INVALID_FEE_RECIPIENT (err u403))
(define-constant ERR_INVALID_SPONSOR (err u404))

(define-public (sponsored-spend
    (asset <sip010-ft-trait>)
    (destination principal)
    (payment-amount uint)
    (fee-recipient principal)
    (sponsor-fee uint)
    (expected-sponsor principal))
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
    ;; Simnet/self-funded calls have no sponsor and remain usable. If sponsorship is
    ;; present, its principal must be the one the origin signed into this call.
    (asserts!
      (match tx-sponsor? actual-sponsor (is-eq actual-sponsor expected-sponsor) true)
      ERR_INVALID_SPONSOR)

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
      expected-sponsor: expected-sponsor,
      total-amount: total-amount,
      sponsor: tx-sponsor?,
    })
    (ok total-amount)
  )
)
