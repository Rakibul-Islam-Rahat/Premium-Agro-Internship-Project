# Premium Agro — Integrated Frontend + Backend

This project contains the existing React/Vite frontend plus a separate Node.js/Express backend integrated with MongoDB/Mongoose. The frontend can still run in mock/demo mode, or switch to the backend-backed mode when a MongoDB database is configured. The business model is **one pooled investment programme** that may fund multiple approved agriculture activities. Investors do not select separate farms/projects and are not assigned units; requests and positions are recorded by amount in BDT.

> **Important:** This is a development integration, not an independently audited production financial system. Before real investor money or sensitive identity documents are handled, follow the production requirements near the end of this README and in `backend/README.md`. The backend does not connect to a bank or automatically verify that money has arrived.

## Main workflows

### One pooled programme
- There is one investable programme: **Premium Agro Collective Investment Program**.
- Livestock, orchards, seasonal crops, dairy and other approved agriculture activities are listed as internal activities of that programme, not independent investment products.
- Return is variable and performance-based. No ROI percentage or profit is guaranteed.
- Administrators edit the programme, update its progress/stage, configure the official receiving bank details, and control request intake.
- The programme lifecycle is guarded: requests can open only with bank details marked verified; an administrator must resolve open investment/payment requests before starting operations; once operations have started, the intake for that investment cycle cannot be reopened. Settlement closes the cycle.


### Underlying projects within the pooled programme
- Only the single parent programme accepts investor requests and capital. Child records represent operations (for example livestock, orchards, seasonal crops and dairy), not independent investment products.
- Admin/SuperAdmin create and manage child projects, set status/progress, propose internal capital allocations, and keep reports/evidence tied to the relevant child. A second active administrator must review each capital allocation.
- Permanent deletion is permitted only before any linked operational, financial or allocation history exists; otherwise archive the project so audit/reporting history is preserved.
- Investors can open each child project and see its approved allocation, approved financial entries, approved field updates, progress and indicative pooled-capital proportion. The indicative proportion is informational, not a separate ownership claim or guarantee.
- The connected interface uses authenticated server-sent events to refresh the role-scoped snapshot immediately after a successful write, with a 10-second polling fallback if the event stream drops. Event messages carry no business data.

### Investor investment and bank-payment lifecycle
1. The investor completes profile/KYC and waits for identity verification.
2. The investor submits an **amount-based** request for the pooled programme. No money is due or transferred when submitting the request.
3. An administrator reviews and approves or declines the request.
4. After approval, the investor transfers the exact approved amount to the configured **organisation bank account only**, then submits the bank transaction reference and optional receipt.
5. An administrator independently checks that the funds actually arrived in the bank account. Only then does the app record the investment as active and make the generated investment record available in **My investments**.
6. During operations, administrators enter revenue/expenses with evidence. A different active administrator must review each entry; maker and checker cannot be the same person. Approved entries feed reports and close-out calculations. Profit/loss allocations use each investor's contributed capital proportion, not units.

The frontend does not initiate a bank transfer, connect to a bank, or independently verify a bank credit. Manual administrator confirmation in the demo is not a substitute for production bank reconciliation.

### Official/legal documents
- The legal-document vault starts empty; it does not generate legal files.
- An administrator manually uploads the original PDF or image (PDF, JPG, PNG or WebP, up to 1.5 MB in this demo).
- Administrators and investors can view and download the uploaded original file.
- The only automatically generated investment document is the investment record/deed in the investor's **My investments** section. Generated records are not published into the legal vault.

### Profile and nominee
- Profile/KYC labels use **Father Name** and **Mother Name**. Demo profile values use `Baba` and `Ma` respectively.
- Nominee relationship is always **Father** and the displayed nominee name follows Father Name.
- **Bank Details for Receiving Profit** supports account holder, account number, bank name and optional branch name.

### Notifications and Help & Support
- Notifications are visually categorized into finance, requests, support, documents, identity/account and programme updates, with unread highlighting and a mark-all-read action.
- Investors and field managers can message support in the app. Administrators see support conversations in the inbox, can reply, and receive a toast popup when a new message arrives in an open app session.
- In this frontend demo, messages synchronize only across tabs/windows of the same browser profile through local storage/BroadcastChannel. True multi-device, reliable real-time messaging requires an authenticated backend with WebSocket/SSE or an equivalent service.
- WhatsApp is linked as supplied by the project owner: `https://wa.me/8801742805845?text=Hello!%20I%20need%20some%20help`. **The displayed contact number (`+88 01885438711`) does not match the phone number embedded in that URL. Confirm the intended WhatsApp number before production launch.**

### Language
- A persistent **English / বাংলা** language toggle is available in authenticated pages and on both sign-in and registration screens.
- The frontend includes Bangla translations for navigation, common controls, core workflow labels, notifications and primary authentication copy. Some long descriptions, uncommon status messages, user-generated content and backend error text may remain in English; complete bilingual QA and copy review should be a launch task.

## Demo accounts

These are test-only identities. They are not real accounts and must never be used in production.

| Role | Email | Password |
|---|---|---|
| Investor | `investor@agrofund.test` | `Investor@123` |
| Field Manager | `field@agrofund.test` | `Field@123` |
| Administrator | `admin@agrofund.test` | `Admin@123` |
| SuperAdmin | `mainadmin@agrofund.test` | `MainAdmin@123` |

