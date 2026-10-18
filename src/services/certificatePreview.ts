const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function getSupportedCertificateMimeType(file: Pick<File, "name" | "type">): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const declaredMimeType = file.type.toLowerCase();
  const normalizedMimeType = declaredMimeType === "image/jpg"
    ? "image/jpeg"
    : ["image/jpeg", "image/png", "image/webp"].includes(declaredMimeType)
      ? declaredMimeType
      : IMAGE_MIME_BY_EXTENSION[extension];

  return normalizedMimeType ?? null;
}

export function canConfirmCertificatePreview(
  hasFile: boolean,
  previewReady: boolean,
  previewFailed: boolean,
  busy: boolean,
): boolean {
  return hasFile && previewReady && !previewFailed && !busy;
}

export function createSubmissionGuard() {
  let active = false;

  return {
    acquire() {
      if (active) return false;
      active = true;
      return true;
    },
    release() {
      active = false;
    },
  };
}
