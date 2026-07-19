const mongoose = require('mongoose');
const env = require('dotenv').config({ path: 'backend/.env' });
async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/crimeOS');
  const db = mongoose.connection.db;
  const officers = await db.collection('officers').find({}, { projection: { email: 1, role: 1, badgeNumber: 1, _id: 0, password: 1 } }).toArray();
  const citizens = await db.collection('citizens').find({}, { projection: { email: 1, _id: 0 } }).toArray();
  console.log("Officers:", JSON.stringify(officers, null, 2));
  console.log("Citizens:", JSON.stringify(citizens, null, 2));
  process.exit(0);
}
run();
