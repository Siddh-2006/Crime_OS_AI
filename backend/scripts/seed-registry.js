const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// Since the model is TS, we might have to use raw mongoose.model or use ts-node
// I'll just use raw mongoose
const DepartmentRegistrySchema = new mongoose.Schema({}, { strict: false, collection: 'departmentregistries' });
const DepartmentRegistry = mongoose.model('DepartmentRegistry', DepartmentRegistrySchema);

mongoose.connect('mongodb://localhost:27017/crime-os').then(async () => {
  const jsonPath = path.join(__dirname, '../../services/legal_agent/parsed/Department_Registry.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  for (const dept of data) {
    await DepartmentRegistry.findOneAndUpdate(
      { entity_id: dept.entity_id },
      { ...dept, isActive: true },
      { upsert: true, new: true }
    );
  }
  console.log('Done syncing departments to DB.');
  process.exit(0);
});
