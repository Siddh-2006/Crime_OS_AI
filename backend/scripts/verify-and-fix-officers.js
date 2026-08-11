require('dotenv').config();
const mongoose = require('mongoose');

async function fix() {
  const mongoUri = 'mongodb://localhost:27017/crime-os';
  console.log(`Connecting to ${mongoUri}...`);
  await mongoose.connect(mongoUri);

  const PoliceStation = mongoose.model('PoliceStation', new mongoose.Schema({ name: String, code: String }, { strict: false }));
  const Officer = mongoose.model('Officer', new mongoose.Schema({}, { strict: false }));
  const Complaint = mongoose.model('Complaint', new mongoose.Schema({}, { strict: false }));

  let station = await PoliceStation.findOne({ code: 'GJ-AHM001' });
  if (!station) {
    station = await PoliceStation.create({
      name: 'Navrangpura Cyber Crime Police Station',
      code: 'GJ-AHM001',
      city: 'Ahmedabad',
      district: 'Ahmedabad City',
      state: 'Gujarat'
    });
  }

  // 1. Update ALL officers in DB to belong to this station so ANY logged-in officer sees the complaints!
  const updatedOfficers = await Officer.updateMany(
    {},
    { $set: { policeStation: station._id } }
  );
  console.log(`Updated ${updatedOfficers.modifiedCount} officers to policeStation: ${station._id}`);

  // 2. Update ALL complaints in local DB to belong to this station with ObjectId type and isDeleted: false
  const stationObjectId = new mongoose.Types.ObjectId(station._id);
  const updatedComplaints = await Complaint.updateMany(
    {},
    { $set: { policeStation: stationObjectId, isDeleted: false } }
  );
  console.log(`Updated ${updatedComplaints.modifiedCount} complaints to policeStation ObjectId: ${stationObjectId}`);

  // 3. Assign IO officer to GJ-AHM001-2026-8819
  const ioOfficer = await Officer.findOne({ role: 'IO' });
  const complaint = await Complaint.findOne({ complaintNumber: 'GJ-AHM001-2026-8819' });
  if (complaint && ioOfficer) {
    complaint.assignedIO = ioOfficer._id;
    await complaint.save();
    console.log(`Assigned IO ${ioOfficer._id} to complaint ${complaint.complaintNumber}`);
  }

  const allComplaints = await Complaint.find({});
  console.log(`Total complaints in local DB: ${allComplaints.length}`);
  allComplaints.forEach((c) => {
    console.log(`- Complaint ${c.complaintNumber} | Station: ${c.policeStation} | Status: ${c.status}`);
  });

  await mongoose.disconnect();
}

fix().catch(console.error);
