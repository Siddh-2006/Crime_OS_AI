import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

const createCitizen = async () => {
    try {
        await mongoose.connect(uri as string);
        const db = mongoose.connection.db;
        if (!db) {
            console.error("DB connection failed");
            process.exit(1);
        }
        
        const email = 'io@police.gov.in';
        const hashedPassword = await bcrypt.hash('password123', 10);
        
        const existing = await db.collection('users').findOne({ email });
        if (existing) {
            console.log("User already exists in 'users' collection! Updating password to password123 and verifying email...");
            await db.collection('users').updateOne(
                { email }, 
                { $set: { password: hashedPassword, isEmailVerified: true } }
            );
            console.log("Updated existing account.");
        } else {
            console.log("Creating new citizen account...");
            const securityAnswer = await bcrypt.hash('dog', 10);
            await db.collection('users').insertOne({
                firstName: 'IO',
                lastName: 'Officer',
                username: 'io_citizen_test_' + Date.now(),
                email: email,
                phone: '1234567890',
                password: hashedPassword,
                dateOfBirth: new Date('1990-01-01'),
                gender: 'Male',
                address: '123 Police Station Rd',
                city: 'Ahmedabad',
                district: 'Ahmedabad',
                state: 'Gujarat',
                pincode: '380001',
                idProofType: 'Aadhaar',
                idProofNumber: '123412341234',
                securityQuestion: 'What is your pet name?',
                securityAnswer: securityAnswer,
                isEmailVerified: true,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            console.log("Citizen account created!");
        }
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
};

createCitizen();
