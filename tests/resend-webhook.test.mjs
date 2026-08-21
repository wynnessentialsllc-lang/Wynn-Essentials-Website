import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { verifyResendWebhook } from "../lib/resend-webhook.ts";

const rawSecret = crypto.randomBytes(32);
const secret = `whsec_${rawSecret.toString("base64")}`;
const payload = JSON.stringify({ type: "email.opened", data: { email_id: "email_123" } });

function signedHeaders(timestamp = Math.floor(Date.now() / 1000), body = payload) {
  const id = "msg_test_event";
  const signature = crypto.createHmac("sha256", rawSecret).update(`${id}.${timestamp}.${body}`).digest("base64");
  return new Headers({ "svix-id": id, "svix-timestamp": String(timestamp), "svix-signature": `v1,${signature}` });
}

test("accepts an authentic Resend webhook", () => {
  process.env.RESEND_WEBHOOK_SECRET = secret;
  assert.equal(verifyResendWebhook(payload, signedHeaders()), true);
});

test("rejects changed payloads and stale events", () => {
  process.env.RESEND_WEBHOOK_SECRET = secret;
  assert.equal(verifyResendWebhook(`${payload} `, signedHeaders()), false);
  assert.equal(verifyResendWebhook(payload, signedHeaders(Math.floor(Date.now() / 1000) - 601)), false);
});
