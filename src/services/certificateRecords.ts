import { supabase } from "../supabaseClient";
import type { ExtractedStudent } from "./studentScanner";
import { buildAcademicSaveArguments, confirmAcademicSaveResponse, type AcademicCertificateCategory } from "./academicSavePayload";
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

export async function saveCertificate(
  file: File,
  student: ExtractedStudent,
  category: DocumentCategory,
  mode: "insert" | "update" = "insert",
) {
  const extension = IMAGE_EXTENSIONS[file.type];
  if (!extension) throw new Error("Choose a JPG, PNG, or WEBP image to upload.");

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw new UploadFlowError("authentication", "Could not verify the signed-in account.", userError);
  }
  if (!user) throw new UploadFlowError("authentication", "No authenticated user was found.");

  const id = await deterministicRecordId(user.id, category, file);
  let saveMode = mode;
  if (mode === "update" && !ACADEMIC_CATEGORIES.has(category)) {
    throw new UploadFlowError("certificate_record", "Only academic certificate records can be corrected here.");
  }
  if (mode === "insert") {
    const { data: existingRecord, error: existingRecordError } = await supabase
      .from(category)
      .select("id, verification_status")
      .eq("id", id)
      .maybeSingle();
    if (existingRecordError) {
      throw new UploadFlowError("certificate_record", `Could not check for an existing ${category} record.`, existingRecordError);
    }
    if (existingRecord) {
      if (ACADEMIC_CATEGORIES.has(category) && existingRecord.verification_status === "pending") {
        // Retry-safe IDs let us reconcile an earlier partial/legacy pending row
        // and atomically replace its subject rows through the correction RPC.
        saveMode = "update";
      } else {
        return { inserted: false, updated: false, id };
      }
    }
  }

  const filePath = `${user.id}/${category}/${id}.${extension}`;
  const storage = supabase.storage.from("student-certificates");
  const objectExists = async () => {
    const directory = filePath.slice(0, filePath.lastIndexOf("/"));
    const fileName = filePath.slice(filePath.lastIndexOf("/") + 1);
    const { data, error } = await storage.list(directory, { search: fileName, limit: 10 });
    if (error) throw new UploadFlowError("storage_upload", "Could not verify a previous private upload.", error);
    return data.some((object) => object.name === fileName);
  };

  const uploadedObjectExists = await objectExists();
  if (saveMode === "insert" && !uploadedObjectExists) {
    const { error: uploadError } = await storage.upload(filePath, file, { contentType: file.type, upsert: false });
    if (uploadError && !(await objectExists())) {
      throw new UploadFlowError("storage_upload", "Supabase Storage rejected the certificate upload.", uploadError);
    }
  } else if (saveMode === "update" && !uploadedObjectExists) {
    // A previous attempt may have written the parent before Storage completed.
    // Recreate the deterministic private object path before reconciling its row.
    const { error: uploadError } = await storage.upload(filePath, file, { contentType: file.type, upsert: false });
    if (uploadError && !(await objectExists())) {
      throw new UploadFlowError("storage_upload", "The private certificate file could not be restored for correction.", uploadError);
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
    const rpcArguments = buildAcademicSaveArguments(category as AcademicCertificateCategory, record, student);
    const { data: savedId, error: rpcError } = await supabase.rpc(saveMode === "update" ? "update_academic_certificate" : "save_academic_certificate", {
      ...rpcArguments,
    });
    if (rpcError) {
      if (saveMode === "insert" && rpcError.code === "23505") {
        const { data: retryRecord, error: retryLookupError } = await supabase
          .from(category)
          .select("id")
          .eq("id", id)
          .maybeSingle();
        if (!retryLookupError && retryRecord) return { inserted: false, updated: false, id };
      }
    }
    confirmAcademicSaveResponse(savedId, rpcError, id, category as AcademicCertificateCategory);
    return { inserted: saveMode === "insert", updated: saveMode === "update", id };
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
      if (!retryLookupError && retryRecord) return { inserted: false, updated: false, id };
    }
    throw new UploadFlowError("certificate_record", `Supabase rejected the insert into ${category}.`, insertError);
  }

  if (!insertedRecord?.id) {
    throw new UploadFlowError("certificate_record", `Supabase did not confirm the insert into ${category}.`);
  }
  return { inserted: true, updated: false, id };
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
