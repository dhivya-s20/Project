import assert from "node:assert/strict";
import test from "node:test";
import { parseStudentName } from "./academicName.ts";

test("prefers the explicitly labeled student name", () => {
  assert.deepEqual(parseStudentName([
    "Father's Name: Karthik Kumar",
    "Student Name: Ananya Rao",
  ]), { value: "Ananya Rao", lineIndex: 1 });
});

test("does not treat a father's or mother's name as the student name", () => {
  assert.equal(parseStudentName([
    "Name of Father: Karthik Kumar",
    "Mother's Name: Meena Kumar",
    "School Name: Central School",
  ]), null);
});

test("stops a same-line student name before the parent name label", () => {
  assert.deepEqual(parseStudentName([
    "Name: Ananya Rao Father's Name: Karthik Kumar",
  ]), { value: "Ananya Rao", lineIndex: 0 });
});

test("accepts a generic standalone name label", () => {
  assert.deepEqual(parseStudentName(["Name: Ananya Rao"]), {
    value: "Ananya Rao",
    lineIndex: 0,
  });
});
