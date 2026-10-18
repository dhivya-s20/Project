import { calculateAcademicSummary } from "./academicSummary.ts";
import type { ExtractedStudent, SubjectMark } from "./studentScanner.ts";
import { UploadFlowError } from "./uploadErrors.ts";

export type AcademicCertificateCategory =
  | "diploma_certificates"
  | "10th_state_board_certificates"
  | "10th_cbse_certificates"
  | "11th_state_board_certificates"
  | "11th_cbse_certificates"
  | "12th_state_board_certificates"
  | "12th_cbse_certificates";

export function subjectNeedsReview(subject: SubjectMark) {
  const obtainedKnown = subject.marksObtained !== null
    || (subject.theoryMarks !== null && subject.practicalMarks !== null);
  const maximumKnown = (subject.maximumMarks !== null && subject.maximumMarks > 0)
    || (subject.theoryMaximumMarks !== null && subject.theoryMaximumMarks > 0
      && subject.practicalMaximumMarks !== null && subject.practicalMaximumMarks > 0);
  const incompleteResult = subject.resultStatus === "unreadable"
    || (subject.resultStatus === "numeric" && (!obtainedKnown || !maximumKnown))
    || (subject.resultStatus === "absent" && !maximumKnown)
    || (subject.resultStatus === "grade" && !subject.gradeValue.trim());
  return subject.needsReview || incompleteResult;
}

export function getAutomaticExtractionError(student: ExtractedStudent, isAcademic: boolean) {
  if (!student.studentName.trim() || student.studentNameConfidence < 80) {
    return "We couldn’t confidently read the student name. Please upload a clearer, well-lit image of the certificate.";
  }
  if (isAcademic) {
    if (student.subjectMarks.length === 0) {
      return "We couldn’t identify any subject rows. Please upload a clearer image showing the complete marks table.";
    }
    if (student.subjectMarks.some(subjectNeedsReview)) {
      return "The subject marks could not be read reliably. Please upload a clearer image.";
    }
    const summary = calculateAcademicSummary(student.subjectMarks, student.officialTotalMarks);
    if (summary.totalMarks === null || summary.maximumTotalMarks === null || summary.totalMismatch === true) {
      return "The academic results could not be validated. Please upload a clearer image.";
    }
    if (student.officialPercentage !== null && summary.percentage !== null
      && Math.abs(summary.percentage - student.officialPercentage) > 0.05) {
      return "The academic results could not be validated. Please upload a clearer image.";
    }
    if (student.officialMaximumTotalMarks !== null
      && Math.abs(summary.maximumTotalMarks - student.officialMaximumTotalMarks) > 0.01) {
      return "The academic results could not be validated. Please upload a clearer image.";
    }
  }
  return null;
}

export function confirmAcademicSaveResponse(
  savedId: unknown,
  error: unknown,
  expectedId: string,
  category: AcademicCertificateCategory,
) {
  if (error) {
    throw new UploadFlowError("certificate_record", `Supabase rejected the atomic save into ${category}.`, error);
  }
  if (savedId !== expectedId) {
    throw new UploadFlowError("certificate_record", `Supabase did not confirm the atomic save into ${category}.`);
  }
}

export function buildAcademicSaveArguments(
  category: AcademicCertificateCategory,
  baseRecord: Record<string, unknown>,
  student: ExtractedStudent,
) {
  const summary = calculateAcademicSummary(student.subjectMarks, student.officialTotalMarks);
  const reviewFields = new Set(student.reviewFields);
  const studentName = student.studentName.trim();
  if (!studentName || student.studentNameConfidence < 80) reviewFields.add("student_name");
  else reviewFields.delete("student_name");
  if (summary.totalMismatch) reviewFields.add("total_mismatch");
  else reviewFields.delete("total_mismatch");
  if (summary.totalMarks === null || summary.maximumTotalMarks === null) reviewFields.add("academic_summary");
  else reviewFields.delete("academic_summary");
  if (summary.percentage !== null && student.officialPercentage !== null
    && Math.abs(summary.percentage - student.officialPercentage) > 0.05) {
    reviewFields.add("official_percentage_mismatch");
  } else {
    reviewFields.delete("official_percentage_mismatch");
  }
  if (summary.maximumTotalMarks !== null && student.officialMaximumTotalMarks !== null
    && Math.abs(summary.maximumTotalMarks - student.officialMaximumTotalMarks) > 0.01) {
    reviewFields.add("official_maximum_mismatch");
  } else {
    reviewFields.delete("official_maximum_mismatch");
  }
  if (student.subjectMarks.length) reviewFields.delete("subject_marks");
  else reviewFields.add("subject_marks");
  student.subjectMarks.forEach((subject, index) => {
    if (subjectNeedsReview(subject)) reviewFields.add(`subject_marks.${index}`);
    else reviewFields.delete(`subject_marks.${index}`);
  });

  const certificate = {
    ...baseRecord,
    student_name: studentName || null,
    exam_year: student.examYear,
    exam_session: student.examSession || null,
    board_name: student.boardName || null,
    institution_name: student.institutionName || null,
    student_name_confidence: Number(student.studentNameConfidence.toFixed(2)),
    total_marks: summary.totalMarks,
    maximum_total_marks: summary.maximumTotalMarks,
    percentage: summary.percentage,
    official_total_marks: student.officialTotalMarks,
    official_maximum_total_marks: student.officialMaximumTotalMarks,
    official_percentage: student.officialPercentage,
    total_mismatch: summary.totalMismatch,
    needs_review: reviewFields.size > 0,
    review_fields: [...reviewFields],
    ocr_confidence: student.ocrConfidence,
  };

  const subjectRows = student.subjectMarks.map((subject, sortOrder) => ({
    sort_order: sortOrder,
    subject_name: subject.subjectName.trim(),
    marks_obtained: subject.marksObtained,
    maximum_marks: subject.maximumMarks !== null && subject.maximumMarks > 0 ? subject.maximumMarks : null,
    theory_marks: subject.theoryMarks,
    theory_maximum_marks: subject.theoryMaximumMarks !== null && subject.theoryMaximumMarks > 0 ? subject.theoryMaximumMarks : null,
    practical_marks: subject.practicalMarks,
    practical_maximum_marks: subject.practicalMaximumMarks !== null && subject.practicalMaximumMarks > 0 ? subject.practicalMaximumMarks : null,
    result_status: subject.resultStatus,
    grade_value: subject.gradeValue || null,
    raw_marks: subject.rawMarks || null,
    is_optional: subject.isOptional,
    confidence: Number(subject.confidence.toFixed(2)),
    needs_review: subjectNeedsReview(subject),
  }));

  return {
    p_category: category,
    p_certificate: certificate,
    p_subject_marks: subjectRows,
  };
}
