import Joi from 'joi';
import { Role } from '../../../shared/enums/roles.enum';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const passwordSchema = Joi.string()
  .min(8)
  .max(64)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
  .required()
  .messages({
    'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
    'string.min': 'Password must be at least 8 characters',
  });

export const adminLoginSchema = Joi.object({
  username: Joi.string().trim().required(),
  password: Joi.string().required(),
});

export const createPoliceStationSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).required(),
  code: Joi.string().trim().alphanum().uppercase().min(3).max(15).required(),
  address: Joi.string().trim().min(5).max(255).required(),
  city: Joi.string().trim().min(2).max(100).required(),
  district: Joi.string().trim().min(2).max(100).required(),
  state: Joi.string().trim().min(2).max(100).default('Gujarat'),
  pincode: Joi.string().pattern(/^\d{6}$/).required().messages({
    'string.pattern.base': 'Enter a valid 6-digit pincode',
  }),
  phone: Joi.string().trim().min(8).max(15).required(),
  email: Joi.string().trim().email().lowercase().optional().allow(''),
});

export const updatePoliceStationSchema = Joi.object({
  name: Joi.string().trim().min(3).max(100).optional(),
  code: Joi.string().trim().alphanum().uppercase().min(3).max(15).optional(),
  address: Joi.string().trim().min(5).max(255).optional(),
  city: Joi.string().trim().min(2).max(100).optional(),
  district: Joi.string().trim().min(2).max(100).optional(),
  state: Joi.string().trim().min(2).max(100).optional(),
  pincode: Joi.string().pattern(/^\d{6}$/).optional(),
  phone: Joi.string().trim().min(8).max(15).optional(),
  email: Joi.string().trim().email().lowercase().optional().allow(''),
  isActive: Joi.boolean().optional(),
});

export const createOfficerSchema = Joi.object({
  officerName: Joi.string().trim().min(2).max(100).required(),
  badgeNumber: Joi.string().trim().uppercase().required(),
  email: Joi.string().trim().email().lowercase().required(),
  phone: Joi.string().pattern(/^[6-9]\d{9}$/).required().messages({
    'string.pattern.base': 'Enter a valid 10-digit mobile number',
  }),
  role: Joi.string().valid(Role.SHO, Role.IO).required(),
  policeStation: Joi.string().pattern(objectIdPattern).required().messages({
    'string.pattern.base': 'Invalid police station ID format',
  }),
  password: passwordSchema,
});

export const updateOfficerSchema = Joi.object({
  officerName: Joi.string().trim().min(2).max(100).optional(),
  badgeNumber: Joi.string().trim().uppercase().optional(),
  email: Joi.string().trim().email().lowercase().optional(),
  phone: Joi.string().pattern(/^[6-9]\d{9}$/).optional(),
  role: Joi.string().valid(Role.SHO, Role.IO).optional(),
  policeStation: Joi.string().pattern(objectIdPattern).optional(),
  password: Joi.string().min(8).max(64).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/).optional(),
  isActive: Joi.boolean().optional(),
});
