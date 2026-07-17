/**
 * One-time script to delete ALL complaints from the database.
 * Run with: npx ts-node -r tsconfig-paths/register src/scripts/delete-complaints.ts
 *
 * WARNING: This is irreversible. All complaint documents will be permanently deleted.
 * 
 * npx ts-node -r tsconfig-paths/register scripts/delete-complaints.ts
 * 
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import env from '../src/config/env';

async function deleteAllComplaints(): Promise<void> {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(env.MONGODB_URI);
  console.log(`Connected: ${env.MONGODB_URI}`);

  const db = mongoose.connection.db!;
  const collection = db.collection('complaints');

  const countBefore = await collection.countDocuments();
  console.log(`\nComplaints found: ${countBefore}`);

  if (countBefore === 0) {
    console.log('Nothing to delete. Exiting.');
    await mongoose.disconnect();
    return;
  }

  const result = await collection.deleteMany({});
  console.log(`\n✓ Deleted ${result.deletedCount} complaint(s) successfully.`);

  const countAfter = await collection.countDocuments();
  console.log(`Complaints remaining: ${countAfter}`);

  await mongoose.disconnect();
  console.log('Disconnected. Done.');
}

deleteAllComplaints().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
