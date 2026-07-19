const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true, select: false },
}, { timestamps: true });

const Admin = mongoose.model('Admin', AdminSchema);

mongoose.connect('mongodb://localhost:27017/crime-os').then(async () => {
  const hash = await bcrypt.hash('AdminPassword123!', 10);
  await Admin.findOneAndUpdate(
    { username: 'admin@police.gov.in' },
    { password: hash },
    { upsert: true }
  );
  console.log('Admin user seeded');
  process.exit(0);
});
