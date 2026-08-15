import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Complaint } from '../modules/complaint/models/Complaint.model';
import logger from '../config/logger';

async function migrateAssignedIO() {
  try {
    await connectDatabase();
    logger.info('Starting migration: assignedIO -> assignedIOs[]');

    const complaints = await Complaint.find({
      assignedIO: { $exists: true, $ne: null },
      $or: [{ assignedIOs: { $exists: false } }, { assignedIOs: { $size: 0 } }],
    });

    logger.info(`Found ${complaints.length} complaints to migrate.`);

    let count = 0;
    for (const complaint of complaints) {
      if (complaint.assignedIO) {
        complaint.assignedIOs = [complaint.assignedIO];
        await complaint.save();
        count++;
      }
    }

    logger.info(`Successfully migrated ${count} complaints to assignedIOs[].`);
    await disconnectDatabase();
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateAssignedIO();
