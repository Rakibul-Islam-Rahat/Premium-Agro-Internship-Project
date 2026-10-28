# Premium Agro — Email verification setup (Resend)

This project sends six-digit sign-in codes to the registered email address for Field Manager, Admin and SuperAdmin accounts. Password-reset codes use the same provider. Codes expire after 10 minutes, are stored as hashes, and can be used once.

## 1. Set up a sender with Resend

1. Create or sign in to your account at https://resend.com/.
2. In the Resend dashboard, open **Domains** and add a domain you own or are authorized to manage.
3. Resend will display DNS records. Add those exact records at the DNS host for your domain, then wait until Resend marks the domain verified. See https://github.com/resend/resend-node for the official Node SDK instructions and sender-domain note.
4. In **API Keys**, create a key with **Sending access** and restrict it to the verified sender domain where available. Copy the key immediately and keep it private.

A provider's test sender may be limited. For real Premium Agro authentication emails, use a sender address on your verified domain (for example `auth@yourdomain.com`). Do not send from a domain you do not own/control.

## 2. Add the secrets to the backend

Open the private `backend/.env` file in VS Code. Do not put these values in the frontend `.env.local` and do not commit this file.

Set these values, retaining your existing `MONGODB_URI`, `ACCESS_TOKEN_SECRET`, and other working settings:

```dotenv
RESEND_API_KEY=re_your_real_key_here
AUTH_EMAIL_FROM="Premium Agro <auth@yourdomain.com>"
AUTH_EMAIL_REPLY_TO=support@yourdomain.com
DEVELOPMENT_LOG_AUTH_CODES=false
```

- Replace `re_your_real_key_here` with your actual Resend API key.
- Replace `auth@yourdomain.com` with a sender address on the verified domain.
- `AUTH_EMAIL_REPLY_TO` is optional; use an inbox that is actually monitored or leave it blank.
- Do not include quote marks around the API key. Keep quotes around the full `AUTH_EMAIL_FROM` value when it includes a display name and angle brackets.
- Keep `DEVELOPMENT_LOG_AUTH_CODES=false` so verification codes are not printed to the terminal. With the provider configured, email delivery is used; if email is misconfigured, the app fails closed rather than silently falling back to logging codes.

## 3. Restart and test

1. In the backend terminal, press `Ctrl+C`.
2. From the `backend` folder run `npm test` and then `npm run dev`.
3. In a browser, open the frontend and sign in as an existing Admin/SuperAdmin account.
4. The six-digit code should arrive at that account's registered email address. Check Inbox and Spam/Junk.
5. In the Resend dashboard, open **Emails** or **Logs** to check whether the provider accepted or rejected the email. A `2xx` API result means Resend accepted the request; still verify that the email reaches the inbox.
6. Test the Forgot Password flow; the reset code should use the same email provider.

If the email does not arrive, check in this order: Resend shows the sender domain as verified; `AUTH_EMAIL_FROM` exactly matches that domain; the API key is active and has sending permission; the registered account email is correct; then inspect Resend's error/log status. Never paste the API key or full `backend/.env` into chat.

## 4. Important behavior

- Investor login does not use a second sign-in code in the current application. Field Manager, Admin and SuperAdmin do.
- The code is not embedded in the web page or returned by the API.
- Local terminal-code delivery is only a development fallback when no Resend provider is configured and `DEVELOPMENT_LOG_AUTH_CODES=true`. Do not deploy with that fallback enabled.
- If an account's email address in MongoDB is incorrect, the code goes to that stored address; correct the account email through the proper account-management process rather than changing the delivery recipient from the browser.
- Configure a verified sender before deploying to production. Sending an email successfully is not, by itself, a complete production security review.

Official provider references:

- Resend + Express: https://resend.com/express
- Official Resend Node.js SDK and verified sender-domain note: https://github.com/resend/resend-node
- Resend API keys and permissions: https://resend.com/changelog/new-api-key-permissions
