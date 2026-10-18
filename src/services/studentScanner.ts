import { createWorker } from "tesseract.js";
import { parseStudentName } from "./academicName.ts";
import { UploadFlowError } from "./uploadErrors.ts";

export { calculateAcademicSummary } from "./academicSummary.ts";

export type SubjectResultStatus = "numeric" | "absent" | "grade" | "unreadable";

export type SubjectMark = {
  subjectName: string;
  marksObtained: number | null;
  maximumMarks: number | null;
  theoryMarks: number | null;
  theoryMaximumMarks: number | null;
  practicalMarks: number | null;
  practicalMaximumMarks: number | null;
  resultStatus: SubjectResultStatus;
  gradeValue: string;
  rawMarks: string;
  isOptional: boolean;
  confidence: number;
  needsReview: boolean;
};

export type ExtractedStudent = {
  studentName: string;
  studentNameConfidence: number;
  registerNumber: string;
  dateOfBirth: string;
  examYear: number | null;
  examSession: string;
  boardName: string;
  institutionName: string;
  officialTotalMarks: number | null;
  officialMaximumTotalMarks: number | null;
  officialPercentage: number | null;
  subjectMarks: SubjectMark[];
  reviewFields: string[];
  ocrConfidence: number;
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

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseLabeledValue(lines: string[], expression: RegExp, validate = (value: string) => value.length > 0) {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(expression);
    if (!match) continue;
    const sameLineValue = cleanText(match[1] ?? "").replace(/^[:\s|.-]+/, "");
    if (sameLineValue && validate(sameLineValue)) return { value: sameLineValue, lineIndex: index };
    const nextLine = cleanText(lines[index + 1] ?? "");
    if (nextLine && !/^(name|date|dob|register|roll|class|standard|subject|maximum|marks|total)\b/i.test(nextLine) && validate(nextLine)) {
      return { value: nextLine, lineIndex: index + 1 };
    }
  }
  return null;
}

function parseDate(value: string) {
  const match = value.match(/\b(0?[1-9]|[12]\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})\b/);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function numberToken(value: string): number | null {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10000 ? parsed : null;
}

function emptySubject(subjectName: string, confidence: number, rawMarks = ""): SubjectMark {
  return {
    subjectName,
    marksObtained: null,
    maximumMarks: null,
    theoryMarks: null,
    theoryMaximumMarks: null,
    practicalMarks: null,
    practicalMaximumMarks: null,
    resultStatus: "unreadable",
    gradeValue: "",
    rawMarks,
    isOptional: /\boptional\b/i.test(subjectName),
    confidence,
    needsReview: true,
  };
}

const SKIP_SUBJECT_LINE = /^\s*(?:subjects?|register|registration|roll|candidate|student|date of birth|dob|exam(?:ination)? year|school|college|board|certificate|statement|result|grade|maximum marks|marks obtained|grand total|total marks|overall|percentage|per cent|signature|principal|controller|serial no|certificate no)\b/i;
const SUBJECT_ROW_END = /(?:\d{1,4}(?:\.\d{1,2})?|ABSENT|AB|PASS|FAIL|O|A1|A2|B1|B2|C1|C2|[A-F][+-]?)$/i;
const NUMERIC_TOKEN = /\d{1,4}(?:\.\d{1,2})?/g;

function detectMarkColumnOrder(lines: Array<{ text: string }>): "obtained_maximum" | "maximum_obtained" | null {
  for (let index = 0; index < lines.length; index += 1) {
    const headerText = lines.slice(index, index + 3).map(({ text }) => text).join(" ").toLowerCase();
    if (!/\b(?:subject|paper)\b/i.test(headerText)) continue;
    const maximumPosition = headerText.search(/\b(?:maximum|max\.?)\s*(?:marks?)?\b/i);
    const obtainedPosition = headerText.search(/\b(?:marks?\s+(?:obtained|secured|scored)|(?:obtained|secured|scored)\s+marks?)\b/i);
    if (maximumPosition >= 0 && obtainedPosition >= 0 && maximumPosition !== obtainedPosition) {
      return obtainedPosition < maximumPosition ? "obtained_maximum" : "maximum_obtained";
    }
  }
  return null;
}

