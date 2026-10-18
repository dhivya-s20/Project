import assert from "node:assert/strict";
import test from "node:test";
import { parseSubjectRows } from "./studentScanner.ts";

test("keeps printed Biology, Botany, and Zoology as distinct subject rows", () => {
  const subjects = parseSubjectRows([
    { text: "Biology 88 100", confidence: 92 },
    { text: "Botany marks obtained: 70 maximum marks: 80", confidence: 96 },
    { text: "Zoology marks obtained: 18 maximum marks: 20", confidence: 95 },
  ], 94);

  assert.deepEqual(subjects.map(({ subjectName }) => subjectName), ["Biology", "Botany", "Zoology"]);
  assert.equal(subjects[0].marksObtained, null);
  assert.equal(subjects[0].needsReview, true);
  assert.equal(subjects[1].marksObtained, 70);
  assert.equal(subjects[2].maximumMarks, 20);
});

test("combines printed theory and practical components once and preserves the component values", () => {
  const subjects = parseSubjectRows([
    { text: "Physics Theory Obtained 70 Maximum 80", confidence: 94 },
    { text: "Physics Practical Obtained 18 Maximum 20", confidence: 93 },
  ], 94);

  assert.equal(subjects.length, 1);
  assert.equal(subjects[0].subjectName, "Physics");
  assert.equal(subjects[0].theoryMarks, 70);
  assert.equal(subjects[0].practicalMarks, 18);
  assert.equal(subjects[0].marksObtained, 88);
  assert.equal(subjects[0].maximumMarks, 100);
});
