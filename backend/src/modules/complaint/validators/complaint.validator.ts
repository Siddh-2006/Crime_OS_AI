import Joi from 'joi';
import { ComplaintCategory } from '../enums/complaintCategory.enum';

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

const evidenceMetadataSchema = Joi.object({
  publicId: Joi.string().required(),
  secureUrl: Joi.string().uri().required(),
  resourceType: Joi.string().required(),
  mimeType: Joi.string().required(),
  originalFilename: Joi.string().required(),
  extension: Joi.string().required(),
  size: Joi.number().max(104857600).required(), // 100 MB max per file
});

export const createComplaintSchema = Joi.object({
  incidentDate: Joi.date().iso().max('now').required(),
  incidentTime: Joi.string().trim().optional().allow('', null),
  incidentPlace: Joi.string().trim().min(3).max(255).required(),
  category: Joi.string().valid(...Object.values(ComplaintCategory)).optional().allow('', null),
  shortDescription: Joi.string().trim().min(5).max(255).required(),
  detailedDescription: Joi.string().trim().min(10).required(),
  complainantUserId: Joi.string().pattern(objectIdPattern).required(),
  policeStation: Joi.string().pattern(objectIdPattern).optional().allow('', null),
  evidence: Joi.array().items(evidenceMetadataSchema).max(10).optional(),
  coordinates: Joi.string().trim().max(100).optional().allow('', null),
  address: Joi.string().trim().max(255).optional().allow('', null),
  approximateDateText: Joi.string().trim().max(100).optional().allow('', null),
});

export const approveComplaintSchema = Joi.object({
  assignedIO: Joi.string().pattern(objectIdPattern).required(),
});

export const rejectComplaintSchema = Joi.object({
  rejectionReason: Joi.string().trim().min(5).max(1000).required(),
});

export const updateComplaintSchema = Joi.object({
  detailedDescription: Joi.string().trim().optional(),
  crimeSummary: Joi.string().trim().optional(),
  legalSections: Joi.string().trim().optional(),
  investigationNotes: Joi.string().trim().optional(),
});

export const addEvidenceSchema = Joi.object({
  evidence: Joi.array().items(evidenceMetadataSchema).min(1).max(10).required(),
});
