# Manual Pilot STK Push Assessment

Safaricom’s official [Daraja Developer Portal](https://developer.safaricom.co.ke/) provides access to Safaricom and M-PESA APIs and supports creating an account as an individual or company. The official API catalog includes [Mpesa Express Simulate](https://developer.safaricom.co.ke/apis/MpesaExpressSimulate), the STK Push product used to prompt a customer’s phone to authorize a payment.

A production implementation would require a Daraja app, API credentials, a valid shortcode/till configuration, a passkey, an HTTPS callback endpoint, request authentication/token handling, callback parsing, idempotency, and reconciliation. The current ViperQuiz Manual Pilot has none of these provider credentials or an enabled payment connector, and it deliberately does not initiate payments. It currently records the participant-entered last-three-character reference suffix and waits for host verification.

STK Push would be asynchronous: an initiation response is not proof of payment. The application must wait for and validate the provider callback before changing a ledger row to paid. A successful callback should be matched to the expected room, amount, participant, and unique provider identifiers; duplicate callbacks must be idempotent. Live prize-contest eligibility, settlement, refunds, and payout authorization must be confirmed with Safaricom and the relevant Kenyan compliance professionals before enabling real-money use.

The safest immediate option is to keep the manual pilot and add a disabled provider adapter behind a feature flag. The lighter option is to keep the current collection number and receipt workflow until sandbox credentials and callback hosting are available.

## Airtel Kenya finding

Airtel Africa maintains an official developer portal with Kenya as a selectable operating company: [https://developers.airtel.africa/](https://developers.airtel.africa/). Selecting Kenya routes developers to the Kenya developer login at [https://developers.airtelkenya.com/user/login?country=KE&existing=true](https://developers.airtelkenya.com/user/login?country=KE&existing=true). The portal is account-gated, so public pages do not expose the complete Kenya API reference without login. Public search results and provider materials use terms such as payment collection, customer authorization, and USSD push; do not treat this as proof that Airtel offers Safaricom’s exact STK Push contract. The exact Airtel Kenya product name, endpoint, callback mechanism, merchant eligibility, and credentials must be confirmed inside the Kenya portal or with Airtel support before implementation.

## Airtel Kenya callback-contract check
Airtel’s official developer portal requires country selection and routes Kenya developers to an authenticated Airtel Kenya portal. The public pages checked here did not expose a callback-signature specification, so the application must not invent an Airtel-specific HMAC or header scheme. The implementation will use a fail-closed verifier boundary that accepts callbacks only when Airtel’s provider-specific verification contract is explicitly configured, and the live callback endpoint remains disabled until Airtel supplies that contract.

Official sources checked:
- https://developers.airtel.africa/home
- https://developers.airtel.africa/login-country
- https://developers.airtelkenya.com/user/login?country=KE&existing=true

## Authenticated Airtel Kenya portal findings
The authenticated Kenya portal was opened for the existing “Viper Quiz” application. It exposes a TEST mode, a merchant code, a Go Live control, and a Key Management page containing masked Client ID and Client Secret Key fields. No secrets were copied or exposed. The portal’s visible workflow confirms that test credentials and production activation are separate; the Go Live action was not selected. The exact callback-signature contract still requires the portal’s documentation or Airtel support confirmation before production verification is implemented.

## Authenticated documentation findings
The Airtel Kenya documentation page states that staging account credentials are generated from application settings for testing, while production account credentials become available after activating the account to go live. It also warns not to share application keys or secrets. The visible documentation navigation includes Authorization, Encryption, Collection-APIs, Disbursement-APIs, MERCHANT COLLECTION, and callback-related sections; exact payload and signature details should be copied from these authenticated sections, not guessed.

## Authenticated Airtel Kenya production contract
The authenticated Kenya Collection-APIs documentation confirms staging base URL `https://openapiuat.airtelkenya.com` and production base URL `https://openapi.airtelkenya.com`. The payment-request operation is `POST /merchant/v1/payments/` (“Payments - USSD Push”), with `X-Country: KE`, `X-Currency: KES`, and an OAuth Bearer token. The subscriber `msisdn` must not include the country code; the request includes a partner-unique transaction ID and amount.

The authenticated “Callback With Authentication” section states that Airtel sends intermediate or final transaction status to the configured HTTPS callback URL and includes a `hash` in the body. It specifies hashing the callback request with the private key shown in Application Settings using HmacSHA256 and Base64 output, then comparing the generated value with the supplied hash. The callback body includes `transaction.id`, `transaction.message`, `transaction.status_code` (`TF` failed or `TS` success), and `transaction.airtel_money_id`. Exact callback verification will use the raw request body, the application private key, constant-time comparison, and room/player/amount/request-ID reconciliation.

## Airtel authorization and encryption findings
The authenticated Kenya documentation confirms a Collection-APIs Authorization section and an Encryption section. The Encryption page lists staging and production base URLs and documents RSA client-side PIN encryption using ECB/PKCS1Padding with a 1024-bit key; it also provides a public key in the docs. PIN encryption is distinct from callback verification and should not be conflated with the callback hash. The portal’s Callback With Authentication page specifies the separate callback hash process: HmacSHA256 using the private key from Application Settings, encoded as Base64.

## Airtel Go Live flow
After the user’s explicit confirmation, the Viper Quiz application’s Go Live flow was opened. The application remains in TEST mode. The Go Live page requires selecting the application and a product before submission; no product was selected and the Submit action was not completed. No production activation or live payment request has been made.

## Go Live blocker
The Go Live page showed the Viper Quiz application but the Select Product dropdown contained no selectable product, leaving Submit unavailable. Returning to My Applications showed the application list loading with no visible rows at that moment. No product was selected and no Go Live submission was made. The next safe step is to add/request the Collection-APIs product for the application or contact Airtel support if the product list remains empty.

## Airtel application setup findings
The Viper Quiz application is visible again in My Applications and remains in TEST mode. Its Products page shows “No product added in this country,” which explains why the Go Live product selector was empty. The application Security page also shows a Server IP Allowed List field and states that trusted server IPs must be added. No IP was entered and no product or production setting was changed. The next required portal step is adding/requesting the Collection-APIs product; the IP allow-list value must be the application’s stable public egress IP, not a guessed local or temporary address.

## Current portal state after recheck
The authenticated Viper Quiz application now visibly shows Status `Pending` and Mode `TEST`. Its My Products section contains both `Collection-APIs` and `Disbursement-APIs`. Opening Collection-APIs settings shows an “Update Product Versions in Kenya” dialog with Version 1.0 and Version 2.0 options; no version change was submitted. The earlier `ERROR.undefined` state was transient/loading-related. No Go Live, version update, IP allow-list edit, or live payment action has been performed.

## TEST credentials state
The Viper Quiz application’s TEST Key Management page is accessible and displays masked Client ID and Client Secret Key fields. Credential values were not revealed, copied, or entered into chat. The application remains Pending / TEST. Collection-APIs and Disbursement-APIs are attached, but no production activation or live transaction was performed.

## Go Live form recheck
The authenticated Go Live form now loads with Viper Quiz preselected. The Select Product control is present but currently not populated in the visible snapshot, and Submit is disabled. No production product was selected and no activation request was submitted.

## Final Go Live recheck
The Go Live form preselects Viper Quiz, but the Select Product dropdown contains only the placeholder `Select`; no production product is available. Submit remains disabled. The application’s TEST products being visible in My Products does not make a production product selectable. No production activation was submitted.

## Portal visibility recheck
The Airtel My Applications page was opened, but after loading it redirected to the Airtel Kenya login screen. The current browser session is therefore signed out, so application visibility cannot be verified until the user signs in again. No portal changes were made.

## Daraja 3.0 assessment
Safaricom’s official Daraja portal describes Daraja 3.0 as the bridge to Safaricom and M-PESA APIs. Its official Getting Started guide states that the APIs are RESTful and include payment and disbursement interfaces, that localhost testing can use an HTTP tunnel, and that production requires an M-PESA account such as a PayBill, Till Number, or B2C account plus access to the M-PESA Portal with an Admin or Business Manager. The guide also publishes Safaricom callback gateway IP addresses for allow-listing and provides sandbox and production certificates for APIs that use encrypted security credentials.

Sources checked: https://developer.safaricom.co.ke/ and https://developer.safaricom.co.ke/apis/GettingStarted

## Daraja authenticated workspace finding
The authenticated Daraja account currently opens successfully, but its My Apps page reports an empty workspace: All Apps, Sandbox Apps, Production Apps, and Revoked Apps contain no visible application. The portal offers Create Sandbox App. No app was created and no credentials or production settings were changed.

## Daraja portal access block
After the ViperQuiz sandbox app was created successfully, a subsequent direct request to the Daraja My Apps dashboard returned an Imperva Access Denied Error 16 page. The previous authenticated view confirmed the app exists with Lipa na M-Pesa Sandbox, but the portal cannot currently be re-opened from the active browser session. No credential values were exposed and no production settings were changed.

## Daraja production activation and hosting requirements
Production activation remains pending. The official Daraja Getting Started guide requires an M-PESA account such as a PayBill, Till Number, or B2C account and access to the M-PESA Portal with an Admin or Business Manager. Production credentials, shortcode configuration, passkey/security credentials, and the final HTTPS callback URL must be obtained through Safaricom’s production onboarding flow. The ViperQuiz application must not use the personal collection number 0787896447 for automated production collection unless Safaricom formally provisions it as an eligible business shortcode.

Daraja’s official guide publishes Safaricom callback gateway IP addresses for allow-listing. The callback endpoint should validate the M-Pesa request identifiers, amount, customer phone, and receipt before marking a ledger row paid, and should be idempotent for duplicate callbacks. A public HTTPS endpoint is required; the current Manus Autoscale HTTPS domain can host the callback handler, but an additional fixed outbound IP is not required by the documented STK Push flow unless Safaricom separately requires it for the merchant account. Manual Pilot remains the production fallback until these prerequisites are approved and tested.
