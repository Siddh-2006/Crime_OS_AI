const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/crime-os';

const UserSchema = new mongoose.Schema(
  {
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
    role: String,
    department_entity_id: String,
  },
  { collection: 'users' }
);
const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function seedDepartments() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const registryPath = path.join(__dirname, '../department_registry.json');
    if (!fs.existsSync(registryPath)) {
      console.log('No department_registry.json found. Creating a default one.');
      const defaultRegistry = [
        { entity_id: 'HDFC Bank', category: 'financial' },
        { entity_id: 'Jio', category: 'telecom' },
        { entity_id: 'cyber_cell', category: 'law_enforcement' },
        { entity_id: 'crypto_exchange_A', category: 'financial' },
        { entity_id: 'social_media_B', category: 'social_media' }
      ];
      fs.writeFileSync(registryPath, JSON.stringify(defaultRegistry, null, 2));
    }

    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    
    console.log('\n--- MOCK DEPARTMENT PORTAL CREDENTIALS ---\n');
    console.log('| Entity ID | Username | Password | Dashboard URL |');
    console.log('|---|---|---|---|');

    const passwordHash = await bcrypt.hash('Testing123!', 10);
    const securityAnswerHash = await bcrypt.hash('Test', 10);

    for (const dept of registry) {
      const username = dept.entity_id.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const email = `${username}@leo.mockdept.local`;

      await User.findOneAndUpdate(
        { username },
        {
          firstName: dept.entity_id,
          lastName: 'Department',
          username,
          email,
          phone: '9999999999',
          password: passwordHash,
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
          department_entity_id: dept.entity_id
        },
        { upsert: true, new: true }
      );

      console.log(`| ${dept.entity_id} | \`${username}\` | \`Testing123!\` | \`http://localhost:3000/department/login\` |`);
    }

    console.log('\nDepartments seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding departments:', error);
    process.exit(1);
  }
}

seedDepartments();
