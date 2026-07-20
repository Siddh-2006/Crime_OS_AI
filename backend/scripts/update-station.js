const mongoose = require('mongoose');

async function updateDB() {
  await mongoose.connect('mongodb://localhost:27017/crime-os');
  const db = mongoose.connection.db;

  const TEST_STATION_ID = new mongoose.Types.ObjectId('6a5b60a4774e86b7dd85ca6a');
  const AHMEDABAD_STATION_ID = new mongoose.Types.ObjectId('6a5b82822530d19b4025f891');
  const COMPLAINT_ID = new mongoose.Types.ObjectId('6a5d0d84c59adc1091034273');

  // 1. Reassign complaint
  const res1 = await db.collection('complaints').updateOne(
    { _id: COMPLAINT_ID },
    { $set: { policeStation: TEST_STATION_ID } }
  );
  console.log('Update complaint result:', res1);

  // 2. Remove Ahmedabad Station
  const res2 = await db.collection('policestations').deleteOne({ _id: AHMEDABAD_STATION_ID });
  console.log('Delete station result:', res2);

  process.exit(0);
}

updateDB().catch(console.error);
