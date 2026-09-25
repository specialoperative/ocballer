import { readFileSync } from "node:fs";
import type { CapturedPost } from "./types.js";

/**
 * Reads whatever the capture side happens to emit. Two formats so far: the
 * Telegram export the monitor writes into, and a CSV export of the same posts.
 */
export function parse(path: string): CapturedPost[] {
  const raw = readFileSync(path, "utf8");
  return path.endsWith(".json") ? fromTelegram(raw) : fromCsv(raw);
}

function messageText(message: { text?: unknown }): string {
  const text = message.text;
  if (typeof text === "string") return text;
  if (Array.isArray(text)) {
    return text.map((part) => (typeof part === "string" ? part : String((part as { text?: string }).text ?? ""))).join("");
  }
  return "";
}

/** Telegram export: alerts start with a POACH header, then group, author, body. */
export function fromTelegram(raw: string): CapturedPost[] {
  const data = JSON.parse(raw) as { messages?: { date?: string; text?: unknown }[] };
  const posts: CapturedPost[] = [];

  for (const message of data.messages ?? []) {
    const text = messageText(message);
    if (!/^POACH · (COMMON POST|Newly detected post)/.test(text)) continue;

    const lines = text.split("\n");
    // The body is whatever follows the last metadata line the monitor emits.
    const marker = lines.findIndex((line) => line.startsWith("Classification:"));
    const body = (marker >= 0 ? lines.slice(marker + 1) : lines.slice(3)).join("\n").trim();
    if (!body) continue;

    posts.push({
      id: `${message.date}:${lines[1] ?? ""}:${body.slice(0, 40)}`,
      group: (lines[1] ?? "unknown").trim(),
      author: (lines[2] ?? "").trim() || null,
      text: body,
      capturedAt: message.date ?? "",
    });
  }
  return posts;
}

/** CSV with a text column, plus group/author if present. */
export function fromCsv(raw: string): CapturedPost[] {
  const rows = splitCsv(raw);
  const header = rows.shift();
  if (!header) return [];

  const at = (name: string) => header.findIndex((column) => column.trim().toLowerCase() === name);
  const textCol = at("text");
  if (textCol < 0) throw new Error("CSV needs a 'text' column.");
  const groupCol = at("group");
  const authorCol = at("author");

  return rows
    .filter((row) => (row[textCol] ?? "").trim())
    .map((row, index) => ({
      id: String(index),
      group: (groupCol >= 0 ? row[groupCol] : "unknown") ?? "unknown",
      author: (authorCol >= 0 ? row[authorCol] : null) || null,
      text: row[textCol] ?? "",
      capturedAt: "",
    }));
}

/** Minimal RFC4180 reader — the post bodies contain commas and newlines. */
function splitCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (quoted) {
      if (char === '"') {
        if (raw[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
