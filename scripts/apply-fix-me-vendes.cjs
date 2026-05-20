const fs = require("node:fs");

const filePath = "src/ai/legacyPhraseDictionary.js";
let text = fs.readFileSync(filePath, "utf8");

const anchor = `  "me armás",
  "me armas"
];`;

const replacement = `  "me armás",
  "me armas",
  "me vendes",
  "me vendés",
  "vendeme",
  "vendéme",
  "te compro",
  "compro",
  "me podes vender",
  "me podés vender"
];`;

if (!text.includes(replacement)) {
  if (!text.includes(anchor)) {
    throw new Error("No encontré el bloque LEGACY_ADD_KEYWORDS esperado.");
  }

  text = text.replace(anchor, replacement);
}

fs.writeFileSync(filePath, text, "utf8");
fs.unlinkSync("scripts/apply-fix-me-vendes.cjs");
console.log("Fix me vendes aplicado. El script se eliminó solo.");
