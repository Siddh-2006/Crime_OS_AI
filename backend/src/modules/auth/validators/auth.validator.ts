import Joi from 'joi';
import { Gender } from '../../../shared/enums/gender.enum';
import { IdProofType } from '../../../shared/enums/idProof.enum';

const passwordSchema = Joi.string()
  .min(8)
  .max(64)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
  .required()
  .messages({
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
    'string.min': 'Password must be at least 8 characters',
    'string.max': 'Password must not exceed 64 characters',
  });

export const registerCitizenSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50).required(),
  middleName: Joi.string().trim().max(50).optional().allow(''),
  lastName: Joi.string().trim().min(2).max(50).required(),
  username: Joi.string().trim().alphanum().min(3).max(30).lowercase().required(),
  email: Joi.string().trim().email().lowercase().required(),
  phone: Joi.string().pattern(/^[6-9]\d{9}$/).required().messages({
    'string.pattern.base': 'Enter a valid 10-digit Indian mobile number',
  }),
  password: passwordSchema,
  dateOfBirth: Joi.date().iso().max('now').required().messages({
    'date.max': 'Date of birth cannot be in the future',
  }),
  gender: Joi.string().valid(...Object.values(Gender)).required(),
  address: Joi.string().trim().min(10).max(255).required(),
  city: Joi.string().trim().min(2).max(100).required(),
  district: Joi.string().trim().min(2).max(100).required(),
  state: Joi.string().trim().min(2).max(100).required(),
  pincode: Joi.string().pattern(/^\d{6}$/).required().messages({
    'string.pattern.base': 'Enter a valid 6-digit pincode',
  }),
  idProofType: Joi.string().valid(...Object.values(IdProofType)).required(),
  idProofNumber: Joi.string().trim().min(5).max(30).required(),
  securityQuestion: Joi.string().trim().min(10).max(255).required(),
  securityAnswer: Joi.string().trim().min(2).max(100).required(),
});

export const createComplainantProfileSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50).required(),
  middleName: Joi.string().trim().max(50).optional().allow(''),
  lastName: Joi.string().trim().min(2).max(50).required(),
  email: Joi.string().trim().email().lowercase().required(),
  phone: Joi.string().pattern(/^[6-9]\d{9}$/).required().messages({
    'string.pattern.base': 'Enter a valid 10-digit Indian mobile number',
  }),
  dateOfBirth: Joi.date().iso().max('now').required().messages({
    'date.max': 'Date of birth cannot be in the future',
  }),
  gender: Joi.string().valid(...Object.values(Gender)).required(),
  address: Joi.string().trim().min(10).max(255).required(),
  city: Joi.string().trim().min(2).max(100).required(),
  district: Joi.string().trim().min(2).max(100).required(),
  state: Joi.string().trim().min(2).max(100).required(),
  pincode: Joi.string().pattern(/^\d{6}$/).required().messages({
    'string.pattern.base': 'Enter a valid 6-digit pincode',
  }),
  idProofType: Joi.string().valid(...Object.values(IdProofType)).required(),
  idProofNumber: Joi.string().trim().min(5).max(30).required(),
});

export const verifyEmailSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required().messages({
    'string.length': 'OTP must be 6 digits',
    'string.pattern.base': 'OTP must contain only digits',
  }),
});

export const resendOtpSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
});

export const loginSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
  password: Joi.string().required(),
});

export const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
});

export const resetPasswordSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
  otp: Joi.string().length(6).pattern(/^\d+$/).required(),
  newPassword: passwordSchema,
});

export const policeLoginSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
  password: Joi.string().required(),
});
