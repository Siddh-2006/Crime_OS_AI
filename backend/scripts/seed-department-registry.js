/**
 * seed-department-registry.js
 *
 * Seeds the DepartmentRegistry collection from parsed/Department_Registry.json
 * AND embeds each entry into Qdrant via the legal_agent API, storing the
 * qdrant_uuid back into MongoDB.
 *
 * Prerequisites:
 *   1. MongoDB running (MONGODB_URI in .env)
 *   2. legal_agent FastAPI running on LEGAL_AGENT_URL (default: http://localhost:8001)
 *   3. Qdrant running (used by legal_agent internally)
 *   4. llama.cpp embedding server running on port 8003
 *
 * Steps this script performs:
 *   1. Deletes all documents from the departmentregistries collection in MongoDB
 *   2. Calls DELETE /registry/{uuid} on legal_agent for any previously stored qdrant_uuid
 *      (skipped since we just nuked MongoDB — instead we delete the entire Qdrant
 *       collection's dept_registry points by re-ingesting fresh)
 *   3. Inserts all entries from Department_Registry.json into MongoDB
 *   4. For each entry, calls POST /registry/upsert on legal_agent to embed + store in Qdrant
 *   5. Saves the returned qdrant_uuid back to MongoDB
 *
 * Usage:
 *   node scripts/seed-department-registry.js
 *
 * Options:
 *   --dry-run    Print what would happen without touching MongoDB or Qdrant
 *   --skip-qdrant  Seed MongoDB only, skip embedding (useful if llama-server is down)
 */

const mongoose = require('mongoose');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI    = process.env.MONGODB_URI || 'mongodb://localhost:27017/crime_os';
const LEGAL_AGENT  = process.env.LEGAL_AGENT_URL || 'http://localhost:8001';
const DRY_RUN      = process.argv.includes('--dry-run');
const SKIP_QDRANT  = process.argv.includes('--skip-qdrant');

// Minimal schema — avoids needing ts-node to compile
const DepartmentRegistrySchema = new mongoose.Schema({}, {
  strict: false,
  collection: 'departmentregistries',
});
const DepartmentRegistry = mongoose.model('DepartmentRegistry', DepartmentRegistrySchema);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg)  { console.log(`  [INFO]  ${msg}`); }
function ok(msg)   { console.log(`  [✓]     ${msg}`); }
function warn(msg) { console.warn(`  [WARN]  ${msg}`); }
function fail(msg) { console.error(`  [✗]     ${msg}`); }

async function upsertToQdrant(entry) {
  try {
    const res = await axios.post(
      `${LEGAL_AGENT}/registry/upsert`,
      {
        entity_id:                   entry.entity_id,
        entity_name:                 entry.entity_name,
        category:                    entry.category,
        what_they_can_provide:       entry.what_they_can_provide       || [],
        legal_basis_typically_cited: entry.legal_basis_typically_cited || [],
        request_format_expected:     entry.request_format_expected     || '',
        typical_response_time:       entry.typical_response_time       || '',
        escalation_path_if_no_response: entry.escalation_path_if_no_response || '',
        notes_or_caveats:            entry.notes_or_caveats            || '',
        confidence:                  entry.confidence                  || 'high',
        act:                         'department_registry',
        qdrant_uuid:                 null,  // always create fresh during seed
      },
      { timeout: 120_000 },
    );
    return res.data?.qdrant_uuid || null;
  } catch (err) {
    warn(`Qdrant upsert failed for ${entry.entity_id}: ${err.message}`);
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const jsonPath = path.join(__dirname, '../../services/legal_agent/parsed/Department_Registry.json');

  if (!fs.existsSync(jsonPath)) {
    fail(`Department_Registry.json not found at: ${jsonPath}`);
    process.exit(1);
  }

  const entries = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`\nDepartment Registry Seeder`);
  console.log(`${'─'.repeat(50)}`);
  log(`Found ${entries.length} entries in Department_Registry.json`);
  log(`MongoDB:      ${MONGO_URI}`);
  log(`Legal Agent:  ${LEGAL_AGENT}`);
  log(`Dry run:      ${DRY_RUN}`);
  log(`Skip Qdrant:  ${SKIP_QDRANT}`);
  console.log('');

  if (DRY_RUN) {
    log('DRY RUN — no changes will be made.');
    entries.forEach(e => log(`  Would seed: ${e.entity_id} (${e.entity_name})`));
    process.exit(0);
  }

  // ── Connect to MongoDB ──────────────────────────────────────────────────────
  await mongoose.connect(MONGO_URI);
  log('MongoDB connected.');

  // ── Step 1: Clear existing MongoDB documents ────────────────────────────────
  const existing = await DepartmentRegistry.find({}).select('entity_id qdrant_uuid').lean();
  log(`Clearing ${existing.length} existing MongoDB documents...`);
  await DepartmentRegistry.deleteMany({});
  ok(`Cleared MongoDB departmentregistries collection.`);

  // ── Step 2: Insert + embed each entry ──────────────────────────────────────
  let successCount = 0;
  let qdrantSuccessCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const label = `[${i + 1}/${entries.length}] ${entry.entity_id}`;

    // Build the MongoDB document (strip 'act' — not in model)
    const doc = {
      entity_id:                      entry.entity_id,
      entity_name:                    entry.entity_name,
      category:                       entry.category,
      what_they_can_provide:          entry.what_they_can_provide          || [],
      legal_basis_typically_cited:    entry.legal_basis_typically_cited    || [],
      request_format_expected:        entry.request_format_expected        || '',
      typical_response_time:          entry.typical_response_time          || '',
      escalation_path_if_no_response: entry.escalation_path_if_no_response || '',
      notes_or_caveats:               entry.notes_or_caveats               || '',
      confidence:                     entry.confidence                     || 'high',
      contact_email:                  entry.contact_email                  || '',
      isActive:                       true,
      qdrant_uuid:                    null,
    };

    // Insert into MongoDB
    let savedDoc;
    try {
      savedDoc = await DepartmentRegistry.create(doc);
      successCount++;
    } catch (err) {
      fail(`${label} — MongoDB insert failed: ${err.message}`);
      continue;
    }

    // Embed into Qdrant
    if (!SKIP_QDRANT) {
      process.stdout.write(`  [~]     ${label} — embedding...`);
      const qdrantUuid = await upsertToQdrant(entry);
      if (qdrantUuid) {
        await DepartmentRegistry.updateOne({ _id: savedDoc._id }, { qdrant_uuid: qdrantUuid });
        process.stdout.write(`\r  [✓]     ${label} — embedded (${qdrantUuid.slice(0, 8)}…)\n`);
        qdrantSuccessCount++;
      } else {
        process.stdout.write(`\r  [!]     ${label} — MongoDB OK, Qdrant FAILED (no uuid returned)\n`);
      }
    } else {
      ok(`${label} — MongoDB OK (Qdrant skipped)`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('');
  console.log(`${'─'.repeat(50)}`);
  ok(`MongoDB:  ${successCount}/${entries.length} inserted`);
  if (!SKIP_QDRANT) {
    ok(`Qdrant:   ${qdrantSuccessCount}/${successCount} embedded`);
    if (qdrantSuccessCount < successCount) {
      warn(`${successCount - qdrantSuccessCount} entries are in MongoDB but NOT in Qdrant.`);
      warn(`Run with --skip-qdrant to seed MongoDB only, or check that:`);
      warn(`  - legal_agent is running on ${LEGAL_AGENT}`);
      warn(`  - llama-server is running on port 8003`);
      warn(`  - Qdrant is running on port 6333`);
    }
  }
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  fail(`Unexpected error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
