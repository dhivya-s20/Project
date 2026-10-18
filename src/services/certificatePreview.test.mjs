import assert from "node:assert/strict";
import test from "node:test";
import { canConfirmCertificatePreview, createSubmissionGuard, getSupportedCertificateMimeType } from "./certificatePreview.ts";

test("recognizes supported certificate image extensions and normalizes JPEG MIME types", () => {
  assert.equal(getSupportedCertificateMimeType({ name: "certificate.jpg", type: "image/jpg" }), "image/jpeg");
  assert.equal(getSupportedCertificateMimeType({ name: "certificate.jpeg", type: "" }), "image/jpeg");
  assert.equal(getSupportedCertificateMimeType({ name: "certificate.png", type: "application/octet-stream" }), "image/png");
  assert.equal(getSupportedCertificateMimeType({ name: "certificate.webp", type: "image/webp" }), "image/webp");
  assert.equal(getSupportedCertificateMimeType({ name: "certificate.gif", type: "image/gif" }), null);
});

test("requires an actually loaded preview and an idle workflow before confirmation", () => {
  assert.equal(canConfirmCertificatePreview(true, false, false, false), false);
  assert.equal(canConfirmCertificatePreview(true, true, true, false), false);
  assert.equal(canConfirmCertificatePreview(true, true, false, true), false);
  assert.equal(canConfirmCertificatePreview(true, true, false, false), true);
  assert.equal(canConfirmCertificatePreview(false, true, false, false), false);
});

test("submission guard prevents concurrent duplicate confirmations and releases after work", () => {
  const guard = createSubmissionGuard();
  assert.equal(guard.acquire(), true);
  assert.equal(guard.acquire(), false);
  guard.release();
  assert.equal(guard.acquire(), true);
});
