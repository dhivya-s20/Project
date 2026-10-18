import { supabase } from "../supabaseClient";
import { calculateAcademicSummary, type ExtractedStudent, type SubjectMark } from "./studentScanner";
import { UploadFlowError } from "./uploadErrors";

export const DOCUMENT_CATEGORIES = [
  ["diploma_certificates", "Diploma certificate"],
  ["10th_state_board_certificates", "10th State Board certificate"],
  ["10th_cbse_certificates", "10th CBSE certificate"],
  ["11th_state_board_certificates", "11th State Board certificate"],
  ["11th_cbse_certificates", "11th CBSE certificate"],
  ["12th_state_board_certificates", "12th State Board certificate"],
  ["12th_cbse_certificates", "12th CBSE certificate"],
  ["aadhaar_cards", "Aadhaar card"],
  ["community_certificates", "Community certificate"],
  ["birth_certificates", "Birth certificate"],
  ["10th_tc_certificates", "10th Transfer Certificate"],
  ["12th_tc_certificates", "12th Transfer Certificate"],
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number][0];

export const ACADEMIC_CATEGORIES = new Set<DocumentCategory>([
  "diploma_certificates",
  "10th_state_board_certificates",
  "10th_cbse_certificates",
  "11th_state_board_certificates",
  "11th_cbse_certificates",
  "12th_state_board_certificates",
  "12th_cbse_certificates",
]);

const REGISTER_NUMBER_CATEGORIES = new Set<DocumentCategory>([
  "diploma_certificates",
  "10th_state_board_certificates",
  "10th_cbse_certificates",
  "11th_state_board_certificates",
  "11th_cbse_certificates",
  "12th_state_board_certificates",
  "12th_cbse_certificates",
  "10th_tc_certificates",
  "12th_tc_certificates",
]);

const DOB_CATEGORIES = new Set<DocumentCategory>([
  "diploma_certificates",
  "10th_state_board_certificates",
  "10th_cbse_certificates",
  "11th_state_board_certificates",
  "11th_cbse_certificates",
  "12th_state_board_certificates",
  "12th_cbse_certificates",
  "aadhaar_cards",
  "birth_certificates",
  "10th_tc_certificates",
  "12th_tc_certificates",
]);

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function subjectNeedsReview(subject: SubjectMark) {
  const obtainedKnown = subject.marksObtained !== null
    || (subject.theoryMarks !== null && subject.practicalMarks !== null);
  const maximumKnown = subject.maximumMarks !== null
    || (subject.theoryMaximumMarks !== null && subject.practicalMaximumMarks !== null);
  const incompleteResult = subject.resultStatus === "unreadable"
    || (subject.resultStatus === "numeric" && (!obtainedKnown || !maximumKnown))
    || (subject.resultStatus === "absent" && !maximumKnown)
    || (subject.resultStatus === "grade" && !subject.gradeValue.trim());
  return subject.needsReview || incompleteResult;
}

