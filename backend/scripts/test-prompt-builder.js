'use strict';

require('dotenv').config();
const { buildFastPrompt, buildDeepPrompt } = require('../dist/modules/investigation/services/analysisPromptBuilder');
const { deepCall } = require('../dist/shared/llm/ollamaClient');

// ─── Narrow Fake Data to test hallucination/grounding ───────────────────────
const fakeFacts = {
  crime_type: "Cyber Fraud - Phishing",
  checklist: [
    { title: "Freeze bank account", status: "completed" },
    { title: "Identify IP address", status: "blocked" }
  ],
  evidence: [
    { type: "Bank Statement", tags: ["transaction_logs", "suspect_account"] }
  ]
};

const fakeRetrievedSOP = [
  "STEP 3A: If bank account is frozen, immediately send KYC request to destination bank to identify account holder.",
  "STEP 4B: If IP address is identified, subpoena ISP for subscriber details."
];

const fakeRetrievedLegal = [
  "IT Act Section 66D: Punishment for cheating by personation by using computer resource."
];

async function run() {
  console.log("=== BUILDING FAST PROMPT ===");
  const fast = buildFastPrompt(fakeFacts, fakeRetrievedSOP);
  console.log("Fast User Prompt length:", fast.user.length);

  console.log("\n=== BUILDING DEEP PROMPT ===");
  const deep = buildDeepPrompt(fakeFacts, { sop: fakeRetrievedSOP, legal: fakeRetrievedLegal }, ["Case #1234: ISP was subpoenaed successfully."]);
  console.log("System instruction snippet:");
  console.log(deep.system.substring(0, 300) + '... [TRUNCATED]');

  console.log("\n=== SENDING TO DEEP CALL (gemma4 / Ollama) ===");
  console.log("Expecting strict JSON that recommends 'send KYC request' (grounded in SOP) and cites 'Section 66D'.\n");
  
  try {
    const responseJson = await deepCall(deep.system, deep.user);
    console.log("✅ SUCCESS! Parsed JSON Response from LLM:");
    console.log(JSON.stringify(responseJson, null, 2));
  } catch (err) {
    console.error("❌ Deep call failed:", err);
  }
}

run();
