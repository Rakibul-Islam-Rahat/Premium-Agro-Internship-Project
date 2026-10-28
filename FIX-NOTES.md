# Premium Agro integration fix notes

## Programme bank-settings form reset

The remote-mode application refreshes the role-scoped API snapshot every 10 seconds so notifications and support updates stay current. The Programme Settings screen previously reset its form every time a snapshot arrived, overwriting unsaved bank/account input.

The updated form now tracks dirty (unsaved) input and ignores background snapshot refreshes until the Admin saves. After a successful save, it synchronizes to the latest authoritative state. Editing any receiving-bank detail automatically clears the existing bank verification attestation; the Admin must explicitly check the confirmation again before saving the changed details.

## Windows DNS SRV workaround

`backend/src/config/db.js` preserves a development-only workaround for Windows DNS SRV resolution errors. It sets DNS resolvers only on Windows when `NODE_ENV` is not `production`. Production deployments must use their deployment's approved resolver/network configuration.

## Local configuration

Keep `backend/.env` private and do not include it in archives or Git. Re-create it from `backend/.env.example` in a new checkout, then set the Atlas URI and unique secrets locally.

## Field Evidence Review maximum update depth error

`src/features/admin/FieldApprovals.jsx` previously combined `agroProjects` and `projects` inside a `useDb` selector. Because `useDb` uses React's `useSyncExternalStore`, this selector returned a newly allocated array every time React read the store snapshot. That violates the stable-snapshot requirement and can trigger a repeated render/update loop on the Field Evidence Review route. The selector now reads the two stable arrays separately and combines them with `useMemo`. No database migration or reseed is required for this frontend fix.