export async function saveCertificate(file: File, student: ExtractedStudent, category: DocumentCategory) {
  const extension = IMAGE_EXTENSIONS[file.type];
  if (!extension) throw new Error("Choose a JPG, PNG, or WEBP image to upload.");

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw new UploadFlowError("authentication", "Could not verify the signed-in account.", userError);
  }
  if (!user) throw new UploadFlowError("authentication", "No authenticated user was found.");

  const id = await deterministicRecordId(user.id, category, file);
  const { data: existingRecord, error: existingRecordError } = await supabase
    .from(category)
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (existingRecordError) {
    throw new UploadFlowError("certificate_record", `Could not check for an existing ${category} record.`, existingRecordError);
  }
  if (existingRecord) return { inserted: false };

  const filePath = `${user.id}/${category}/${id}.${extension}`;
  const storage = supabase.storage.from("student-certificates");
  const objectExists = async () => {
    const directory = filePath.slice(0, filePath.lastIndexOf("/"));
    const fileName = filePath.slice(filePath.lastIndexOf("/") + 1);
    const { data, error } = await storage.list(directory, { search: fileName, limit: 10 });
    if (error) throw new UploadFlowError("storage_upload", "Could not verify a previous private upload.", error);
    return data.some((object) => object.name === fileName);
  };

  if (!(await objectExists())) {
    const { error: uploadError } = await storage.upload(filePath, file, { contentType: file.type, upsert: false });
    if (uploadError && !(await objectExists())) {
      throw new UploadFlowError("storage_upload", "Supabase Storage rejected the certificate upload.", uploadError);
    }
  }

  const record: Record<string, unknown> = {
    id,
    owner_id: user.id,
    document_type: category,
    file_url: filePath,
    file_name: file.name,
    verification_status: "pending",
  };
  if (student.studentName.trim()) record.student_name = student.studentName.trim();
  if (REGISTER_NUMBER_CATEGORIES.has(category) && student.registerNumber) {
    record.register_number = student.registerNumber;
  }
  if (DOB_CATEGORIES.has(category) && student.dateOfBirth) {
    const [day, month, year] = student.dateOfBirth.split("/");
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (!day || !month || !year || parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) {
      throw new UploadFlowError("certificate_record", "The reviewed date of birth is not a valid DD/MM/YYYY date.");
    }
    record.date_of_birth = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  if (ACADEMIC_CATEGORIES.has(category)) {
    const summary = calculateAcademicSummary(student.subjectMarks, student.officialTotalMarks);
    const reviewFields = new Set(student.reviewFields);
    if (!student.studentName || student.studentNameConfidence < 80) reviewFields.add("student_name");
    else reviewFields.delete("student_name");
    if (summary.totalMismatch) reviewFields.add("total_mismatch");
    else reviewFields.delete("total_mismatch");
    if (summary.totalMarks === null || summary.maximumTotalMarks === null) reviewFields.add("academic_summary");
    else reviewFields.delete("academic_summary");
    const percentageMismatch = summary.percentage !== null && student.officialPercentage !== null
      && Math.abs(summary.percentage - student.officialPercentage) > 0.05;
    if (percentageMismatch) reviewFields.add("official_percentage_mismatch");
    else reviewFields.delete("official_percentage_mismatch");
    const maximumMismatch = summary.maximumTotalMarks !== null && student.officialMaximumTotalMarks !== null
      && Math.abs(summary.maximumTotalMarks - student.officialMaximumTotalMarks) > 0.01;
    if (maximumMismatch) reviewFields.add("official_maximum_mismatch");
    else reviewFields.delete("official_maximum_mismatch");
    if (student.subjectMarks.length) reviewFields.delete("subject_marks");
    student.subjectMarks.forEach((subject, index) => {
      if (subjectNeedsReview(subject)) reviewFields.add(`subject_marks.${index}`);
      else reviewFields.delete(`subject_marks.${index}`);
    });
    record.exam_year = student.examYear;
    record.exam_session = student.examSession || null;
    record.board_name = student.boardName || null;
    record.institution_name = student.institutionName || null;
    record.student_name_confidence = Number(student.studentNameConfidence.toFixed(2));
    record.total_marks = summary.totalMarks;
    record.maximum_total_marks = summary.maximumTotalMarks;
    record.percentage = summary.percentage;
    record.official_total_marks = student.officialTotalMarks;
    record.official_maximum_total_marks = student.officialMaximumTotalMarks;
    record.official_percentage = student.officialPercentage;
    record.total_mismatch = summary.totalMismatch;
    record.needs_review = reviewFields.size > 0;
    record.review_fields = [...reviewFields];
    record.ocr_confidence = student.ocrConfidence;

    const subjectRows = student.subjectMarks.map((subject, sortOrder) => ({
      sort_order: sortOrder,
      subject_name: subject.subjectName,
      marks_obtained: subject.marksObtained,
      maximum_marks: subject.maximumMarks,
      theory_marks: subject.theoryMarks,
      theory_maximum_marks: subject.theoryMaximumMarks,
      practical_marks: subject.practicalMarks,
      practical_maximum_marks: subject.practicalMaximumMarks,
      result_status: subject.resultStatus,
      grade_value: subject.gradeValue || null,
      raw_marks: subject.rawMarks || null,
      is_optional: subject.isOptional,
      confidence: Number(subject.confidence.toFixed(2)),
      needs_review: subjectNeedsReview(subject),
    }));

    const { data: savedId, error: rpcError } = await supabase.rpc("save_academic_certificate", {
      p_category: category,
      p_certificate: record,
      p_subject_marks: subjectRows,
    });
    if (rpcError) {
      if (rpcError.code === "23505") {
        const { data: retryRecord, error: retryLookupError } = await supabase
          .from(category)
          .select("id")
          .eq("id", id)
          .maybeSingle();
        if (!retryLookupError && retryRecord) return { inserted: false };
      }
      throw new UploadFlowError("certificate_record", `Supabase rejected the atomic save into ${category}.`, rpcError);
    }
    if (savedId !== id) {
      throw new UploadFlowError("certificate_record", `Supabase did not confirm the atomic save into ${category}.`);
    }
    return { inserted: true };
  }

  const { data: insertedRecord, error: insertError } = await supabase
    .from(category)
    .insert(record)
    .select("id")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      const { data: retryRecord, error: retryLookupError } = await supabase
        .from(category)
        .select("id")
        .eq("id", id)
        .maybeSingle();
      if (!retryLookupError && retryRecord) return { inserted: false };
    }
    throw new UploadFlowError("certificate_record", `Supabase rejected the insert into ${category}.`, insertError);
  }

  if (!insertedRecord?.id) {
    throw new UploadFlowError("certificate_record", `Supabase did not confirm the insert into ${category}.`);
  }
  return { inserted: true };
}

async function deterministicRecordId(userId: string, category: DocumentCategory, file: File) {
  try {
    const identity = new TextEncoder().encode(`${userId}:${category}:`);
    const contents = new Uint8Array(await file.arrayBuffer());
    const input = new Uint8Array(identity.length + contents.length);
    input.set(identity);
    input.set(contents, identity.length);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
    const bytes = digest.slice(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x80;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch (error) {
    throw new UploadFlowError("certificate_record", "Could not create a retry-safe certificate record key.", error);
  }
}
