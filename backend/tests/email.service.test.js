import test, { after } from "node:test";
import assert from "node:assert/strict";

// Configure the module under test before dynamically importing its env-backed service.
process.env.NODE_ENV = "test";
process.env.RESEND_API_KEY = "re_test_key_only";
process.env.AUTH_EMAIL_FROM = "Premium Agro <auth@example.test>";
process.env.AUTH_EMAIL_REPLY_TO = "";
process.env.DEVELOPMENT_LOG_AUTH_CODES = "false";

const originalFetch = globalThis.fetch;
let nextStatus = 200;
let nextPayload = { id: "email_test_123" };
let lastRequest;
globalThis.fetch = async (url, options) => {
  lastRequest = { url, options, body: JSON.parse(options.body) };
  return new Response(JSON.stringify(nextPayload), {
    status: nextStatus,
    headers: { "content-type": "application/json" },
  });
};

const { sendAuthCodeEmail } = await import("../src/modules/email.service.js");

after(() => {
  globalThis.fetch = originalFetch;
});

test("auth email is sent to the account address through the server-side provider", async () => {
  nextStatus = 200;
  nextPayload = { id: "email_test_123" };
  const result = await sendAuthCodeEmail({ to: "Admin@Example.com", code: "024681", purpose: "LOGIN" });

  assert.equal(result.id, "email_test_123");
  assert.equal(lastRequest.url, "https://api.resend.com/emails");
  assert.equal(lastRequest.options.headers.Authorization, "Bearer re_test_key_only");
  assert.deepEqual(lastRequest.body.to, ["admin@example.com"]);
  assert.match(lastRequest.body.subject, /verification code/i);
  assert.match(lastRequest.body.text, /024681/);
  assert.equal(lastRequest.body.from, "Premium Agro <auth@example.test>");
});

test("provider rejection fails closed without returning a successful send result", async () => {
  nextStatus = 401;
  nextPayload = { name: "invalid_api_key" };
  await assert.rejects(
    sendAuthCodeEmail({ to: "admin@example.com", code: "024681", purpose: "LOGIN" }),
    (error) => error?.status === 503 && /could not send the verification email/i.test(error.message),
  );
});
