import assert from "node:assert/strict";
import test from "node:test";
import { UploadFlowError, uploadFailureMessage } from "./uploadErrors.ts";

test("reports an RPC failure as a database save problem", () => {
  const error = new UploadFlowError("certificate_record", "Atomic academic save failed.", {
    code: "42501",
    message: "new row violates row-level security policy",
  });

  assert.match(uploadFailureMessage(error), /database denied access/i);
});

test("reports an unavailable RPC without claiming the record was saved", () => {
  const error = new UploadFlowError("certificate_record", "RPC missing.", {
    code: "PGRST202",
    message: "Could not find the function",
  });

  assert.match(uploadFailureMessage(error), /academic certificate save function is not available/i);
  assert.match(uploadFailureMessage(error), /correction migrations/i);
});
