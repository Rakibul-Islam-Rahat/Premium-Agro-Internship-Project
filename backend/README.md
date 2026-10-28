# Premium Agro Backend

Node.js + Express + MongoDB/Mongoose API for the Premium Agro single pooled investment programme. The service is designed to work with the frontend adapter included in the full project package.

## Important before live use

This is a structured backend implementation and integration starter, not an independently audited financial system. Before real investments are accepted, configure and verify Resend email delivery in the deployment environment, move uploaded files from MongoDB data URLs to private managed object storage, add operational monitoring/backups/restore tests, complete security/legal review, and verify all financial scenarios with the organization/accounting adviser. The `bankVerified` flag records an authorized administrator's internal attestation; it does **not** query or verify a bank. Login and password-reset codes can be delivered by Resend email. Until Resend is configured, local development can print codes to the backend terminal; production fails closed when email delivery is not configured.

## Requirements

- Node.js 20+ (Node 24 is suitable)
- npm
- A MongoDB Atlas deployment or MongoDB replica-set deployment. Financial settlement uses a MongoDB transaction; a standalone non-replica-set MongoDB deployment cannot perform that transaction.

## 1. Install

In VS Code, open a terminal in the extracted project root, then enter the backend folder with `Set-Location .\backend` (or open a terminal directly in the `backend` folder):

```powershell
npm ci
```

## 2. Set up MongoDB Atlas

1. Create an Atlas project and a cluster.
2. Create a **database user** with access to the `premium_agro` database. This database user is separate from your Premium Agro website users.
3. Add your current development IP address to Atlas Network Access. Avoid opening the database to every IP (`0.0.0.0/0`) unless you have deliberately assessed that exposure and have a strong reason.
4. In Atlas, choose **Connect → Drivers → Node.js** and copy the URI. Replace the placeholder user/password and add the database name `premium_agro` in the URI path.
5. Never share the connection URI in ChatGPT, screenshots, source code, a frontend `.env`, or public GitHub.

## 3. Configure the private backend environment

```powershell
Copy-Item .env.example .env
```

Open `backend/.env` and set `MONGODB_URI`. Generate a private access-token secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Copy that output into `ACCESS_TOKEN_SECRET` in `backend/.env`. Keep `NODE_ENV=development` while local testing. Do not paste the URI or secret into chat.

For local development, `COOKIE_SECURE=false` and `FRONTEND_ORIGIN=http://localhost:5173` are appropriate for HTTP localhost. Production must use HTTPS, a production origin and secure cookies.

## 4. Initialize the programme and first SuperAdmin

The programme seed creates only one pooled programme, initially `PAUSED`, with unverified placeholder bank details. It does not create fake investor accounts or enable investment requests.

In `backend/.env`, set a unique `BOOTSTRAP_SUPERADMIN_EMAIL` and a strong `BOOTSTRAP_SUPERADMIN_PASSWORD` of at least 14 characters. Then run:

```powershell
npm run seed:all
```

The project seed is idempotent: existing project records are left unchanged. The SuperAdmin seeding script intentionally refuses to create a second SuperAdmin if one already exists. `npm run seed:all` is a first-initialization command; do not rerun it after the SuperAdmin exists. On an already initialized database, use `npm run seed:projects` only if you need to add any missing default project records. After successful first setup, remove `BOOTSTRAP_SUPERADMIN_PASSWORD` from `backend/.env` and store credentials securely. Do not commit `.env`.

## 5. Run and verify the backend

```powershell
npm test
npm run dev
```

Open `http://localhost:5000/api/v1/health`. A successful response includes `"status":"ok"` and `"database":"connected"`.

Keep this backend terminal running. To stop it, press `Ctrl+C`.

## 6. Connect the frontend

From the integrated project root (the folder containing the root `package.json`, `src/` and `backend/`):

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

The provided root `.env.example` intentionally keeps mock mode enabled by default:

```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_USE_MOCK=true
```

For real backend integration, edit the local `.env.local` only and set `VITE_USE_MOCK=false`. Do not change or commit the example template just to connect your own machine.

Vite must be restarted after changing environment variables. With `VITE_USE_MOCK=false`, the frontend reads its data from the backend's role-scoped snapshot and writes through the real API. Set `VITE_USE_MOCK=true` only when you deliberately want the browser-local demonstration mode.

### Verification-code behavior

Investor login does not request a second code. Field Manager, Administrator and SuperAdmin sign-ins require a six-digit one-time code. When Resend is configured, the code is emailed to the account's registered email address and expires after 10 minutes. Password-reset codes use the same email delivery path. In local development only, the terminal fallback may be used if no email provider is configured and `DEVELOPMENT_LOG_AUTH_CODES=true`. Turn this off once email delivery is tested; production refuses terminal code logging and requires email delivery settings.

### First-run admin workflow

- Sign in with the bootstrapped SuperAdmin account. When Resend is configured, the one-time code arrives at the account's registered email address; otherwise local development can use the terminal-only fallback.
- Use public registration to submit an Administrator application and approve it as SuperAdmin, or set up an administrator according to your organization’s approved provisioning process.
- Investor and Field Manager registration follows the intended two-stage review: Admin first, then SuperAdmin. A registration cannot sign in before all required approvals.
- The programme remains paused and requests remain closed until an authorized administrator saves the real receiving-bank details and internally attests that they have checked them.

