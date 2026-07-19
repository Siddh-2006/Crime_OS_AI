const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/crime-os';

// ---------------------------------------------------------
// 1. Raw Mongoose Schemas (avoids TS compilation dependency)
// ---------------------------------------------------------
const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
}, { timestamps: true });
const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);

const OfficerSchema = new mongoose.Schema({
  officerName: String,
  badgeNumber: String,
  email: { type: String, unique: true },
  phone: String,
  role: String,
  policeStation: mongoose.Schema.Types.ObjectId,
  isActive: Boolean,
  password: { type: String, select: false }
});
const Officer = mongoose.models.Officer || mongoose.model('Officer', OfficerSchema);

const UserSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  username: { type: String, unique: true },
  email: { type: String, unique: true },
  phone: String,
  password: { type: String, select: false },
  dateOfBirth: Date,
  gender: String,
  address: String,
  city: String,
  district: String,
  state: String,
  pincode: String,
  idProofType: String,
  idProofNumber: String,
  securityQuestion: String,
  securityAnswer: String,
  role: { type: String, default: 'citizen' },
  department_entity_id: String,
  isEmailVerified: Boolean
}, { collection: 'users' });
const User = mongoose.models.User || mongoose.model('User', UserSchema);

const PoliceStationSchema = new mongoose.Schema({ 
  name: String, code: String, city: String, district: String, state: String 
}, { strict: false });
const PoliceStation = mongoose.models.PoliceStation || mongoose.model('PoliceStation', PoliceStationSchema);

const DepartmentRegistrySchema = new mongoose.Schema({
  entity_id: String,
  entity_name: String,
}, { collection: 'departmentregistries' });
const DepartmentRegistry = mongoose.models.DepartmentRegistry || mongoose.model('DepartmentRegistry', DepartmentRegistrySchema);

// ---------------------------------------------------------
// 2. Main Seed Function
// ---------------------------------------------------------
async function seedAll() {
  try {
    await mongoose.connect(MONGO_URI);
    
    // Store credentials for the markdown table
    const credentials = [];
    const pushCred = (role, user, pass, url) => credentials.push(`| ${role} | \`${user}\` | \`${pass}\` | [Link](${url}) |`);

    // Hashed passwords
    const adminPassHash = await bcrypt.hash('AdminPassword123!', 10);
    const policePassHash = await bcrypt.hash('password123', 10);
    const citizenPassHash = await bcrypt.hash('password123', 10);
    const deptPassHash = await bcrypt.hash('Testing123!', 10);
    const securityAnswerHash = await bcrypt.hash('Test', 10);

    // --- Admin ---
    await Admin.findOneAndUpdate(
      { username: 'admin@police.gov.in' },
      { password: adminPassHash },
      { upsert: true, new: true }
    );
    pushCred('Admin / City Head', 'admin@police.gov.in', 'AdminPassword123!', 'http://localhost:3000/admin/login');

    // --- Police Station ---
    let station = await PoliceStation.findOne({ code: 'TS-01' });
    if (!station) {
      station = await PoliceStation.create({ name: 'Cyber Station HQ', code: 'TS-01', city: 'Cyber City', district: 'Central', state: 'Gujarat' });
    }

    // --- IO Account ---
    await Officer.findOneAndUpdate(
      { email: 'io@police.gov.in' },
      {
        officerName: 'Test IO',
        badgeNumber: 'IO-999',
        phone: '1234567890',
        role: 'IO',
        policeStation: station._id,
        isActive: true,
        password: policePassHash
      },
      { upsert: true, new: true }
    );
    pushCred('Investigating Officer (IO)', 'io@police.gov.in', 'password123', 'http://localhost:3000/login');

    // --- SHO Account ---
    await Officer.findOneAndUpdate(
      { email: 'sho@police.gov.in' },
      {
        officerName: 'Test SHO',
        badgeNumber: 'SHO-001',
        phone: '1234567891',
        role: 'SHO',
        policeStation: station._id,
        isActive: true,
        password: policePassHash
      },
      { upsert: true, new: true }
    );
    pushCred('Station House Officer (SHO)', 'sho@police.gov.in', 'password123', 'http://localhost:3000/login');

    // --- Citizen Account ---
    await User.findOneAndUpdate(
      { username: 'rakesh' },
      {
        firstName: 'Rakesh',
        lastName: 'Patel',
        email: 'rakesh@test.com',
        phone: '9876543210',
        password: citizenPassHash,
        dateOfBirth: new Date('1985-01-01'),
        gender: 'MALE',
        address: '456 Test St',
        city: 'Test City',
        district: 'Test District',
        state: 'Gujarat',
        pincode: '380001',
        idProofType: 'AADHAAR',
        idProofNumber: '098765432109',
        securityQuestion: 'What is your pet name?',
        securityAnswer: securityAnswerHash,
        role: 'citizen',
        isEmailVerified: true
      },
      { upsert: true, new: true }
    );
    pushCred('Citizen', 'rakesh@test.com', 'password123', 'http://localhost:3000/login');

    // --- Department Mock Accounts ---
    const registries = await DepartmentRegistry.find({});
    for (const dept of registries) {
      if (!dept.entity_id) continue;
      const username = dept.entity_id.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const email = `${username}@leo.mockdept.local`;

      await User.findOneAndUpdate(
        { username },
        {
          firstName: dept.entity_name || dept.entity_id,
          lastName: 'Department',
          email,
          phone: '9999999999',
          password: deptPassHash,
          dateOfBirth: new Date('2000-01-01'),
          gender: 'other',
          address: 'Virtual',
          city: 'Virtual',
          district: 'Virtual',
          state: 'Virtual',
          pincode: '000000',
          idProofType: 'aadhaar',
          idProofNumber: '000000000000',
          securityQuestion: 'What is your mock name?',
          securityAnswer: securityAnswerHash,
          role: 'department',
          department_entity_id: dept.entity_id,
          isEmailVerified: true
        },
        { upsert: true, new: true }
      );
      pushCred(`Dept: ${dept.entity_name || dept.entity_id}`, username, 'Testing123!', 'http://localhost:3000/department/login');
    }

    // --- Output Markdown Table ---
    const fs = require('fs');
    
    let mdOutput = `# Crime OS Tester Credentials\n\n`;
    mdOutput += `Here are the unified test credentials across all modules. This script is idempotent and guarantees these accounts exist.\n\n`;
    mdOutput += `| Role | Username / Email | Password | Dashboard / Login URL |\n`;
    mdOutput += `|---|---|---|---|\n`;
    mdOutput += credentials.join('\n');
    mdOutput += `\n\n*Note: For Police accounts (IO and SHO), use the unified \`/login\` route and select the "Police Officer" toggle.*\n`;

    fs.writeFileSync(path.join(__dirname, '../../test_credentials.md'), mdOutput);

    console.log(mdOutput);
    console.log('\n✅ Script completed successfully. Output saved to test_credentials.md at the project root.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  }
}

seedAll();
