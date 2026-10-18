import assert from "node:assert/strict";
import test from "node:test";
import { buildAcademicSaveArguments, confirmAcademicSaveResponse, requiresAcademicReviewBeforeSave } from "./academicSavePayload.ts";

const categories = [
  "diploma_certificates",
  "10th_state_board_certificates",
  "10th_cbse_certificates",
  "11th_state_board_certificates",
  "11th_cbse_certificates",
  "12th_state_board_certificates",
  "12th_cbse_certificates",
];

const student = (overrides = {}) => ({
  studentName: "Ananya Rao",
  studentNameConfidence: 96,
  registerNumber: "REG-1042",
  dateOfBirth: "12/06/2008",
  examYear: 2025,
  examSession: "March",
  boardName: "State Board",
  institutionName: "Example Higher Secondary School",
  officialTotalMarks: 178,
  officialMaximumTotalMarks: 200,
  officialPercentage: 89,
  subjectMarks: [
    {
      subjectName: "Tamil", marksObtained: 88, maximumMarks: 100,
      theoryMarks: null, theoryMaximumMarks: null, practicalMarks: null,
      practicalMaximumMarks: null, resultStatus: "numeric", gradeValue: "",
      rawMarks: "88 / 100", isOptional: false, confidence: 96, needsReview: false,
    },
    {
      subjectName: "Botany", marksObtained: 90, maximumMarks: 100,
      theoryMarks: 70, theoryMaximumMarks: 80, practicalMarks: 20,
      practicalMaximumMarks: 20, resultStatus: "numeric", gradeValue: "",
      rawMarks: "", isOptional: false, confidence: 94, needsReview: false,
    },
  ],
  reviewFields: [],
  ocrConfidence: 95,
  ...overrides,
});

test("maps every academic category to the exact RPC category argument", () => {
  for (const category of categories) {
    const payload = buildAcademicSaveArguments(category, { id: "parent-id" }, student());
    assert.equal(payload.p_category, category);
    assert.equal(payload.p_certificate.id, "parent-id");
  }
});

test("passes the extracted student name and complete subject rows with SQL column names", () => {
  const payload = buildAcademicSaveArguments("12th_state_board_certificates", {
    id: "parent-id",
    owner_id: "owner-id",
    document_type: "12th_state_board_certificates",
    register_number: "REG-1042",
  }, student());

  assert.equal(payload.p_certificate.student_name, "Ananya Rao");
  assert.equal(payload.p_certificate.register_number, "REG-1042");
  assert.deepEqual(payload.p_subject_marks.map((row) => [row.subject_name, row.marks_obtained, row.maximum_marks]), [
    ["Tamil", 88, 100],
    ["Botany", 90, 100],
  ]);
  assert.equal(payload.p_subject_marks[1].theory_marks, 70);
  assert.equal(payload.p_subject_marks[1].practical_marks, 20);
  assert.deepEqual(Object.keys(payload), ["p_category", "p_certificate", "p_subject_marks"]);
});

test("missing student names are not fabricated and are explicitly flagged for review", () => {
  const payload = buildAcademicSaveArguments("10th_cbse_certificates", {}, student({
    studentName: "  ",
    studentNameConfidence: 0,
  }));

  assert.equal(payload.p_certificate.student_name, null);
  assert.equal(payload.p_certificate.needs_review, true);
  assert.ok(payload.p_certificate.review_fields.includes("student_name"));
  assert.equal(requiresAcademicReviewBeforeSave(student({ studentName: "", studentNameConfidence: 0 })), true);
});

test("empty OCR subject results are explicitly marked for review, not represented as invented rows", () => {
  const payload = buildAcademicSaveArguments("diploma_certificates", {}, student({ subjectMarks: [] }));

  assert.deepEqual(payload.p_subject_marks, []);
  assert.ok(payload.p_certificate.review_fields.includes("subject_marks"));
  assert.equal(payload.p_certificate.total_marks, null);
  assert.equal(requiresAcademicReviewBeforeSave(student({ subjectMarks: [] })), true);
});

test("confident names with extracted subjects can use automatic saving", () => {
  assert.equal(requiresAcademicReviewBeforeSave(student()), false);
});

test("does not treat an RPC error or unexpected returned ID as a successful save", () => {
  assert.throws(() => confirmAcademicSaveResponse(null, {
    code: "42501",
    message: "row-level security denied insert",
  }, "parent-id", "12th_state_board_certificates"), /Supabase rejected the atomic save/);
  assert.throws(() => confirmAcademicSaveResponse("different-id", null, "parent-id", "12th_state_board_certificates"), /did not confirm the atomic save/);
  assert.doesNotThrow(() => confirmAcademicSaveResponse("parent-id", null, "parent-id", "12th_state_board_certificates"));
});
