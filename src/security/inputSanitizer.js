export function sanitizeMessageText(value, {
  maxLength = Number(process.env.MAX_MESSAGE_LENGTH || 1000)
} = {}) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}
