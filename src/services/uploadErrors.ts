export type UploadFailureStage =
  | "image_decode"
  | "ocr_initialization"
  | "ocr_recognition"
  | "authentication"
  | "storage_upload"
  | "certificate_record";

export class UploadFlowError extends Error {
  readonly stage: UploadFailureStage;
  readonly originalError: unknown;

  constructor(stage: UploadFailureStage, message: string, originalError?: unknown) {
    super(message);
    this.name = "UploadFlowError";
    this.stage = stage;
    this.originalError = originalError;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function safeDetail(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  return value
    .replace(/Failing row contains .+/gi, "Failing row contains [redacted]")
    .replace(/\(([^()]*)\)=\(([^()]*)\)/g, "($1)=([redacted])")
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, "[redacted identifier]")
    .replace(/\b\d{10,16}\b/g, "[redacted number]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]");
}

function originalError(error: unknown): unknown {
  return error instanceof UploadFlowError ? (error.originalError ?? error) : error;
}

function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error ? String(error.code) : "";
}

function errorStatus(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  if ("statusCode" in error) return String(error.statusCode);
  return "status" in error ? String(error.status) : "";
}

function errorText(error: unknown): string {
  return errorMessage(error).toLowerCase();
}

export function safeUploadErrorDetails(error: unknown) {
  const rootError = error instanceof UploadFlowError ? (error.originalError ?? error) : error;
  const rawMessage = errorMessage(rootError);
  const code = rootError && typeof rootError === "object" && "code" in rootError
    ? String(rootError.code)
    : undefined;
  const errorFields = rootError && typeof rootError === "object" ? rootError : undefined;
  const details = errorFields && "details" in errorFields ? safeDetail(errorFields.details) : undefined;
  const hint = errorFields && "hint" in errorFields ? safeDetail(errorFields.hint) : undefined;

  return {
    message: safeDetail(rawMessage) ?? "[no error message]",
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
    ...(hint ? { hint } : {}),
  };
}

export function uploadFailureMessage(error: unknown): string {
  if (error instanceof UploadFlowError) {
    const rootError = originalError(error);
    const code = errorCode(rootError);
    const status = errorStatus(rootError);
    const text = errorText(rootError);
    switch (error.stage) {
      case "image_decode":
        return "This image could not be opened. Try saving it as JPG, PNG, or WEBP and upload it again.";
      case "ocr_initialization":
        return "The text scanner could not start. Check your internet connection and try again.";
      case "ocr_recognition":
        return "The text scanner could not read this image. Try a clearer, well-lit photo.";
      case "authentication":
        return "Your sign-in could not be verified. Sign out and sign in again before uploading.";
      case "storage_upload":
        if (status === "403" || code === "403" || /row-level security|row level security|policy|permission denied/.test(text)) {
          return "Storage blocked this upload by its access policy. Confirm you are signed in and that your account is allowed to upload to its private folder.";
        }
        if (status === "404" || /bucket.*not found|not found.*bucket/.test(text)) {
          return "The private certificate Storage bucket was not found. Ask an administrator to check the student-certificates bucket configuration.";
        }
        return "The certificate file could not be uploaded. Check your connection or ask an administrator to check private Storage access.";
      case "certificate_record":
        if (code === "42501" || status === "401" || status === "403" || /row-level security|row level security|permission denied/.test(text)) {
          return "The database denied access to this certificate record. Sign in again and ask an administrator to verify the table’s RLS policy for your account.";
        }
        if (code === "PGRST205" || code === "42P01") {
          return "The selected certificate table was not found in Supabase. Ask an administrator to verify that the matching table exists and is exposed through the API.";
        }
        if (code === "PGRST204" || code === "42703") {
          return "The selected certificate table is missing a column required by the upload. Ask an administrator to compare its columns with the application schema.";
        }
        if (code === "PGRST202" || code === "42883") {
          return "The academic certificate save function is not available in Supabase yet. Apply the academic marks migration, then retry the upload.";
        }
        if (["23502", "22P02", "23514", "22007"].includes(code)) {
          return "Supabase rejected an extracted value because it does not match the selected table’s required data format.";
        }
        return "The file was uploaded privately, but its certificate record could not be saved. Ask an administrator to check the selected table and access rules.";
    }
  }

  return "The upload could not be completed. Try again; if it continues, ask an administrator to check the browser console.";
}
