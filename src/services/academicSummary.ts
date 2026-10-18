export type AcademicSummary = {
  totalMarks: number | null;
  maximumTotalMarks: number | null;
  percentage: number | null;
  totalMismatch: boolean | null;
};

type AcademicSubjectResult = {
  isOptional: boolean;
  resultStatus: "numeric" | "absent" | "grade" | "unreadable";
  marksObtained: number | null;
  maximumMarks: number | null;
  theoryMaximumMarks: number | null;
  practicalMaximumMarks: number | null;
  needsReview: boolean;
};

export function calculateAcademicSummary(subjects: AcademicSubjectResult[], officialTotalMarks: number | null): AcademicSummary {
  const counted = subjects.filter((subject) => !subject.isOptional);
  const allObtainedKnown = counted.length > 0 && counted.every((subject) =>
    (subject.resultStatus === "numeric" && subject.marksObtained !== null && !subject.needsReview) ||
    (subject.resultStatus === "absent" && !subject.needsReview),
  );
  const allMaximumsKnown = allObtainedKnown && counted.every((subject) =>
    subject.maximumMarks !== null || (subject.theoryMaximumMarks !== null && subject.practicalMaximumMarks !== null),
  );
  const totalMarks = allObtainedKnown
    ? counted.reduce((total, subject) => total + (subject.resultStatus === "absent" ? 0 : subject.marksObtained ?? 0), 0)
    : null;
  const maximumTotalMarks = allMaximumsKnown
    ? counted.reduce((total, subject) => total + (subject.maximumMarks ?? (subject.theoryMaximumMarks ?? 0) + (subject.practicalMaximumMarks ?? 0)), 0)
    : null;
  const percentage = totalMarks !== null && maximumTotalMarks !== null && maximumTotalMarks > 0
    ? Number(((totalMarks / maximumTotalMarks) * 100).toFixed(2))
    : null;
  const totalMismatch = totalMarks !== null && officialTotalMarks !== null
    ? Math.abs(totalMarks - officialTotalMarks) > 0.01
    : null;
  return { totalMarks, maximumTotalMarks, percentage, totalMismatch };
}
