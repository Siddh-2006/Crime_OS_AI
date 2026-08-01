import 'dotenv/config';
import { Complaint } from '../modules/complaint/models/Complaint.model';
import { connectDatabase, disconnectDatabase } from '../config/database';

async function deleteCases() {
  await connectDatabase();
  console.log('Connected to MongoDB');

  const complaintIds = [
    'COMP-d753e6c8-5cdc-4768-9bd0-223f6d08411b',
    'COMP-acf9a073-da9d-43b6-91c9-61a211fdb02f',
    'COMP-0df82894-d479-42d4-b583-6461ba0d7f4e'
  ];

  const result = await Complaint.deleteMany({ complaintNumber: { $in: complaintIds } });
  
  console.log(`Successfully deleted ${result.deletedCount} cases.`);

  await disconnectDatabase();
}

deleteCases().catch(console.error);
