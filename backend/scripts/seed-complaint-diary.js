const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

async function fixDiary() {
  await mongoose.connect('mongodb://localhost:27017/crime-os');
  const db = mongoose.connection.db;

  const complaint = await db.collection('complaints').findOne({ _id: new mongoose.Types.ObjectId('6a5d0d84c59adc1091034273') });
  
  if (complaint) {
    const entry = {
      case_id: complaint._id,
      entry_id: uuidv4(),
      timestamp: complaint.createdAt || new Date(),
      actor: { type: 'officer', id: complaint.citizen.toString() },
      event_type: 'complaint_filed',
      payload: {
        complainant_id: complaint.citizen.toString(),
        incident_date: complaint.incidentDate,
        incident_place: complaint.incidentPlace,
        category: complaint.category,
        short_description: complaint.shortDescription,
        detailed_description: complaint.detailedDescription,
        evidence_count: complaint.evidence ? complaint.evidence.length : 0,
        evidence_list: complaint.evidence ? complaint.evidence.map(e => ({ filename: e.originalFilename, type: e.resourceType })) : [],
      }
    };
    
    await db.collection('diaryentries').insertOne(entry);
    console.log('Inserted Diary Entry for 6a5d0d84c59adc1091034273');
  } else {
    console.log('Complaint not found');
  }

  process.exit(0);
}

fixDiary().catch(console.error);
