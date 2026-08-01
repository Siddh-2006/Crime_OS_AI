import 'dotenv/config';
import { User } from '../modules/user/models/User.model';
import { hashPassword } from '../shared/utils/hash.util';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Gender } from '../shared/enums/gender.enum';
import { IdProofType } from '../shared/enums/idProof.enum';

async function seed() {
  await connectDatabase();
  console.log('Connected to MongoDB');

  const email = 'shahsiddhp@gmail.com';
  const existing = await User.findOne({ email });
  if (existing) {
    console.log('Citizen already exists! Updating password...');
    existing.password = await hashPassword('password123');
    await existing.save();
    console.log('Password updated.');
  } else {
    console.log('Creating new citizen...');
    await User.create({
      firstName: 'Siddh',
      lastName: 'Shah',
      username: 'shahsiddhp',
      email: email,
      phone: '9999999999',
      password: await hashPassword('password123'),
      dateOfBirth: new Date('1990-01-01'),
      gender: Gender.MALE,
      address: 'Test Address',
      city: 'Ahmedabad',
      district: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380001',
      idProofType: IdProofType.AADHAAR,
      idProofNumber: '123456789012',
      securityQuestion: 'What is your pet name?',
      securityAnswer: await hashPassword('fluffy'),
      isEmailVerified: true
    });
    console.log('Citizen created successfully.');
  }

  await disconnectDatabase();
}

seed().catch(console.error);