Demo verification code: `123456`.

The single pooled programme intentionally starts **Paused**, with visibly fake/unverified bank details. It must not be opened until an administrator configures and genuinely verifies Premium Agro's real organisation bank account. Demo identity documents include filenames/placeholders; submit actual test files if you need to exercise KYC review.

## Run locally

Use Node.js 20+ (Node.js 24 is suitable) and npm.

### Frontend demo mode (no MongoDB required)

From the project root, use PowerShell:

```powershell
Copy-Item .env.example .env.local
# Keep VITE_USE_MOCK=true for the browser-only demo
npm ci
npm run dev
```

### Backend-backed mode

Follow `INTEGRATION_GUIDE.md` and `backend/README.md`. Set up MongoDB Atlas, copy `backend/.env.example` to `backend/.env`, configure the private connection string and token secret, seed the single programme and first SuperAdmin, then start the API. Use `npm run seed:all` only for first initialization; it deliberately refuses to create a second SuperAdmin. For an existing database, use `npm run seed:projects` only to add missing default child-project records. Only after the API is running and MongoDB is connected, set `VITE_USE_MOCK=false` in the root `.env.local` and restart Vite.

### Available frontend checks

```powershell
npm run test:logic
npm run lint
npm run build
```

To reset the mock app, clear the site's local storage for the development origin, including the `agrofund.mock.db.v7`, `agrofund.mock.accounts`, and `agrofund.mock.password-overrides` keys.

## Frontend architecture

- `src/features/` — investor, administrator, field and shared page workflows.
- `src/services/api.js` — selects mock operations in demo mode or the remote API adapter when `VITE_USE_MOCK=false`.
- `src/services/remote-api.js` — maps the existing UI operation signatures to authenticated backend endpoints.
- `src/services/remote-store.js` — loads the server-authorized, role-scoped application snapshot.
- `src/services/mock/store-core.js` — demo state/persistence in mock mode; publishes the remote snapshot to existing React selectors in backend mode without allowing local business-data writes.
- `backend/src/modules/` — server-side authentication and business rules; `backend/src/models/` — MongoDB/Mongoose collections.
- `src/context/LanguageContext.jsx` — persistent English/Bangla language preference and translation dictionary.
- `tests/logic.test.mjs` — amount-based request/payment workflow, bank-only enforcement, maker-checker financial review, capital-based allocation, support messaging and manual legal document checks.

## Production launch checklist — required before accepting money

The integrated backend is included, but successful packaging or a local health check does not prove production readiness. Complete and independently verify all of the following before accepting money:

1. **Backend and database verification:** test every endpoint end-to-end against MongoDB, enforce role permissions and account state on the server, add migration/index management, idempotency and recovery-tested audit logging. Browser checks and local storage are not security boundaries.
2. **Real bank verification and reconciliation:** store organisation bank details securely; reconcile payment references against actual credited bank transactions; have a documented dual-control approval process and clear error/reversal procedures.
3. **Secure private files:** move identity proofs, payment receipts and legal documents out of local storage into authenticated private object storage, validate file content server-side, scan uploads and use expiring download permissions.
4. **Reliable support messaging:** the included integration stores messages in MongoDB and uses authenticated server-sent events for connected clients, with a 10-second polling fallback if a stream drops. Event messages carry no business data; each client re-fetches its own authorized snapshot.
5. **Legal/financial review:** have qualified local counsel review investment terms, disclosures, documents, nominee rules, handling of losses, tax/accounting treatment, investor reporting and any licensing/regulatory requirements before inviting investment.
6. **Bilingual and accessibility QA:** review every route in Bangla and English, keyboard navigation, mobile layouts, contrast, screen-reader labels and failure states with real users.
7. **Operational hardening:** production email/SMS delivery for OTP and password resets, rate limiting, CSRF/CORS/session review, monitoring/backups, incident response, recovery procedures and tests on the deployed hosting environment.
8. **Production data/configuration:** replace every demo bank account, seed investor, test credential and fake identity file; review the WhatsApp phone mismatch described above.

## Return and reporting conventions

Realized performance is based on approved financial entries and actual distributable proceeds. A distribution may include return of invested capital; it must not automatically be described as profit. The report distinguishes payout amount from realized gain/loss. Operational revenue/expense summaries and final settlement summaries describe different stages of activity and should not be added together as though they were separate gains. Approved financial entries are immutable in the demo; corrections use separately reviewed reversal entries. The equivalent controls must be enforced transactionally by the production backend.


## Underlying operating projects

Premium Agro remains one pooled investor-facing programme. Admin/SuperAdmin manage operational projects under that programme in **Admin → Underlying Agro Projects**. Investors browse the child projects from **Investment Programme**, open individual detail pages, view approved project financial entries and approved Field Manager logs, and see approved internal capital earmarks as indicative transparency data. Those earmarks are management records—not bank transfers or separate investor holdings. Connected sessions are refreshed after successful writes via authenticated server-sent events, with a 10-second polling fallback.


## Email verification setup

For email delivery of Admin/SuperAdmin/Field Manager sign-in codes and password-reset codes, follow [`EMAIL-VERIFICATION-SETUP.md`](./EMAIL-VERIFICATION-SETUP.md). The Resend API key belongs only in `backend/.env`.