function subjectNameFromLine(line: string) {
  const explicit = line.match(/\b(?:theory|practical)\b/i);
  let name = explicit ? line.slice(0, explicit.index) : line;
  name = name
    .replace(/(?:marks?\s*)?(?:obtained|secured|scored)\s*[:=-]?\s*\d{1,4}(?:\.\d{1,2})?/gi, " ")
    .replace(/(?:maximum|max\.?)\s*(?:marks?)?\s*[:=-]?\s*\d{1,4}(?:\.\d{1,2})?/gi, " ")
    .replace(/\s+(?:(?:\d{1,4}(?:\.\d{1,2})?|ABSENT|AB|PASS|FAIL|O|A1|A2|B1|B2|C1|C2|[A-F][+-]?)(?:\s*[/|]\s*|\s+)?)+$/i, "");
  name = cleanText(name
    .replace(/[:|•▪]+/g, " ")
    .replace(/\b(?:theory|practical)\b/gi, " ")
    .replace(/\b(?:marks?\s*(?:obtained|secured)|obtained|secured|maximum|max\.?)\b[:=-]?/gi, " "));
  return name.replace(/[\s:;,.-]+$/g, "");
}

export function parseSubjectRows(lines: Array<{ text: string; confidence: number }>, ocrConfidence: number): SubjectMark[] {
  const rows: SubjectMark[] = [];
  const markColumnOrder = detectMarkColumnOrder(lines);
  for (const entry of lines) {
    const rawLine = entry.text;
    let line = cleanText(rawLine.replace(/[\t]+/g, " "));
    const serialPrefix = /^\s*\d{1,3}(?:[.)-]\s*|\s+)/;
    const hasTwoTrailingScores = (line.match(NUMERIC_TOKEN) ?? []).length >= 3;
    const numberedSubject = /^\s*\d{1,3}[.)-]\s+/.test(line)
      || (markColumnOrder !== null && hasTwoTrailingScores && /^\s*\d{1,3}\s+[\p{L}]/u.test(line));
    if (numberedSubject && serialPrefix.test(line)) {
      line = line.replace(serialPrefix, "");
    }
    if (line.length < 3 || !SUBJECT_ROW_END.test(line) || SKIP_SUBJECT_LINE.test(line)) continue;
    const subjectName = subjectNameFromLine(line);
    if (!subjectName || !/[\p{L}]/u.test(subjectName) || subjectName.length > 80) continue;

    const rawMarks = line.match(/((?:(?:\d{1,4}(?:\.\d{1,2})?|ABSENT|AB|PASS|FAIL|O|A1|A2|B1|B2|C1|C2|[A-F][+-]?)(?:\s+|\s*[/|]\s*))+\s*(?:\d{1,4}(?:\.\d{1,2})?|ABSENT|AB|PASS|FAIL|O|A1|A2|B1|B2|C1|C2|[A-F][+-]?))$/i)?.[1]?.trim()
      ?? line.match(/\s(ABSENT|AB|PASS|FAIL|O|A1|A2|B1|B2|C1|C2|[A-F][+-]?)$/i)?.[1]
      ?? "";
    const row = emptySubject(subjectName, Math.min(100, Math.max(0, entry.confidence >= 0 ? entry.confidence : ocrConfidence)), rawMarks);
    const componentMatch = line.match(/\b(theory|practical)\b/i);
    const lowerLine = line.toLowerCase();
    const obtainedMatch = line.match(/(?:marks?\s*)?(?:obtained|secured|scored)\s*[:=-]?\s*(\d{1,4}(?:\.\d{1,2})?)/i);
    const maximumMatch = line.match(/(?:maximum|max\.?)\s*(?:marks?)?\s*[:=-]?\s*(\d{1,4}(?:\.\d{1,2})?)/i);
    const theoryObtained = line.match(/theory\s*(?:marks?)?\s*[:=-]?\s*(\d{1,4}(?:\.\d{1,2})?)/i);
    const theoryMaximum = line.match(/theory\s*(?:maximum|max\.?)\s*(?:marks?)?\s*[:=-]?\s*(\d{1,4}(?:\.\d{1,2})?)/i);
    const practicalObtained = line.match(/practical\s*(?:marks?)?\s*[:=-]?\s*(\d{1,4}(?:\.\d{1,2})?)/i);
    const practicalMaximum = line.match(/practical\s*(?:maximum|max\.?)\s*(?:marks?)?\s*[:=-]?\s*(\d{1,4}(?:\.\d{1,2})?)/i);
    const gradeMatch = line.match(/\s(ABSENT|AB|PASS|FAIL|O|A1|A2|B1|B2|C1|C2|[A-F][+-]?)$/i);
    const numericText = gradeMatch ? line.slice(0, -gradeMatch[0].length) : line;
    const numbers = [...numericText.matchAll(NUMERIC_TOKEN)].map((match) => numberToken(match[0])).filter((value): value is number => value !== null);

    if (/\b(absent|\babs\b|\bab\b)\b/i.test(line)) {
      row.resultStatus = "absent";
      row.marksObtained = 0;
      row.maximumMarks = maximumMatch ? numberToken(maximumMatch[1]) : null;
      if (componentMatch?.[1].toLowerCase() === "theory") {
        row.theoryMarks = 0;
        row.theoryMaximumMarks = theoryMaximum ? numberToken(theoryMaximum[1]) : row.maximumMarks;
        row.marksObtained = null;
      } else if (componentMatch?.[1].toLowerCase() === "practical") {
        row.practicalMarks = 0;
        row.practicalMaximumMarks = practicalMaximum ? numberToken(practicalMaximum[1]) : row.maximumMarks;
        row.marksObtained = null;
      }
      row.needsReview = (row.maximumMarks === null && row.theoryMaximumMarks === null && row.practicalMaximumMarks === null) || row.confidence < 80;
    } else if (gradeMatch && !numbers.length) {
      row.resultStatus = "grade";
      row.gradeValue = gradeMatch[1].toUpperCase();
      row.needsReview = row.confidence < 80;
    } else if (componentMatch) {
      const isTheory = componentMatch[1].toLowerCase() === "theory";
      const componentObtained = isTheory ? (theoryObtained ?? obtainedMatch) : (practicalObtained ?? obtainedMatch);
      const componentMaximum = isTheory ? (theoryMaximum ?? maximumMatch) : (practicalMaximum ?? maximumMatch);
      const componentValue = componentObtained
        ? numberToken(componentObtained[1])
        : componentMaximum || numbers.length !== 1 ? null : numbers[0];
      const componentMaxValue = componentMaximum ? numberToken(componentMaximum[1]) : null;
      if (isTheory) {
        row.theoryMarks = componentValue;
        row.theoryMaximumMarks = componentMaxValue;
      } else {
        row.practicalMarks = componentValue;
        row.practicalMaximumMarks = componentMaxValue;
      }
      row.resultStatus = "numeric";
      row.needsReview = true;
    } else if (obtainedMatch) {
      row.marksObtained = numberToken(obtainedMatch[1]);
      row.maximumMarks = maximumMatch ? numberToken(maximumMatch[1]) : null;
      row.resultStatus = "numeric";
      row.theoryMarks = theoryObtained ? numberToken(theoryObtained[1]) : null;
      row.theoryMaximumMarks = theoryMaximum ? numberToken(theoryMaximum[1]) : null;
      row.practicalMarks = practicalObtained ? numberToken(practicalObtained[1]) : null;
      row.practicalMaximumMarks = practicalMaximum ? numberToken(practicalMaximum[1]) : null;
      row.needsReview = row.marksObtained === null || row.maximumMarks === null || row.confidence < 80;
    } else if (numbers.length === 1) {
      row.marksObtained = numbers[0];
      row.resultStatus = "numeric";
      row.needsReview = true;
    } else if (numbers.length === 2 && markColumnOrder) {
      const obtainedIndex = markColumnOrder === "obtained_maximum" ? 0 : 1;
      const maximumIndex = obtainedIndex === 0 ? 1 : 0;
      row.marksObtained = numbers[obtainedIndex];
      row.maximumMarks = numbers[maximumIndex];
      row.resultStatus = "numeric";
      row.needsReview = row.marksObtained > row.maximumMarks || row.confidence < 80;
      row.rawMarks = "";
    } else if (numbers.length > 1) {
      // Multiple trailing figures have no reliable column order in plain OCR text.
      // Keep the OCR fragment for review and do not guess which figure is obtained/max.
      row.rawMarks = rawMarks || numbers.join(" ");
      row.needsReview = true;
    }
    if (lowerLine.includes("optional")) {
      row.isOptional = true;
      row.needsReview = true;
    }
    const existing = rows.find((item) => item.subjectName.toLocaleLowerCase() === row.subjectName.toLocaleLowerCase());
    if (!existing) {
      rows.push(row);
    } else if (componentMatch) {
      existing.theoryMarks = row.theoryMarks ?? existing.theoryMarks;
      existing.theoryMaximumMarks = row.theoryMaximumMarks ?? existing.theoryMaximumMarks;
      existing.practicalMarks = row.practicalMarks ?? existing.practicalMarks;
      existing.practicalMaximumMarks = row.practicalMaximumMarks ?? existing.practicalMaximumMarks;
      existing.rawMarks = [existing.rawMarks, row.rawMarks].filter(Boolean).join(" | ");
      existing.confidence = Math.min(existing.confidence, row.confidence);
      existing.needsReview = true;
    }
  }

  return rows.map((row) => {
    if (row.theoryMarks !== null && row.practicalMarks !== null) {
      row.marksObtained = row.theoryMarks + row.practicalMarks;
      row.resultStatus = "numeric";
    }
    if (row.theoryMaximumMarks !== null && row.practicalMaximumMarks !== null) {
      row.maximumMarks = row.theoryMaximumMarks + row.practicalMaximumMarks;
    }
    return row;
  });
}

