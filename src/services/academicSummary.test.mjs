import assert from "node:assert/strict";
import test from "node:test";
import { calculateAcademicSummary } from "./academicSummary.ts";

const numeric = (marksObtained, maximumMarks, options = {}) => ({
  isOptional: false,
  resultStatus: "numeric",
  marksObtained,
  maximumMarks,
  theoryMaximumMarks: null,
  practicalMaximumMarks: null,
  needsReview: false,
  ...options,
});

test("calculates total and percentage from different subject maximums", () => {
  assert.deepEqual(calculateAcademicSummary([
    numeric(45, 50),
    numeric(72, 100),
    numeric(36, 40),
  ], 153), {
    totalMarks: 153,
    maximumTotalMarks: 190,
    percentage: 80.53,
    totalMismatch: false,
  });
});

test("excludes optional subjects and flags a printed-total mismatch", () => {
  assert.deepEqual(calculateAcademicSummary([
    numeric(80, 100),
    numeric(70, 100),
    numeric(99, 100, { isOptional: true }),
  ], 151), {
    totalMarks: 150,
    maximumTotalMarks: 200,
    percentage: 75,
    totalMismatch: true,
  });
});

test("does not double count component marks when the subject total is present", () => {
  assert.deepEqual(calculateAcademicSummary([
    numeric(50, 60, { theoryMaximumMarks: 40, practicalMaximumMarks: 20 }),
  ], 50), {
    totalMarks: 50,
    maximumTotalMarks: 60,
    percentage: 83.33,
    totalMismatch: false,
  });
});

test("counts absent as zero and does not infer marks from grades", () => {
  assert.equal(calculateAcademicSummary([
    numeric(70, 100),
    { ...numeric(null, 100), resultStatus: "absent" },
  ], 70).percentage, 35);
  assert.equal(calculateAcademicSummary([
    { ...numeric(null, null), resultStatus: "grade" },
  ], null).totalMarks, null);
});
