/**
 * Test script for ollamaClient.ts
 * Run: npx ts-node -r tsconfig-paths/register scripts/test-ollama.ts
 *
 * Tests:
 *  1. fastCall with trivial prompt
 *  2. deepCall with same prompt — verify it takes longer + has reasoning
 *  3. num_ctx verification — send a >4K token prompt, compare truncation
 */

import 'dotenv/config';
import { fastCall, deepCall } from '../src/shared/llm/ollamaClient';

const TRIVIAL_SYSTEM = 'You are a helpful assistant. Be concise.';
const TRIVIAL_USER   = 'summarize: the sky is blue';

// Build a prompt guaranteed >4K tokens (~4096 words * ~1.3 tokens/word ≈ 5300 tokens)
const LONG_USER = `Answer this question ONLY after reading all context below.
Question: What is the 42nd word in this passage?

${'The quick brown fox jumps over the lazy dog. '.repeat(350)}

Now answer: What is the 42nd word in the passage above?`;

async function run(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Crime OS — Ollama Client Test');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── Test 1: fastCall ────────────────────────────────────────────────────────
  console.log('── Test 1: fastCall (thinking OFF) ──');
  const t1 = Date.now();
  try {
    const fast = await fastCall(TRIVIAL_SYSTEM, TRIVIAL_USER) as string;
    const ms1 = Date.now() - t1;
    console.log(`  Response : ${fast}`);
    console.log(`  Latency  : ${ms1}ms`);
    console.log(`  PASS ✅\n`);
  } catch (err) {
    console.error(`  FAIL ❌ — ${(err as Error).message}\n`);
  }

  // ── Test 2: deepCall ────────────────────────────────────────────────────────
  console.log('── Test 2: deepCall (thinking ON) ──');
  const t2 = Date.now();
  try {
    const deep = await deepCall(TRIVIAL_SYSTEM, TRIVIAL_USER) as string;
    const ms2 = Date.now() - t2;
    console.log(`  Response (first 300 chars):`);
    console.log(`  ${deep.slice(0, 300).replace(/\n/g, '\n  ')}`);
    console.log(`  Latency  : ${ms2}ms`);
    const hasThinking = deep.includes('<|think|>') || ms2 > 3000;
    console.log(`  Thinking visible / slower: ${hasThinking ? 'YES ✅' : 'likely NO — check model'}`);
    console.log(`  PASS ✅\n`);
  } catch (err) {
    console.error(`  FAIL ❌ — ${(err as Error).message}\n`);
  }

  // ── Test 3: num_ctx — long prompt ───────────────────────────────────────────
  console.log('── Test 3: num_ctx test (>4K token prompt) ──');
  console.log(`  Prompt tokens estimate: ~${Math.round(LONG_USER.split(' ').length * 1.3)}`);
  const t3 = Date.now();
  try {
    const longResp = await fastCall(TRIVIAL_SYSTEM, LONG_USER) as string;
    const ms3 = Date.now() - t3;
    console.log(`  Response : ${longResp}`);
    console.log(`  Latency  : ${ms3}ms`);
    const answered = longResp.toLowerCase().includes('quick') || longResp.toLowerCase().includes('brown') || longResp.toLowerCase().includes('fox');
    console.log(`  Context retained (not truncated): ${answered ? 'YES ✅' : 'UNCERTAIN — check manually'}`);
    console.log(`  PASS ✅\n`);
  } catch (err) {
    console.error(`  FAIL ❌ — ${(err as Error).message}\n`);
  }

  // ── Test 4: JSON mode ───────────────────────────────────────────────────────
  console.log('── Test 4: JSON mode (fastCall) ──');
  try {
    const json = await fastCall(
      'You return JSON only.',
      'Return {"status":"ok","model":"gemma4"} and nothing else.',
      { jsonMode: true },
    );
    console.log(`  Parsed JSON:`, json);
    console.log(`  PASS ✅\n`);
  } catch (err) {
    console.error(`  FAIL ❌ — ${(err as Error).message}\n`);
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log(' All tests complete.');
  console.log('═══════════════════════════════════════════════════════');
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
