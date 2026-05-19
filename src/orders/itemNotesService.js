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
  {
    pattern: /\bsalsa\s+extra\b/g,
    note: "salsa extra",
    shouldSkip: ({ normalized, index }) => isSalsaExtraBlockedBySinSalsa(normalized, index)
  },
  {
    pattern: /\bcon\s+salsa\s+extra\b/g,
    note: "salsa extra",
    shouldSkip: ({ normalized, index }) => isSalsaExtraBlockedBySinSalsa(normalized, index)
  }
];

export function extractItemNotes(messageText) {
  const normalized = normalizeText(messageText);
  const notes = [];

  for (const config of NOTE_PATTERNS) {
    for (const match of normalized.matchAll(config.pattern)) {
      if (config.shouldSkip?.({ normalized, index: match.index ?? 0, match })) {
        continue;
      }

      notes.push(config.note);
    }

    config.pattern.lastIndex = 0;
  }

  return [...new Set(notes)];
}

export function removeItemNotesFromText(messageText) {
  let cleaned = normalizeText(messageText);

  for (const config of NOTE_PATTERNS) {
    cleaned = cleaned.replace(config.pattern, (...args) => {
      const index = args.at(-2);

      if (config.shouldSkip?.({ normalized: cleaned, index, match: args })) {
        return args[0];
      }

      return " ";
    });

    config.pattern.lastIndex = 0;
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

function isSalsaExtraBlockedBySinSalsa(normalized, index) {
  const before = normalized.slice(Math.max(0, index - 8), index);

  return /\bsin\s+$/.test(before);
}
