import { createWorker } from "tesseract.js";
import { UploadFlowError } from "./uploadErrors";

export type ExtractedStudent = {
  studentName: string;
  registerNumber: string;
  dateOfBirth: string;
};

function preprocessImage(file: File): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const imageUrl = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(imageUrl);
        reject(new Error("Your browser could not prepare this image."));
        return;
      }
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(imageUrl);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error("This image could not be opened. Try another photo."));
    };
    image.src = imageUrl;
  });
}

function cropRegion(source: HTMLCanvasElement, x: number, y: number, width: number, height: number) {
  const crop = document.createElement("canvas");
  crop.width = width;
  crop.height = height;
  const context = crop.getContext("2d");
  context?.drawImage(source, x, y, width, height, 0, 0, width, height);
  return crop;
}

function cleanStudentName(text: string) {
  return text
    .replace(/NAME OF THE CANDIDATE|DATE OF BIRTH|PERMANENT REGISTER NUMBER/gi, "")
    .replace(/[^A-Za-z .]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
}

function extractRegisterNumber(text: string) {
  const match = text.match(/\b\d{10}\b/);
  if (match) return match[0];
  const digits = text.replace(/[^0-9]/g, "");
  return digits.length >= 10 ? digits.slice(0, 10) : "";
}

function extractDateOfBirth(text: string) {
  return text.match(/\b(0?[1-9]|[12][0-9]|3[01])[/.-](0?[1-9]|1[0-2])[/.-](19|20)\d{2}\b/)?.[0]
    .replace(/[.-]/g, "/") ?? "";
}

export async function extractStudentDetails(file: File): Promise<ExtractedStudent> {
  let source: HTMLCanvasElement;
  try {
    source = await preprocessImage(file);
  } catch (error) {
    throw new UploadFlowError("image_decode", "Could not decode the selected image.", error);
  }

  let worker: Awaited<ReturnType<typeof createWorker>>;
  try {
    worker = await createWorker("eng");
  } catch (error) {
    throw new UploadFlowError("ocr_initialization", "Tesseract.js could not initialize its English worker.", error);
  }

  const readRegion = async (canvas: HTMLCanvasElement) => {
    const { data } = await worker.recognize(canvas);
    return data.text.replace(/[\r\n]/g, " ").replace(/\s+/g, " ").trim();
  };

  try {
    const { width, height } = source;
    const nameText = await readRegion(cropRegion(source, Math.floor(width * 0.07), Math.floor(height * 0.225), Math.floor(width * 0.25), Math.floor(height * 0.065)));
    const dobText = await readRegion(cropRegion(source, Math.floor(width * 0.07), Math.floor(height * 0.255), Math.floor(width * 0.25), Math.floor(height * 0.055)));
    const registerText = await readRegion(cropRegion(source, Math.floor(width * 0.28), Math.floor(height * 0.255), Math.floor(width * 0.37), Math.floor(height * 0.055)));
    return {
      studentName: cleanStudentName(nameText),
      dateOfBirth: extractDateOfBirth(dobText),
      registerNumber: extractRegisterNumber(registerText),
    };
  } catch (error) {
    throw new UploadFlowError("ocr_recognition", "Tesseract.js could not recognize text in the selected image.", error);
  } finally {
    try {
      await worker.terminate();
    } catch {
      // Worker cleanup failure should not hide the OCR result or its real error.
    }
  }
}
