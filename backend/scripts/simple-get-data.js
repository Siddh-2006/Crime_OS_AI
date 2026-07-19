require('dotenv').config();
const mongoose = require('mongoose');
const { Complaint } = require('../dist/modules/complaint/models/Complaint.model');
const { User } = require('../dist/modules/user/models/User.model');
const { CaseChecklist } = require('../dist/modules/investigation/models/CaseChecklist.model');
const bcrypt = require('bcrypt');
const { Types } = mongoose;

async function getTestData() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crime-os');
  
  let io = await User.findOne({ username: 'testio' });
  if (!io) {
    console.log("No IO found");
    process.exit(1);
  }
  
  let complaint = await Complaint.findOne();
  if (!complaint) {
    console.log("No complaints found");
    process.exit(1);
  }
  
  // assign IO
  complaint.assignedIO = io._id;
  complaint.status = 'ASSIGNED_TO_IO';
  await complaint.save();
  
  // Ensure a checklist exists
  let checklist = await CaseChecklist.findOne({ case_id: complaint._id });
  if (!checklist) {
    await CaseChecklist.create({
      case_id: complaint._id,
      steps: [
        { step_id: 'verify_prima_facie', description: 'verify prima facie', status: 'completed', criticality: 'high', evidence_needed: [], evidence_collected: [] },
        { step_id: 'fund_hold_notice', description: 'fund hold notice', status: 'pending', criticality: 'high', evidence_needed: [], evidence_collected: [] }
      ]
    });
  }

  console.log('IO Credentials:');
  console.log('Email:', io.email);
  console.log('Password: password123');
  console.log('\nCase ID:', complaint._id);
  console.log('URL: http://localhost:3000/police/dashboard/complaints/' + complaint._id);
  
  process.exit(0);
}

getTestData().catch(console.error);
