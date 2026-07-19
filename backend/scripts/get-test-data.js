require('dotenv').config();
const mongoose = require('mongoose');
const { Complaint } = require('../dist/modules/complaint/models/Complaint.model');
const { User } = require('../dist/modules/user/models/User.model');
const bcrypt = require('bcryptjs');

async function getTestData() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crime-os');
  
  let io = await User.findOne({ role: 'IO' });
  if (!io) {
    const passwordHash = await bcrypt.hash('password123', 10);
    io = await User.create({
      firstName: 'Test',
      lastName: 'IO',
      email: 'io@police.gov.in',
      phone: '1234567890',
      passwordHash,
      role: 'IO',
      badgeNumber: 'IO-999',
      isEmailVerified: true,
      policeStation: {
        _id: new mongoose.Types.ObjectId(),
        name: 'Test Station',
        code: 'TS-01',
        city: 'Test City',
        district: 'Test District',
        state: 'Gujarat',
      }
    });
  }

  console.log('IO Credentials:');
  console.log('Email:', io.email);
  console.log('Password: password123');
  
  // Find a complaint assigned to this IO
  let complaint = await Complaint.findOne({ 'assignedIO._id': io._id });
  if (!complaint) {
     complaint = await Complaint.findOne();
     if (!complaint) {
       complaint = await Complaint.create({
         complaintNumber: 'CMP-' + Date.now(),
         code: 'CMP-' + Date.now(),
         citizen: {
           _id: new mongoose.Types.ObjectId(),
           firstName: 'Citizen',
           lastName: 'Test',
           email: 'citizen@test.com',
           phone: '0987654321'
         },
         incidentPlace: 'Street',
         category: 'cyber_crime',
         incidentDate: new Date(),
         shortDescription: 'Fraud',
         detailedDescription: 'Financial fraud reported.',
         policeStation: io.policeStation,
         status: 'ASSIGNED_TO_IO',
         assignedIO: { _id: io._id, officerName: 'Test IO', badgeNumber: 'IO-999' },
         descriptionHistory: [],
         crimeSummaryHistory: [],
         legalSectionsHistory: [],
         investigationNotesHistory: [],
         evidence: [],
         timeline: []
       });
     } else {
       complaint.assignedIO = { _id: io._id, officerName: io.firstName + ' ' + io.lastName, badgeNumber: io.badgeNumber || '123' };
       complaint.status = 'ASSIGNED_TO_IO';
       await complaint.save();
     }
  }

  console.log('\nCase ID:', complaint._id);
  console.log('URL: http://localhost:3000/police/dashboard/complaints/' + complaint._id);
  
  process.exit(0);
}

getTestData().catch(console.error);
