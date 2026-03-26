#!/usr/bin/env node
/**
 * jd-scorer — Score a job description against Anthony Bull's VP Eng / CTO profile
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx ts-node src/cli.ts https://jobs.example.com/vp-engineering
 *   ANTHROPIC_API_KEY=sk-... npx ts-node src/cli.ts < job-description.txt
 *   ANTHROPIC_API_KEY=sk-... node dist/cli.js https://jobs.example.com/vp-engineering
 */

import { readFileSync } from "fs";
import { scoreJD } from "./scorer";

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY environment variable is not set.");
    process.exit(1);
  }

  let input: string;

  if (process.argv[2]) {
    const arg = process.argv[2];
    if (arg.startsWith("http://") || arg.startsWith("https://")) {
      input = `Please score this job description: ${arg}`;
    } else {
      try {
        const text = readFileSync(arg, "utf8");
        input = `Please score this job description:\n\n${text}`;
      } catch {
        input = `Please score this job description:\n\n${arg}`;
      }
    }
  } else if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (!text) {
      console.error("❌ No input provided. Pass a URL, file path, or pipe JD text via stdin.");
      process.exit(1);
    }
    input = `Please score this job description:\n\n${text}`;
  } else {
    console.error(`
Usage:
  npx ts-node src/cli.ts <url>          Score a job posting URL
  npx ts-node src/cli.ts <file.txt>     Score a JD from a text file
  echo "JD text..." | npx ts-node src/cli.ts  Score piped JD text

Examples:
  npx ts-node src/cli.ts https://jobs.lever.co/acme/vp-engineering
  npx ts-node src/cli.ts ./job-description.txt
    `);
    process.exit(1);
  }

  try {
    const result = await scoreJD(input);
    console.log(result);
  } catch (err) {
    console.error("❌ Error:", (err as Error).message);
    process.exit(1);
  }
}

main();
