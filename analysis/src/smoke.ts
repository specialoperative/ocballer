import { fromTelegram, fromCsv } from "./parse.js";
import { couldBeLead } from "./classify.js";
import { report, upperBoundZero, samplesToRuleOut } from "./report.js";
import type { Judged } from "./types.js";

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
};

const telegram = JSON.stringify({
  messages: [
    { date: "2026-09-15T10:00:00", text: "POACH · COMMON POST\nTown Group\nJane D\n\nCategory: Other\nClassification: n/a\n\nAnyone know a good roofer? Slate is leaking." },
    { date: "2026-09-15T10:05:00", text: "POACH · COMMON POST\nTown Group\nSam U\n\nCategory: Real estate\nClassification: listing\n\nFor Sale | $609,999 4 Beds 3 Baths" },
    { date: "2026-09-15T10:06:00", text: "Just a chat message, not a capture" },
  ],
});
const posts = fromTelegram(telegram);
check("telegram parser takes only POACH captures", posts.length === 2, `${posts.length}`);
check("body strips the metadata header", posts[0]!.text.startsWith("Anyone know a good roofer"), posts[0]!.text.slice(0, 30));
check("group and author parsed", posts[0]!.group === "Town Group" && posts[0]!.author === "Jane D");

const csv = 'group,author,text\nTown Group,Jane D,"Anyone know a good roofer?\nSlate is leaking, $0"\n';
const fromFile = fromCsv(csv);
check("csv parser handles quoted newlines and commas", fromFile.length === 1 && fromFile[0]!.text.includes("Slate is leaking"), fromFile[0]?.text ?? "");

check("prefilter keeps a real ask", couldBeLead("anyone know a good plumber"));
check("prefilter keeps a symptom with no ask", couldBeLead("my water heater is leaking everywhere"));
check("prefilter drops pure chatter", !couldBeLead("happy birthday to my neighbor"));

check("zero hits in 530 bounds the rate at 0.56%", Math.abs(upperBoundZero(530) - 0.00563) < 0.0002, (upperBoundZero(530) * 100).toFixed(2) + "%");
check("ruling out 1% needs ~299 posts", samplesToRuleOut(0.01) === 299, String(samplesToRuleOut(0.01)));
check("ruling out 0.5% needs ~598 posts", samplesToRuleOut(0.005) === 598, String(samplesToRuleOut(0.005)));

const judged: Judged[] = [
  { id: "1", group: "A", author: null, text: "anyone know a good roofer", capturedAt: "", verdict: "lead", reason: "" },
  { id: "2", group: "A", author: null, text: "couch for sale", capturedAt: "", verdict: "sale", reason: "" },
  { id: "3", group: "B", author: null, text: "couch for sale", capturedAt: "", verdict: "sale", reason: "" },
  { id: "4", group: "B", author: null, text: "we do roofing call us", capturedAt: "", verdict: "contractor_ad", reason: "" },
];
const result = report(judged);
check("counts leads and ads", result.leads === 1 && result.contractorAds === 1);
check("detects cross-posted duplicates", result.unique === 3 && Math.abs(result.duplicateRate - 0.25) < 0.01,
  `${result.unique} unique, ${(result.duplicateRate * 100).toFixed(0)}% dupes`);
check("25% rate reads as above break-even", result.verdict.includes("worth monitoring"), result.verdict.slice(0, 48));

const empty = report([{ id: "x", group: "A", author: null, text: "hi", capturedAt: "", verdict: "other", reason: "" }]);
check("one post with no leads says keep capturing", empty.verdict.includes("Keep capturing"), empty.verdict.slice(0, 60));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
