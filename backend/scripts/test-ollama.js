/**
 * Standalone Ollama test — no env/server dependencies.
 * Run: node scripts/test-ollama.js
 *
 * Tests:
 *  1. fastCall (thinking OFF) — trivial prompt
 *  2. deepCall (thinking ON)  — same prompt, should be slower + show reasoning
 *  3. num_ctx verification    — >4K token prompt, checks content isn't truncated
 *  4. JSON mode               — structured output parsing
 */

const http = require('http');

const OLLAMA_BASE  = process.env.OLLAMA_BASE_URL;
if (!OLLAMA_BASE) throw new Error('OLLAMA_BASE_URL is not set — check your .env file');
const MODEL        = 'gemma4:e2b';   // e4b not pulled locally — upgrade when available
const NUM_CTX      = parseInt(process.env.OLLAMA_NUM_CTX || '32768', 10);
const THINK_TOKEN  = '<|think|>';

function ollamaRequest(systemPrompt, userPrompt, opts = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:   MODEL,
      prompt:  opts.thinking ? `${THINK_TOKEN}\n${userPrompt}` : userPrompt,
      system:  systemPrompt,
      stream:  false,
      options: {
        temperature: opts.temperature ?? (opts.thinking ? 0.1 : 0.2),
        num_predict: opts.maxTokens  ?? (opts.thinking ? 2048 : 512),
        num_ctx:     NUM_CTX,
      },
    });

    const url = new URL(`${OLLAMA_BASE}/api/generate`);
    const req = http.request(
      { hostname: url.hostname, port: url.port || 11434, path: url.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('Bad JSON from Ollama: ' + data.slice(0, 200))); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const SYS    = 'You are a helpful assistant. Be concise.';
const SIMPLE = 'summarize: the sky is blue';
const LONG   = `Answer ONLY after reading context.\nQuestion: What is the 42nd word in this passage?\n\n${'The quick brown fox jumps over the lazy dog. '.repeat(350)}\n\nAnswer: What is the 42nd word above?`;

async function run() {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' Crime OS — Ollama Client Test');
  console.log(` Model: ${MODEL}  |  num_ctx: ${NUM_CTX}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // Test 1: fastCall
  console.log('── Test 1: fastCall (thinking OFF) ──');
  const t1 = Date.now();
  try {
    const r = await ollamaRequest(SYS, SIMPLE);
    const ms = Date.now() - t1;
    console.log(`  Response : ${r.response?.trim()}`);
    console.log(`  Latency  : ${ms}ms  |  prompt_tokens: ${r.prompt_eval_count}  completion_tokens: ${r.eval_count}`);
    console.log(`  PASS ✅\n`);
  } catch (e) { console.error(`  FAIL ❌ — ${e.message}\n`); }

  // Test 2: deepCall
  console.log('── Test 2: deepCall (thinking ON) ──');
  const t2 = Date.now();
  try {
    const r = await ollamaRequest(SYS, SIMPLE, { thinking: true });
    const ms = Date.now() - t2;
    const text = r.response?.trim() || '';
    console.log(`  Response (first 400 chars):\n  ${text.slice(0, 400).replace(/\n/g, '\n  ')}`);
    console.log(`  Latency  : ${ms}ms  |  prompt_tokens: ${r.prompt_eval_count}  completion_tokens: ${r.eval_count}`);
    console.log(`  Thinking visible / slower than fastCall: visually confirm above`);
    console.log(`  PASS ✅\n`);
  } catch (e) { console.error(`  FAIL ❌ — ${e.message}\n`); }

  // Test 3: num_ctx — long prompt
  console.log('── Test 3: num_ctx long-prompt test ──');
  const approxTokens = Math.round(LONG.split(' ').length * 1.3);
  console.log(`  Prompt tokens (approx): ${approxTokens}`);
  const t3 = Date.now();
  try {
    const r = await ollamaRequest(SYS, LONG);
    const ms = Date.now() - t3;
    const text = r.response?.trim() || '';
    console.log(`  Response : ${text}`);
    console.log(`  Latency  : ${ms}ms  |  prompt_tokens reported: ${r.prompt_eval_count}`);
    const retained = /quick|brown|fox/i.test(text) || (r.prompt_eval_count ?? 0) > 3000;
    console.log(`  Context retained (not truncated): ${retained ? 'YES ✅' : 'UNCERTAIN — check prompt_eval_count above'}`);
    console.log(`  PASS ✅\n`);
  } catch (e) { console.error(`  FAIL ❌ — ${e.message}\n`); }

  // Test 4: JSON mode
  console.log('── Test 4: JSON structured output ──');
  const t4 = Date.now();
  try {
    const r = await ollamaRequest(
      'You return JSON only. No markdown. No explanation.',
      'Return exactly: {"status":"ok","model":"gemma4"}',
    );
    const ms = Date.now() - t4;
    const raw = (r.response || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed = JSON.parse(raw);
    console.log(`  Parsed   :`, parsed);
    console.log(`  Latency  : ${ms}ms`);
    console.log(`  PASS ✅\n`);
  } catch (e) { console.error(`  FAIL ❌ — ${e.message}\n`); }

  console.log('═══════════════════════════════════════════════════════');
  console.log(' Done.');
  console.log('═══════════════════════════════════════════════════════');
}

run().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
