const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/crime_os';

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, select: false },
}, { timestamps: true });

const Admin = mongoose.model('Admin', AdminSchema);

const ADMIN_USERNAME = process.env.SEED_ADMIN_USERNAME || 'admin@police.gov.in';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'AdminPassword123!';

mongoose.connect(MONGO_URI).then(async () => {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await Admin.findOneAndUpdate(
    { username: ADMIN_USERNAME },
    { password: hash },
    { upsert: true }
  );
  console.log(`Admin user seeded: ${ADMIN_USERNAME}`);
  process.exit(0);
}).catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
