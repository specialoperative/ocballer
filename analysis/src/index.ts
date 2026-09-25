import { parse } from "./parse.js";
import { candidateCount, judge } from "./classify.js";
import { render, report } from "./report.js";

const path = process.argv[2];
if (!path) {
  console.error("usage: npm start -- <capture.json|capture.csv>   (ANTHROPIC_API_KEY for full judging)");
  process.exit(1);
}

const posts = parse(path);
const apiKey = process.env.ANTHROPIC_API_KEY;

console.log(`parsed ${posts.length} posts from ${path}`);
console.log(`${candidateCount(posts)} reached the model pass${apiKey ? "" : " — but no ANTHROPIC_API_KEY, so nothing was judged"}\n`);

const judged = await judge(posts, apiKey);
console.log(render(report(judged)));
