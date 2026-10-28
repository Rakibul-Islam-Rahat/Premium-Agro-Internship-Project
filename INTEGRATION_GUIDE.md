# Premium Agro: Run the integrated frontend and backend

This package preserves the React/Vite frontend and adds a separate `backend/` project. The frontend talks to the backend over HTTP; the backend enforces business rules and uses MongoDB for persistence.

## Folder layout

```text
Premium-Agro-Project/
├── src/                       # React frontend
├── tests/                     # Existing frontend logic tests
├── backend/
│   ├── .env.example           # Backend-only configuration template
│   ├── src/
│   │   ├── config/             # Environment and MongoDB connection
│   │   ├── middleware/         # Authentication, roles and errors
│   │   ├── models/             # Mongoose collections
│   │   ├── modules/            # Auth and business logic
│   │   ├── routes/             # Express endpoints
│   │   └── server.js           # API entry point
│   ├── scripts/                # Programme and SuperAdmin seed scripts
│   ├── tests/                  # Backend API tests
│   ├── .env.example
│   └── package.json
├── .env.example               # Vite configuration
└── package.json               # Frontend scripts and dependencies
```

## Before running setup commands

- Keep your existing `backend/.env` private and back it up before replacing project files. Never include it in a ZIP or commit it.
- If this MongoDB database already has the Premium Agro SuperAdmin/programme, **do not run `npm run seed:all` again**. That command is for first initialization only. To add the default operating-project records to an already initialized database, run `npm run seed:projects` instead. Use the same exact `MONGODB_URI` as the database that already contains your SuperAdmin; changing the URI database path points the app at a different database.
- If you are setting up a genuinely new, empty database, follow the first-time seed steps below.

## First start (two terminals)

### Terminal A — MongoDB-backed API

1. Install/configure Atlas and populate `backend/.env` using `backend/.env.example` as the template.
2. Set `BOOTSTRAP_SUPERADMIN_EMAIL` and a strong `BOOTSTRAP_SUPERADMIN_PASSWORD` in `backend/.env`.
3. Run:

```powershell
Set-Location .\backend
npm ci
# First-time setup on an empty database only:
npm run seed:all
npm test
npm run dev
```

Open `http://localhost:5000/api/v1/health`; the JSON should say the database is connected.

### Terminal B — React frontend

```powershell
Set-Location <project-root>
Copy-Item .env.example .env.local
# Once the backend is running and MongoDB is configured, edit .env.local:
# set VITE_USE_MOCK=false
npm ci
npm run dev
```

Open the Vite URL printed in Terminal B. The environment example preserves `VITE_USE_MOCK=true` so the existing demo still runs by default. After the backend is configured and running, set `VITE_USE_MOCK=false` in `.env.local` to use the API. Vite environment settings are read at startup; restart Vite after changing them.

## How the connection works

- `src/config/env.js` selects `http://localhost:5000/api/v1` as the API base URL.
- `src/services/http.js` attaches the short-lived bearer access token and refreshes it through an HttpOnly cookie when needed.
- `src/services/remote-api.js` maps the existing UI operations to backend endpoints.
- `src/services/remote-store.js` refreshes the authenticated, role-scoped snapshot from `/app/snapshot`.
- `src/services/mock/store-core.js` publishes that snapshot to existing `useDb()` hooks; local mock writes are disabled in remote mode.
- Express routes call domain logic, enforce roles/ownership, and persist to separate MongoDB collections through Mongoose.

This integration was written to preserve the frontend component signatures. Keep `VITE_USE_MOCK=true` when you specifically want the original browser-only demo instead.

## Important limitations before production

The backend cannot be considered production-ready merely because the app starts. Production still requires a real email/SMS provider for OTP/reset delivery, private object storage for identity/legal/evidence files, real payment/bank reconciliation, audit/security review, environment-secret management, monitoring and tested backups. Local dev OTP/reset codes are written to the backend console. Do not use real investor data or accept actual funds until those items are completed and tested.

## Pooled programme and operational projects

The main `investmentPrograms` document remains the sole investor-facing investment product. Internal operations live in `agroProjects`, with independent capital earmark/review records in `projectFundingAllocations`. These allocations are management records, not external bank transfers. Investor views contain approved field logs and approved financial data; connected clients receive an authenticated server-sent event when records change and refetch their own role-scoped snapshot, with a 10-second polling fallback. Event payloads contain no business data. Projects with history must be archived instead of permanently deleted.


## Resend email verification

Admin, SuperAdmin and Field Manager sign-in codes and password-reset codes can be emailed through Resend. Configure `RESEND_API_KEY` and `AUTH_EMAIL_FROM` in the private `backend/.env`; the sender must belong to a verified domain in Resend. Then set `DEVELOPMENT_LOG_AUTH_CODES=false` and restart the backend. See `backend/README.md` for the setup steps. The Resend API key must never be placed in a frontend `VITE_` variable.
