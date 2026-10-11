import mongoose from 'mongoose';
import { Evidence } from './src/modules/investigation/models/Evidence.model';

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/crime-os');
  const caseId = '6ac5ce42e76766d4b6a14bc1';
  const ev = await Evidence.find({ case_id: caseId }).sort({ createdAt: -1 }).limit(10).lean();
  console.log(JSON.stringify(ev.map(e => e.originalFilename), null, 2));
  process.exit(0);
}

main().catch(console.error);