function parseOfficialNumber(lines: string[], pattern: RegExp) {
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) return numberToken(match[1]);
  }
  return null;
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

  try {
    const { data } = await worker.recognize(source);
    const blockLines = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines));
    const lines = blockLines.length
      ? blockLines.map((line) => ({ text: cleanText(line.text), confidence: line.confidence })).filter((line) => line.text)
      : data.text.split(/\r?\n/).map(cleanText).filter(Boolean).map((text) => ({ text, confidence: data.confidence }));
    const lineTexts = lines.map((line) => line.text);
    const confidence = Number.isFinite(data.confidence) ? data.confidence : 0;
    const nameMatch = parseStudentName(lineTexts);
    const name = nameMatch?.value ?? '';
    const registerMatch = parseLabeledValue(
      lineTexts,
      /(?:register|registration|roll|admission|candidate|hall\s*ticket|exam(?:ination)?)\s*(?:no\.?|number|#)\s*[:|=-]?\s*([A-Z0-9/-]+)/i,
      (value) => /[A-Z0-9]/i.test(value),
    );
    const dobMatch = parseLabeledValue(lineTexts, /(?:date\s+of\s+birth|\bDOB\b)\s*[:|=-]?\s*(.*)$/i);
    const dateOfBirth = parseDate(dobMatch?.value ?? "");
    const yearMatch = lineTexts.join(" ").match(/(?:exam(?:ination)?\s+year|year\s+of\s+(?:exam|passing)|academic\s+year)\s*[:|=-]?\s*((?:19|20)\d{2})/i)
      ?? lineTexts.join(" ").match(/\b((?:19|20)\d{2})\b(?=.*\b(?:exam|examination|result)\b)/i);
    const sessionMatch = parseLabeledValue(lineTexts, /(?:exam(?:ination)?\s+session|academic\s+session|academic\s+year)\s*[:|=-]?\s*(.*)$/i);
    const boardMatch = parseLabeledValue(lineTexts, /(?:examining\s+board|board\s+name|education\s+board)\s*[:|=-]?\s*(.*)$/i);
    const institutionMatch = parseLabeledValue(lineTexts, /(?:school\s+name|institution\s+name|name\s+of\s+(?:the\s+)?school)\s*[:|=-]?\s*(.*)$/i);
    const subjectMarks = parseSubjectRows(lines, confidence);
    const officialTotalMarks = parseOfficialNumber(lineTexts.filter((line) => !/\b(?:maximum|max\.)\b/i.test(line)), /(?:grand\s+)?total(?:\s+marks?)?\s*[:|=-]?\s*(\d{1,5}(?:\.\d{1,2})?)/i);
    const officialMaximumTotalMarks = parseOfficialNumber(lineTexts, /(?:maximum\s+)?(?:grand\s+)?total(?:\s+(?:maximum|max\.?))?(?:\s+marks?)?\s*[:|=-]?\s*(\d{1,5}(?:\.\d{1,2})?)/i);
    const labeledPercentage = parseOfficialNumber(lineTexts, /(?:percentage|per\s*cent|%\s*age)\s*[:|=-]?\s*(\d{1,3}(?:\.\d{1,2})?)/i);
    const percentage = labeledPercentage ?? parseOfficialNumber(lineTexts, /(\d{1,3}(?:\.\d{1,2})?)\s*%/i);
    const reviewFields: string[] = [];
    if (!name || (nameMatch ? lines[nameMatch.lineIndex]?.confidence ?? confidence : 0) < 80) reviewFields.push("student_name");
    if (!registerMatch) reviewFields.push("register_number");
    if (!dateOfBirth && /\b(?:date\s+of\s+birth|DOB)\b/i.test(data.text)) reviewFields.push("date_of_birth");
    if (!subjectMarks.length) reviewFields.push("subject_marks");
    subjectMarks.forEach((subject, index) => {
      if (subject.needsReview) reviewFields.push(`subject_marks.${index}`);
    });
    if (officialTotalMarks !== null && subjectMarks.some((subject) => subject.needsReview)) reviewFields.push("official_total_comparison");

    return {
      studentName: name,
      studentNameConfidence: nameMatch ? lines[nameMatch.lineIndex]?.confidence ?? confidence : 0,
      registerNumber: cleanText(registerMatch?.value ?? "").replace(/\s+/g, ""),
      dateOfBirth,
      examYear: yearMatch ? Number(yearMatch[1]) : null,
      examSession: cleanText(sessionMatch?.value ?? ""),
      boardName: cleanText(boardMatch?.value ?? ""),
      institutionName: cleanText(institutionMatch?.value ?? ""),
      officialTotalMarks,
      officialMaximumTotalMarks,
      officialPercentage: percentage,
      subjectMarks,
      reviewFields: [...new Set(reviewFields)],
      ocrConfidence: confidence,
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
