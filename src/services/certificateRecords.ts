import { supabase } from "../supabaseClient";
import type { ExtractedStudent } from "./studentScanner";
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
  ["tc_10th_certificates", "10th Transfer Certificate"],
  ["tc_12th_certificates", "12th Transfer Certificate"],
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number][0];

const REGISTER_NUMBER_CATEGORIES = new Set<DocumentCategory>([
  "diploma_certificates",
  "10th_state_board_certificates",
  "10th_cbse_certificates",
  "11th_state_board_certificates",
  "11th_cbse_certificates",
  "12th_state_board_certificates",
  "12th_cbse_certificates",
  "tc_10th_certificates",
  "tc_12th_certificates",
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
  "tc_10th_certificates",
  "tc_12th_certificates",
]);

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function saveCertificate(file: File, student: ExtractedStudent, category: DocumentCategory) {
  const extension = IMAGE_EXTENSIONS[file.type];
  if (!extension) throw new Error("Choose a JPG, PNG, or WEBP image to upload.");

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) {
    throw new UploadFlowError("authentication", "Could not verify the signed-in account.", userError);
  }
  if (!user) throw new UploadFlowError("authentication", "No authenticated user was found.");

  const filePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("student-certificates")
    .upload(filePath, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    throw new UploadFlowError("storage_upload", "Supabase Storage rejected the certificate upload.", uploadError);
  }

  const record: Record<string, string> = {
    owner_id: user.id,
    document_type: category,
    file_url: filePath,
    file_name: file.name,
  };
  if (student.studentName) record.student_name = student.studentName;
  if (REGISTER_NUMBER_CATEGORIES.has(category) && student.registerNumber) {
    record.register_number = student.registerNumber;
  }
  if (DOB_CATEGORIES.has(category) && student.dateOfBirth) {
    const [day, month, year] = student.dateOfBirth.split("/");
    record.date_of_birth = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const { error: insertError } = await supabase.from(category).insert(record);
  if (insertError) {
    throw new UploadFlowError("certificate_record", `Supabase rejected the insert into ${category}.`, insertError);
  }
}
