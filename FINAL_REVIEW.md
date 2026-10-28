# Final Review — Premium Agro Integrated Development Package

## Scope implemented
- One pooled investment programme; investors request capital into the programme, not separately into child projects.
- Internal operating-project catalogue: create, edit, guarded lifecycle/progress updates, safe deletion only with no linked history, archive retaining records.
- Internal capital allocation proposals reserve pooled capital and require a different active Admin/SuperAdmin to approve; transactional writes prevent concurrent proposals/reviews from over-reserving the same programme balance on transaction-capable MongoDB deployments. These are internal earmarks, not transfers or segregated holdings.
- Project-specific investor details include approved capital allocation, approved revenue/expenses, approved field updates/media, progress and indicative portion of programme capital.
- Authenticated server-sent events trigger immediate role-scoped snapshot refresh after successful writes; 10-second polling remains as a reconnect fallback. Event payloads carry no business data. The server explicitly closes long-lived SSE connections during shutdown.
- Backend authentication/roles, MongoDB models, seed scripts, API tests and backend `.env.example`.
- Resend HTTPS API integration for one-time login codes (Admin, SuperAdmin and Field Manager) and password-reset codes; frontend verification copy points users to their registered email address. The provider is not live until `RESEND_API_KEY` and a verified `AUTH_EMAIL_FROM` are configured by the project owner.
- Bank settings form no longer resets on ordinary snapshot refresh; editing bank fields clears its prior verification checkbox.

## Additional React stability fix
- Fixed Field Evidence Review's `Maximum update depth exceeded` error. The page no longer constructs a fresh array inside the `useSyncExternalStore` selector; it selects stable store references and derives the combined project list with `useMemo`.

## Checks / constraints
- Backend JavaScript syntax and frontend build/lint/tests must be run in the target Windows environment after `npm ci`; this workspace could not complete a full backend dependency install/Atlas connection during packaging. No claim of verified live MongoDB integration is made from this package build alone.
- A timezone-related date-only transaction validation bug was corrected to parse dates at UTC midnight. Proceeds preview now validates numeric inputs and valid settlement state rather than trusting UI form constraints.
- Database seeds are idempotent for the pooled programme/project records; `seed:all` is intended for initial creation only because it refuses to create a duplicate SuperAdmin.

## Not production-certified
This package is a development integration, not a guarantee that no future change is needed. Before accepting real money or sensitive identity documents, complete independent financial and security review, verified email provider settings and delivery monitoring, private object/file storage, actual bank reconciliation, durable audit/backups and restore tests, deployment-origin/HTTPS/session/CSRF review, alerting and full end-to-end testing. When no email provider is configured, local development can print OTP codes to the backend terminal only if `DEVELOPMENT_LOG_AUTH_CODES=true`; production startup requires email-provider configuration and rejects terminal-code mode. Review legal/regulatory obligations with qualified local counsel.