## API outline

All endpoints below are prefixed with `/api/v1`. Auth routes are public unless otherwise noted; application and admin routes require a valid bearer access token.


### Underlying project management (the programme remains the only investment product)

- `POST /admin/agro-projects` — create an internal operating project.
- `PATCH /admin/agro-projects/:id` — edit an eligible project.
- `PATCH /admin/agro-projects/:id/status` — guarded project lifecycle transition.
- `PATCH /admin/agro-projects/:id/progress` — update the project's progress/stage.
- `DELETE /admin/agro-projects/:id` — permanent deletion only when no field, finance or capital-allocation history exists.
- `POST /admin/agro-projects/:id/archive` — preserve history while removing a project from the current investor catalogue.
- `POST /admin/project-funding` — propose an internal allocation from active pooled capital. This is an earmark/management decision, not a bank transfer.
- `POST /admin/project-funding/:id/review` — independent Admin/SuperAdmin approval or rejection; maker cannot approve their own proposal.

Investors request/invest only in the pooled programme. Underlying project amounts and investor-equivalent proportions are management transparency views, not separate legal holdings or segregated bank balances. Connected clients receive an authenticated server-sent event after successful writes and refetch their own role-scoped snapshot; a 10-second polling fallback covers dropped event streams. Event payloads contain no business data.

### Email verification (Resend)

To receive sign-in and password-reset codes by email instead of the terminal:

1. Create a Resend account and create an API key restricted to sending email. Official docs: https://resend.com/express
2. Add a sending domain in Resend and publish the DNS records it provides at your domain registrar. Wait until the domain is verified. Resend requires a verified domain to send from your own sender address: https://github.com/resend/resend-node
3. In the private `backend/.env`, set `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (for example, `"Premium Agro <auth@yourdomain.com>"`), and optionally `AUTH_EMAIL_REPLY_TO`.
4. Set `DEVELOPMENT_LOG_AUTH_CODES=false`, save the file, and restart the backend.
5. Sign in as Admin/SuperAdmin. The one-time code will arrive at the account's registered email. Test delivery and inspect Resend's Emails/Logs dashboard if the mail does not arrive.

Do not put `RESEND_API_KEY` in any frontend `VITE_` variable or commit it to version control. Do not set the sender address to a domain you have not verified. If no verified domain is available yet, leave terminal fallback enabled only on the local development machine; do not deploy that fallback.

## Authentication

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/verify`
- `POST /auth/refresh` (refresh token is an HttpOnly cookie)
- `POST /auth/logout`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`

### Application data and operations

- `GET /app/snapshot` — role-scoped state for frontend screens
- `POST /investment-requests`, `/investment-requests/:id/review`, `/investment-requests/:id/payment`, `/investment-requests/:id/payment-review`, `/investment-requests/:id/cancel`
- `POST /wallet/withdrawals`, `/wallet/transactions/:id/review`
- `POST /kyc`, `/kyc/:userId/review`, `PATCH /profile`
- `PATCH /programme`, `/programme/status`, `/programme/progress`
- `POST /field-logs`, `/field-logs/:id/review`
- `POST /admin/users`, `/admin/registrations/:userId/review`, `PATCH /admin/users/:userId/status`, `PATCH /admin/users/:userId/role`
- `POST /notifications/read`
- `POST /support/messages`, `/support/:threadId/reply`, `/support/:threadId/read`
- `POST /admin/documents`, `DELETE /admin/documents/:id`
- `POST /admin/financial-entries`, `/admin/financial-entries/:id/review`
- `POST /admin/allocations/preview`, `/admin/allocations`

The actor identity is derived from the authenticated server-side session/token. Client-provided `actorId`/`userId` values are not used to authorize actions.

## Design and security notes

- Passwords are hashed with bcrypt; password hashes are never returned in snapshots.
- Access tokens are short-lived and held in browser memory. Refresh credentials are stored in an HttpOnly cookie and rotated on refresh.
- The backend checks role, account state, ownership and workflow state; UI hiding alone is not security.
- Investment requests require active, approved investor accounts with verified KYC and an open programme. Payment is only accepted by bank transfer and must be reviewed before an investment is activated.
- Financial entries require an independent reviewer; a submitter cannot approve their own entry. Settlement runs in a transaction and checks approved ledger totals.
- Investor snapshots are scoped to their own records; admin snapshots require Admin/SuperAdmin permissions. Uploaded file data is only returned to roles/users allowed to access that record.
- Authenticated server-sent events notify connected clients after successful writes, and the frontend refetches its own role-scoped snapshot immediately. A 10-second polling fallback remains for reconnects. Event messages carry no business data; the snapshot is still authorized through the API.
- File data is currently stored as small data URLs in MongoDB for this integration. For production, move them to private object storage (for example, S3-compatible storage) and save metadata/keys in MongoDB.
- This code does not connect to a bank, deliver real email/SMS codes, or independently validate financial evidence. Those integrations and external review are required before live money is accepted.
