# Airtel Money Kenya Payment-Rail Research

## Verified findings

Airtel Africa has an official Developer Portal with a country-specific onboarding flow. The portal explicitly lists Kenya and states that applications are managed per operating company, so a Kenya-specific application and credentials are expected. Source: https://developers.airtel.africa/developer

The public Airtel portal page does not expose the detailed API contract without proceeding through country selection and application onboarding. Public implementation references describe Airtel Money APIs as supporting merchant collection and disbursement/remittance capabilities, but exact Kenya availability, limits, settlement rules, and eligibility must be confirmed inside Airtel’s portal or through Airtel Kenya commercial onboarding.

The Central Bank of Kenya describes the National Payments System as including Payment Service Providers and provides an authorized PSP directory. Any live merchant collection/disbursement setup should therefore use an authorized PSP or an approved Airtel Money business integration. Source: https://www.centralbank.go.ke/national-payments-system/

Google Pay’s Web API is a tokenized checkout method: the site receives a payment token and sends it to a supported processor. It is not a wallet payout mechanism. Google’s published gambling policy requires approval and licensing for gambling integrations, and Kenya is not included in the listed gambling-eligible country list in the reviewed FAQ. Sources: https://developers.google.com/pay/api/web/overview and https://developers.google.com/pay/api/faq

## Initial technical conclusion

Airtel Money is a more natural Kenya payment rail than Google Pay for this use case because it can potentially support both collection and Airtel-wallet disbursement, subject to Airtel approval and credentials. The application should not treat Google Pay as the payout rail. A provider adapter should separate payment collection, payment confirmation callbacks, prize-pool accounting, and winner disbursement. Live paid-entry play should remain disabled until Airtel confirms that this prize-contest use case is permitted and provides production credentials.

## Additional verification

Airtel Money Kenya’s public site is an official consumer-facing portal, but its business API details are not exposed on the public landing page; the official developer portal is the correct route for country-specific onboarding and credentials. The portal lists Kenya and requires selecting the operating company before applications proceed.

Google’s Kenya Google Play help page lists payment categories such as cards, mobile phone billing, and carrier wallets for purchases of apps and digital content. This is **Google Play billing**, not evidence that Google Pay Web API can process Airtel Money for an external merchant, and it does not provide winner payouts. Source: https://support.google.com/googleplay/answer/2651410?hl=en&co=GENIE.CountryCode%3DKE

Airtel Money is therefore best evaluated as a direct collection/disbursement rail through Airtel’s Kenya developer/commercial onboarding, not as a Google Pay payout method. A third-party aggregator may simplify integration, but it would introduce another regulated payment intermediary, fees, settlement dependencies, and a separate contract.

## IP-whitelist workaround finding

IntaSend’s current Kenya payment-gateway page advertises Airtel Money support for collections and mobile-money wallet disbursements, including API-triggered and batch payouts. This is a provider claim and must be confirmed for paid-entry contests and winner payouts during onboarding. A PSP intermediary may remove the need for ViperQuiz’s own server IP to be allowlisted directly by Airtel because the PSP handles its Airtel connection, but the PSP will introduce its own fees, KYC, settlement, callback, and product-eligibility requirements. Source: https://intasend.com/payments/payment-gateway-for-online-payments-in-kenya

## PSP comparison update

The latest CBK Directory of Authorized Payment Service Providers is dated June 17, 2026. It lists Airtel Money Kenya Limited as authorized to issue, process, store, send, and facilitate mobile-money payments and to provide a platform processing payments on behalf of merchants. It also lists Pesapal Limited as authorized to process, store, send, and facilitate mobile-money payments and to provide a merchant-payment-processing platform. Source: https://www.centralbank.go.ke/wp-content/uploads/2026/08/Directory-of-Authorized-Payment-Service-Providers-August-7-2026.pdf

Pesapal’s official developer portal documents API 3.0, sandbox/test credentials, REST/JSON integration, real-time payment updates, and Instant Payment Notifications. Pesapal’s own 2025 article claims support for M-Pesa, Airtel Money, cards, and bank channels through its API, and describes the APIs as supporting payment tracking and sending money; payout eligibility and the exact Airtel-wallet disbursement operation must still be confirmed with Pesapal for this contest use case. Sources: https://developer.pesapal.com/ and https://www.pesapal.com/blog/why-developers-in-kenya-uganda-and-beyond-are-choosing-pesapal-s-apis

IntaSend’s official Kenya page advertises Airtel Money collections and wallet disbursements, but it was not identified by name in the reviewed CBK directory pages. Its authorization status should therefore be verified directly before selection. Pesapal is the stronger first candidate for a compliance-led evaluation because it is explicitly listed in the CBK directory and publishes a sandbox/API developer portal.

## Pesapal API 3.0 implementation findings

Pesapal’s official API 3.0 documentation provides sandbox and production REST/JSON endpoints. Authentication uses merchant `consumer_key` and `consumer_secret` to request a Bearer token valid for up to five minutes. Sandbox authentication is `https://cybqa.pesapal.com/pesapalv3/api/Auth/RequestToken`; production authentication is `https://pay.pesapal.com/v3/api/Auth/RequestToken`.

The sandbox SubmitOrderRequest endpoint is `https://cybqa.pesapal.com/pesapalv3/api/Transactions/SubmitOrderRequest`. It returns a `redirect_url` for the player. The order request requires a unique merchant reference, KES amount, description, callback URL, registered notification/IPN ID, and billing address. Pesapal’s callback and IPN do not include payment status; the server must call GetTransactionStatus with the returned OrderTrackingId.

The sandbox IPN registration endpoint is `https://cybqa.pesapal.com/pesapalv3/api/URLSetup/RegisterIPN`. Pesapal states that the IPN URL must be publicly available and that IP whitelisting is not feasible for Pesapal because its IP may change. This makes it compatible with a public HTTPS WebDev callback without requiring Airtel’s direct server-IP allowlist.

The sandbox transaction-status endpoint is `https://cybqa.pesapal.com/pesapalv3/api/Transactions/GetTransactionStatus?orderTrackingId=...`. A completed payment is represented by status code 1 / `COMPLETED`; failed, reversed, and invalid states must not unlock the game. Sources: https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/authentication, https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/submitorderrequest, https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/registeripnurl, https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/gettransactionstatus
