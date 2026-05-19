import { normalizeText } from "../utils/textNormalizer.js";

const NOTE_PATTERNS = [
  { pattern: /\bsin\s+cebolla\b/g, note: "sin cebolla" },
  { pattern: /\bsin\s+salsa\b/g, note: "sin salsa" },
  { pattern: /\bsin\s+lechuga\b/g, note: "sin lechuga" },
  { pattern: /\bsin\s+tomate\b/g, note: "sin tomate" },
  { pattern: /\bsin\s+cheddar\b/g, note: "sin cheddar" },
  { pattern: /\bsin\s+queso\b/g, note: "sin queso" },
  { pattern: /\bsin\s+pepinillos?\b/g, note: "sin pepinillos" },
  { pattern: /\bsin\s+pickles?\b/g, note: "sin pepinillos" },
  { pattern: /\bsin\s+picante\b/g, note: "sin picante" },
  { pattern: /\bsin\s+ketchup\b/g, note: "sin ketchup" },
  { pattern: /\bsin\s+mayonesa\b/g, note: "sin mayonesa" },
  { pattern: /\bsin\s+mayo\b/g, note: "sin mayonesa" },
  { pattern: /\bpoca\s+salsa\b/g, note: "poca salsa" },
  { pattern: /\bcon\s+poca\s+salsa\b/g, note: "poca salsa" },
  { pattern: /\bbien\s+cocida\b/g, note: "bien cocida" },
  { pattern: /\bbien\s+cocido\b/g, note: "bien cocida" },
  { pattern: /\bbien\s+crocante\b/g, note: "bien crocante" },
  { pattern: /\bextra\s+queso\b/g, note: "extra queso" },
  { pattern: /\bcon\s+extra\s+queso\b/g, note: "extra queso" },
  { pattern: /\bextra\s+bacon\b/g, note: "extra bacon" },
  { pattern: /\bcon\s+extra\s+bacon\b/g, note: "extra bacon" },
  { pattern: /\bextra\s+carne\b/g, note: "extra carne" },
  { pattern: /\bcon\s+extra\s+carne\b/g, note: "extra carne" },
  { pattern: /\bsalsa\s+extra\b/g, note: "salsa extra" },
  { pattern: /\bcon\s+salsa\s+extra\b/g, note: "salsa extra" }
];

export function extractItemNotes(messageText) {
  const normalized = normalizeText(messageText);
  const notes = [];

  for (const { pattern, note } of NOTE_PATTERNS) {
    if (pattern.test(normalized)) {
      notes.push(note);
    }

    pattern.lastIndex = 0;
  }

  return [...new Set(notes)];
}

export function removeItemNotesFromText(messageText) {
  let cleaned = normalizeText(messageText);

  for (const { pattern } of NOTE_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
    pattern.lastIndex = 0;
  }

  return cleaned
    .replace(/\b(con|y)\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractNotesAndCleanMessage(messageText) {
  return {
    notes: extractItemNotes(messageText),
    cleanMessageText: removeItemNotesFromText(messageText)
  };
}

export function hasItemNotes(messageText) {
  return extractItemNotes(messageText).length > 0;
}
