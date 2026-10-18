function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanStudentName(value: string) {
  return cleanText(value)
    .replace(/^[\s:;,.-]+|[\s:;,.-]+$/g, "")
    .replace(/[^\p{L}\p{M}'’ .-]/gu, "")
    .replace(/\s+/g, " ");
}

const NON_NAME_WORDS = /\b(board|government|department|school|college|university|certificate|statement|marksheet|mark sheet|examination|examinations|directorate|education|secondary|higher|candidate name|student name|father|mother|guardian|parent)\b/i;
const EXPLICIT_STUDENT_NAME = /^\s*(?:student(?:'s)?\s+name|candidate(?:'s)?\s+name|name\s+of\s+(?:the\s+)?(?:student|candidate)|full\s+name)\s*[:|=-]?\s*(.*)$/i;
const GENERIC_NAME = /^\s*name(?!\s+of\b)\s*[:|=-]\s*(.*)$/i;
const FOLLOWING_PERSON_LABEL = /\s+(?:father(?:'s)?|mother(?:'s)?|guardian(?:'s)?|parent(?:'s)?)\s+name\b.*$/i;
const OTHER_FIELD = /^(?:name\s+of\s+(?:the\s+)?(?:father|mother|guardian|parent|school)|(?:father|mother|guardian|parent)(?:'s)?\s+name|date|dob|register|roll|class|standard|subject|maximum|marks|total)\b/i;

function validStudentName(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  return value.length >= 2 && value.length <= 90 && words.length <= 8 && !NON_NAME_WORDS.test(value);
}

function readValue(lines: string[], expression: RegExp) {
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(expression);
    if (!match) continue;
    const inlineValue = cleanStudentName((match[1] ?? "").replace(FOLLOWING_PERSON_LABEL, ""));
    if (inlineValue && validStudentName(inlineValue)) return { value: inlineValue, lineIndex: index };
    const nextLine = cleanStudentName(lines[index + 1] ?? "");
    if (nextLine && !OTHER_FIELD.test(nextLine) && validStudentName(nextLine)) {
      return { value: nextLine, lineIndex: index + 1 };
    }
  }
  return null;
}

export function parseStudentName(lines: string[]) {
  return readValue(lines, EXPLICIT_STUDENT_NAME) ?? readValue(lines, GENERIC_NAME);
}
