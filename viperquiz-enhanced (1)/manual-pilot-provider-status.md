# Manual Pilot Provider Status

## Current operating boundary

ViperQuiz Manual Pilot records participant payment confirmations and payout receipts entered by the host. It does not initiate collections, call Airtel or Google Pay APIs, move funds, or claim that a transfer succeeded. The developer destination is configured as `+254787896447`, and provider fees are entered manually against the developer allocation only.

## Deferred live-payment work

Live payment integration remains intentionally deferred. The project does not currently rely on a stable Airtel-allowlisted egress IP, a confirmed merchant credential set, an authorized PSP agreement, a verified prize-contest/compliance approval, or a signed webhook flow. No provider has been selected as the production rail, so no direct Airtel calls or automatic disbursement code should be enabled from this checkpoint.

## Safe activation prerequisites

Before enabling live collections or payouts, obtain written provider approval for the intended contest/prize-pool use case, merchant and disbursement credentials, confirmed fee and settlement terms, payout limits, webhook-signing requirements, a stable allowlisted egress path, refund and failed-payment procedures, and an age/responsible-play review appropriate to the operating jurisdiction. Then implement the provider behind an adapter with idempotency, signed webhook verification, reconciliation, and an explicit production feature flag.

Until those prerequisites are verified, use the manual ledger, host receipt verification, server-side allocation rules, payout receipt recording, and CSV reconciliation export only.
