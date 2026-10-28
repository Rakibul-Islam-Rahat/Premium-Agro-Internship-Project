import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { app } from "../src/app.js";

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

test("health endpoint returns a successful JSON response", async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.status, "ok");
  assert.equal(body.data.service, "premium-agro-backend");
  assert.equal(body.data.database, "disconnected");
});

test("unknown non-API routes return 404", async () => {
  const response = await fetch(`${baseUrl}/not-a-route`);
  const body = await response.json();
  assert.equal(response.status, 404);
  assert.equal(body.success, false);
});

test("the app snapshot is protected by authentication", async () => {
  const response = await fetch(`${baseUrl}/api/v1/app/snapshot`);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

test("invalid public registration data returns a validation error", async () => {
  const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "x", email: "not-an-email", password: "123" }),
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.success, false);
});

test("the live update event stream is protected by authentication", async () => {
  const response = await fetch(`${baseUrl}/api/v1/events`);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});
