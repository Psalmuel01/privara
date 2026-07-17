;; allowance-experiment.clar
;; THROWAWAY: tests whether restrict-assets?/as-contract? allowance lists accept a
;; DYNAMIC (trait-parameter) contract principal, or only compile-time literals.
;; Resolves the R1 open question before reworking settle-intent. Delete after.
;;
;; Each function moves `amount` to a DISTINCT recipient (never self: Clarity's
;; ft-transfer? returns (err u2) on a self-transfer, which would mask the result).
;; Only the allowance form differs across the three, so any divergence in outcome
;; is attributable to the allowance alone.

(use-trait sip010-trait .sip010-ft-trait.sip010-ft-trait)

;; Attempt 1: DYNAMIC principal via (contract-of asset) in with-ft.
(define-public (try-dynamic-principal (asset <sip010-trait>) (amount uint) (recipient principal))
  (begin
    (try! (as-contract? ((with-ft (contract-of asset) "mock" amount))
      (begin
        (try! (contract-call? asset transfer amount tx-sender recipient none))
        true)))
    (ok true)))

;; Attempt 2: LITERAL principal control. Same transfer, same asset name, but the
;; allowance names .mock-token directly. If this succeeds while attempt 1 fails,
;; the difference is proven to be the dynamic principal, not the test harness.
(define-public (try-literal-principal (asset <sip010-trait>) (amount uint) (recipient principal))
  (begin
    (try! (as-contract? ((with-ft .mock-token "mock" amount))
      (begin
        (try! (contract-call? asset transfer amount tx-sender recipient none))
        true)))
    (ok true)))

;; Attempt 3: with-all-assets-unsafe baseline. Proves the transfer mechanics
;; themselves work, isolating the allowance as the only variable.
(define-public (try-unsafe (asset <sip010-trait>) (amount uint) (recipient principal))
  (begin
    (try! (as-contract? ((with-all-assets-unsafe))
      (begin
        (try! (contract-call? asset transfer amount tx-sender recipient none))
        true)))
    (ok true)))
