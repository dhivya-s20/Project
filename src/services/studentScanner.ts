import { createWorker } from "tesseract.js";
import { supabase } from "../supabaseClient";

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
  return text.match(/\b(0?[1-9]|[12][0-9]|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](19|20)\d{2}\b/)?.[0]
    .replace(/[.-]/g, "/") ?? "";
}

function toIsoDate(value: string) {
  const parts = value.split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export async function extractStudentDetails(file: File): Promise<ExtractedStudent> {
  const source = await preprocessImage(file);
  const worker = await createWorker("eng");
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
  } finally {
    await worker.terminate();
  }
}

export async function saveStudent(student: ExtractedStudent) {
  if (!student.studentName && !student.registerNumber && !student.dateOfBirth) {
    throw new Error("We couldn’t read student details from this certificate. Try a sharper, well-lit image.");
  }

  const studentData: Record<string, any> = {};
  if (student.studentName) studentData.student_name = student.studentName;
  if (student.registerNumber) {
    studentData.register_number = student.registerNumber;
    studentData.edutrio_student_id = `ET-${student.registerNumber}`;
  }
  if (student.dateOfBirth) studentData.date_of_birth = toIsoDate(student.dateOfBirth);

  if (student.registerNumber) {
    const { data, error } = await supabase
      .from("01_student_information")
      .select("id")
      .eq("register_number", student.registerNumber)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) {
      const { error: updateError } = await supabase
        .from("01_student_information")
        .update(studentData)
        .eq("id", data.id);
      if (updateError) throw updateError;
      return;
    }
  }

  const { error } = await supabase.from("01_student_information").insert(studentData);
  if (error) throw error;
}
