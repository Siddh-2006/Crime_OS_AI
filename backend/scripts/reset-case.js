require('dotenv').config();
const mongoose = require('mongoose');

async function resetCase() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crime-os');
  const db = mongoose.connection.db;
  const caseIdStr = '6a5d0d84c59adc1091034273';

  // Complaint is matched by _id
  const complaint = await db.collection('complaints').findOne({ _id: new mongoose.Types.ObjectId(caseIdStr) });
  if (!complaint) {
    console.log('Case not found.');
  } else {
    const caseId = complaint._id;
    console.log('Deleting case:', caseId);
    
    await db.collection('complaints').deleteMany({ _id: caseId });
    await db.collection('casechecklists').deleteMany({ case_id: caseId });
    await db.collection('evidences').deleteMany({ case_id: caseId });
    await db.collection('diaryentries').deleteMany({ case_id: caseId });
    await db.collection('analysissnapshots').deleteMany({ case_id: caseId });
    await db.collection('requestthreads').deleteMany({ case_id: caseId });
    await db.collection('departmentrequests').deleteMany({ case_id: caseId });
    
    console.log('Deleted all related documents.');
  }

  await mongoose.disconnect();
}

resetCase().catch(console.error);
