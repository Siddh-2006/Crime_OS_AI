/**
 * Police seed script — manually inserts officers into MongoDB.
 * Run once: npm run seed
 *
 * Usage: Modify the `officers` array below before running.
 */
import 'dotenv/config';
import { Officer } from '../modules/police/models/Officer.model';
import { PoliceStation } from '../modules/police/models/PoliceStation.model';
import { Admin } from '../modules/admin/models/Admin.model';
import { hashPassword } from '../shared/utils/hash.util';
import { Role } from '../shared/enums/roles.enum';
import logger from '../config/logger';

import { connectDatabase, disconnectDatabase } from '../config/database';

async function seed(): Promise<void> {
  await connectDatabase();
  logger.info('Connected to MongoDB for seeding');

  // ─── Seed a police station first ─────────────────────────────────────────────
  const existingStation = await PoliceStation.findOne({ code: 'AHM001' });
  let station = existingStation;

  if (!station) {
    station = await PoliceStation.create({
      name: 'Ahmedabad Central Police Station',
      code: 'AHM001',
      address: 'Shahibaug Road, Ahmedabad',
      city: 'Ahmedabad',
      district: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380004',
      phone: '079-25503500',
      email: 'ahm.central@gujaratpolice.gov.in',
    });
    logger.info('Police station seeded', { code: station.code });
  }

  // ─── Seed officers ────────────────────────────────────────────────────────────
  const officersData = [
    {
      officerName: 'Rajesh Kumar Singh',
      badgeNumber: 'GUJ-SHO-001',
      email: 'rajesh.singh@gujaratpolice.gov.in',
      phone: '9876543210',
      role: Role.SHO,
      password: 'Admin@1234',
    },
    {
      officerName: 'Priya Patel',
      badgeNumber: 'GUJ-IO-002',
      email: 'priya.patel@gujaratpolice.gov.in',
      phone: '9876543211',
      role: Role.IO,
      password: 'Admin@1234',
    },
  ];

  for (const officerData of officersData) {
    const exists = await Officer.findOne({ email: officerData.email });
    if (exists) {
      logger.warn('Officer already exists — skipping', { email: officerData.email });
      continue;
    }

    const hashedPassword = await hashPassword(officerData.password);
    await Officer.create({
      ...officerData,
      password: hashedPassword,
      policeStation: station._id,
      isActive: true,
    });

    logger.info('Officer seeded', {
      email: officerData.email,
      role: officerData.role,
      badgeNumber: officerData.badgeNumber,
    });
  }

  // ─── Seed Admin ──────────────────────────────────────────────────────────────
  const existingAdmin = await Admin.findOne({ username: 'admin' });
  if (!existingAdmin) {
    const hashedAdminPassword = await hashPassword('Admin@1234');
    await Admin.create({
      username: 'admin',
      password: hashedAdminPassword,
    });
    logger.info('Admin user seeded', { username: 'admin' });
  } else {
    logger.warn('Admin user already exists — skipping');
  }

  // ─── Seed Citizen ────────────────────────────────────────────────────────────
  const { User } = require('../modules/user/models/User.model');
  const existingCitizen = await User.findOne({ email: 'shahsiddhp@gmail.com' });
  if (!existingCitizen) {
    const hashedCitizenPassword = await hashPassword('password123');
    await User.create({
      firstName: 'Siddh',
      lastName: 'Shah',
      email: 'shahsiddhp@gmail.com',
      password: hashedCitizenPassword,
      phone: '9999999999',
      address: 'Test Address',
      city: 'Ahmedabad',
      district: 'Ahmedabad',
      state: 'Gujarat',
      isVerified: true,
      username: 'shahsiddhp',
      dateOfBirth: new Date('1990-01-01'),
      gender: 'Male',
      pincode: '380001',
      idProofType: 'Aadhaar',
      idProofNumber: '123456789012',
      securityQuestion: 'What is your pet name?',
      securityAnswer: 'Dog'
    });
    logger.info('Test Citizen seeded', { email: 'shahsiddhp@gmail.com' });
  } else {
    logger.warn('Test Citizen already exists — skipping');
  }

  // ─── Seed Department ─────────────────────────────────────────────────────────
  const { DepartmentRegistry } = require('../modules/admin/models/DepartmentRegistry.model');
  const existingDept = await DepartmentRegistry.findOne({ entity_id: 'TELECOM' });
  if (!existingDept) {
    await DepartmentRegistry.create({
      entity_id: 'TELECOM',
      entity_name: 'Telecom Nodal Officer',
      contact_email: 'itssiddh7@gmail.com',
      auto_escalation_days: 7,
      what_they_can_provide: 'CDR, IP Logs',
      legal_basis_typically_cited: 'Sec 91 CRPC'
    });
    await DepartmentRegistry.create({
      entity_id: 'BANK',
      entity_name: 'Bank Nodal Officer',
      contact_email: 'itssiddh7@gmail.com',
      auto_escalation_days: 7,
      what_they_can_provide: 'Account Freeze, KYC',
      legal_basis_typically_cited: 'Sec 91 CRPC'
    });
    logger.info('Test Departments seeded with email itssiddh7@gmail.com');
  } else {
    logger.warn('Test Departments already exist — skipping');
  }

  logger.info('Seeding complete');
  await disconnectDatabase();
  process.exit(0);
}

seed().catch((err) => {
  logger.error('Seed script failed', { error: err });
  process.exit(1);
});
