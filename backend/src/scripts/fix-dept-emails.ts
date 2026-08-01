/**
 * One-off script: update all DepartmentRegistry contact_email to itssiddh7@gmail.com
 * Run: npx ts-node -r tsconfig-paths/register src/scripts/fix-dept-emails.ts
 */
import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { DepartmentRegistry } from '../modules/admin/models/DepartmentRegistry.model';
import logger from '../config/logger';

async function run(): Promise<void> {
  await connectDatabase();

  const result = await DepartmentRegistry.updateMany(
    {}, // update all entries
    { $set: { contact_email: 'itssiddh7@gmail.com' } }
  );

  logger.info('Updated department contact emails', {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });

  await disconnectDatabase();
  process.exit(0);
}

run().catch((err) => {
  logger.error('Script failed', { error: err });
  process.exit(1);
});
