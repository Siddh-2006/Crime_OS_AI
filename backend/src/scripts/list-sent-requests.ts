/**
 * list-sent-requests.ts — shows all DepartmentRequests with status=sent
 * Run: npx ts-node -r tsconfig-paths/register src/scripts/list-sent-requests.ts
 */
import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { DepartmentRequest } from '../modules/investigation/models/DepartmentRequest.model';

async function main() {
  await connectDatabase();
  const requests = await DepartmentRequest.find({ status: 'sent' }).lean();
  console.log(`\nFound ${requests.length} pending request(s):\n`);
  for (const r of requests) {
    console.log(`─────────────────────────────────────────`);
    console.log(`  request_id  : ${r.request_id}`);
    console.log(`  case_id     : ${r.case_id}`);
    console.log(`  type        : ${r.request_type}`);
    console.log(`  recipient   : ${r.recipient_type} — ${r.department_entity_id ?? 'N/A'}`);
    console.log(`  sent_at     : ${r.sent_at}`);
    console.log(`  step_id     : ${r.step_id}`);
  }
  console.log(`─────────────────────────────────────────\n`);
  await disconnectDatabase();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
