export type UploadFailureStage =
  | "image_decode"
  | "ocr_initialization"
  | "ocr_recognition"
  | "student_record"
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

export function safeUploadErrorDetails(error: unknown) {
  const rootError = error instanceof UploadFlowError ? (error.originalError ?? error) : error;
  const details = errorMessage(rootError);
  const code = rootError && typeof rootError === "object" && "code" in rootError
    ? String(rootError.code)
    : undefined;

  return {
    message: details
      .replace(/\b\d{10,12}\b/g, "[redacted number]")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted email]")
      .replace(/\(([^()]*)\)=\(([^()]*)\)/g, "($1)=([redacted])"),
    ...(code ? { code } : {}),
  };
}

export function uploadFailureMessage(error: unknown): string {
  if (error instanceof UploadFlowError) {
    switch (error.stage) {
      case "image_decode":
        return "This image could not be opened. Try saving it as JPG, PNG, or WEBP and upload it again.";
      case "ocr_initialization":
        return "The text scanner could not start. Check your internet connection and try again.";
      case "ocr_recognition":
        return "The text scanner could not read this image. Try a clearer, well-lit photo.";
      case "student_record":
        return "The certificate was read, but the student record could not be saved. Check your connection and try again.";
      case "authentication":
        return "Your sign-in could not be verified. Sign out and sign in again before uploading.";
      case "storage_upload":
        return "The certificate file could not be uploaded. Check your connection or ask an administrator to check private Storage access.";
      case "certificate_record":
        return "The file was uploaded privately, but its certificate record could not be saved. Ask an administrator to check the selected table and access rules.";
    }
  }

  return "The upload could not be completed. Try again; if it continues, ask an administrator to check the browser console.";
}
