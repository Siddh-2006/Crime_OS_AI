import { v4 as uuidv4 } from 'uuid';
import { IComplaintRepository } from '../repositories/IComplaintRepository';
import { Complaint, IComplaint, IEvidenceMetadata } from '../models/Complaint.model';
import { ComplaintStatus } from '../enums/complaintStatus.enum';
import { ComplaintCategory } from '../enums/complaintCategory.enum';
import { PoliceStation } from '../../police/models/PoliceStation.model';
import { Officer } from '../../police/models/Officer.model';
import { User } from '../../user/models/User.model';
import { DiaryEntry } from '../../investigation/models/DiaryEntry.model';
import { Evidence } from '../../investigation/models/Evidence.model';
import { getRedisClient } from '../../../config/redis';
import { REDIS_KEYS, REDIS_TTL } from '../../../shared/constants/redis.constants';
import { NotFoundError } from '../../../common/errors/NotFoundError';
import { ValidationError } from '../../../common/errors/ValidationError';
import { AuthorizationError } from '../../../common/errors/AuthorizationError';
import { ConflictError } from '../../../common/errors/ConflictError';
import { EmailQueue } from '../../../shared/queue/EmailQueue';
import { FirQueue } from '../../../shared/queue/FirQueue';
import cloudinary from '../../../config/cloudinary';
import { Types } from 'mongoose';
import logger from '../../../config/logger';
import axios from 'axios';
import env from '../../../config/env';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { InvestigationOrchestrator } from '../../investigation/services/investigationOrchestrator';
import { ChargeSheetGenerator } from '../../investigation/services/ChargeSheetGenerator';
import { CaseParticipant } from '../../investigation/models/CaseParticipant.model';

export class ComplaintService {
  constructor(private readonly complaintRepository: IComplaintRepository) {}

  // Helper to check if a complaint is locked (immutable FIR)
  private checkLock(complaint: IComplaint): void {
    if (complaint.status === ComplaintStatus.FIR_REGISTERED || complaint.status === ComplaintStatus.CLOSED) {
      throw new ValidationError('This complaint is locked because the case has already been registered or closed.');
    }
  }

  // ─── Direct Cloudinary Upload Parameter Generation ──────────────────────────
  async getUploadSignature(citizenId: string, caseId?: string): Promise<any> {
    const timestamp = Math.round(new Date().getTime() / 1000);
    const publicId = `evidence_${uuidv4()}`;
    const folder = caseId ? `crime-os/evidence/${caseId}` : `crime-os/evidence/${citizenId}`;

    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        folder,
        public_id: publicId,
      },
      cloudinary.config().api_secret!
    );

    return {
      signature,
      timestamp,
      apiKey: cloudinary.config().api_key,
      cloudName: cloudinary.config().cloud_name,
      folder,
      publicId,
    };
  }

  // ─── Manual Search with Redis Cache ──────────────────────────────────────────
  async searchPoliceStations(query: string): Promise<any[]> {
    const redis = getRedisClient();
    let stations: any[] = [];
    const trimmedQuery = query?.trim() ?? '';

    logger.info('[ComplaintService] Searching police stations', {
      queryLength: trimmedQuery.length,
      hasQuery: trimmedQuery.length > 0,
    });

    try {
      const cached = await redis.get(REDIS_KEYS.POLICE_STATIONS_LIST);
      if (cached) {
        stations = JSON.parse(cached);
        logger.info('[ComplaintService] Police stations loaded from Redis cache', {
          count: stations.length,
        });
      }
    } catch (err: any) {
      logger.warn('[ComplaintService] Redis police-station cache unavailable, falling back to MongoDB', {
        error: err?.message,
      });
    }

    if (stations.length === 0) {
      stations = await PoliceStation.find({ isActive: true }).lean().exec();
      logger.info('[ComplaintService] Police stations loaded from MongoDB', {
        count: stations.length,
      });

      try {
        await redis.set(
          REDIS_KEYS.POLICE_STATIONS_LIST,
          JSON.stringify(stations),
          'EX',
          REDIS_TTL.POLICE_STATIONS
        );
        logger.debug('[ComplaintService] Police station cache refreshed', {
          count: stations.length,
        });
      } catch (err: any) {
        logger.warn('[ComplaintService] Failed to refresh police-station cache', {
          error: err?.message,
        });
      }
    }

    if (!trimmedQuery) {
      logger.info('[ComplaintService] Returning full police-station list', { count: stations.length });
      return stations;
    }

    // Normalization helper
    const normalize = (str: string): string[] => {
      return str
        .toLowerCase()
        .replace(/[^\w\s]/g, '') // remove punctuation
        .replace(/\s+/g, ' ') // normalize whitespace
        .trim()
        .split(' ')
        .filter(Boolean);
    };

    const queryWords = normalize(trimmedQuery);

    const scored = stations.map((station) => {
      const targetText = `${station.name} ${station.city} ${station.district} ${station.code}`;
      const targetWords = normalize(targetText);

      // Score based on word matches
      let matchCount = 0;
      queryWords.forEach((qWord) => {
        if (targetWords.some((tWord) => tWord.includes(qWord) || qWord.includes(tWord))) {
          matchCount++;
        }
      });

      return { station, score: matchCount };
    });

    const filtered = scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.station);

    logger.info('[ComplaintService] Police station search completed', {
      queryLength: trimmedQuery.length,
      resultCount: filtered.length,
    });

    return filtered;
  }

  // ─── Create Complaint ───────────────────────────────────────────────────────
  async createComplaint(actorId: string, data: any, ip: string): Promise<IComplaint> {
    const {
      incidentDate,
      incidentTime,
      incidentPlace,
      category,
      shortDescription,
      detailedDescription,
      complainantUserId,
      policeStation,
      evidence = [],
      coordinates,
      address,
      approximateDateText,
    } = data;

    const resolvedComplainantId = complainantUserId || actorId;
    const officer = await Officer.findById(actorId).lean().exec();
    const resolvedPoliceStation = policeStation || (officer?.policeStation?.toString() ?? null);

    if (!resolvedPoliceStation) {
      throw new NotFoundError('Police Station');
    }

    // Verify station exists
    const stationExists = await PoliceStation.findById(resolvedPoliceStation);
    if (!stationExists) {
      throw new NotFoundError('Police Station');
    }

    // Generate unique complaint number
    const complaintNumber = `COMP-${uuidv4()}`;

    const validatedEvidence: IEvidenceMetadata[] = evidence.map((file: any) => ({
      publicId: file.publicId,
      secureUrl: file.secureUrl,
      resourceType: file.resourceType,
      mimeType: file.mimeType,
      originalFilename: file.originalFilename || 'unnamed_file',
      extension: file.extension || 'bin',
      size: file.size || 0,
      uploadedBy: new Types.ObjectId(actorId),
      uploadedAt: new Date(),
      processingStatus: 'PENDING',
    }));

    const newComplaintData: Partial<IComplaint> = {
      complaintNumber,
      status: ComplaintStatus.SUBMITTED,
      citizen: new Types.ObjectId(resolvedComplainantId),
      policeStation: new Types.ObjectId(resolvedPoliceStation),
      incidentDate: new Date(incidentDate),
      incidentTime,
      incidentPlace,
      approximateDateText,
      coordinates,
      address,
      category: category ? (category as ComplaintCategory) : undefined,
      shortDescription,
      detailedDescription,
      currentVersionNumber: 1,
      evidence: validatedEvidence,
      processingStatus: 'PENDING',
      complaintIntelligence: {},
      descriptionHistory: [
        {
          version: 1,
          editedBy: officer ? 'IO' : 'Citizen',
          editorId: new Types.ObjectId(actorId),
          content: detailedDescription,
          timestamp: new Date(),
        },
      ],
      timeline: [
        {
          user: 'Citizen',
          timestamp: new Date(),
          description: officer ? 'Complaint submitted successfully by police officer.' : 'Complaint submitted successfully by Citizen.',
        },
      ],
      auditLogs: [
        {
          actor: actorId,
          ip,
          timestamp: new Date(),
          newValue: JSON.stringify({ complaintNumber, category, status: ComplaintStatus.SUBMITTED }),
          action: 'COMPLAINT_CREATION',
        },
      ],
    };

    const created = await this.complaintRepository.create(newComplaintData);

    // ── Seed standalone evidences collection ─────────────────────────────────
    // The Python complaint-intelligence service updates the evidences collection
    // (keyed by evidence_id = Cloudinary publicId) with AI metadata after processing.
    // We pre-create PENDING records here so Python's $set finds them immediately.
    if (validatedEvidence.length > 0) {
      const evidenceDocs = validatedEvidence.map((file) => ({
        case_id:          created._id,
        evidence_id:      file.publicId,           // matches Python's profile.evidence_id
        type:             file.resourceType || 'image',
        storage_ref:      file.secureUrl,
        ai_tags:          [],
        uploader_id:      new Types.ObjectId(actorId),
        status:           'pending' as const,
        source:           'complainant' as const,
        processingStatus: 'PENDING' as const,
        originalFilename: file.originalFilename,
        mimeType:         file.mimeType,
        size:             file.size,
      }));
      try {
        await Evidence.insertMany(evidenceDocs, { ordered: false });
        logger.debug('Seeded evidences collection for complaint', {
          complaintId: created._id,
          count: evidenceDocs.length,
        });
      } catch (seedErr: any) {
        // Duplicate key = already exists, safe to ignore
        if (seedErr?.code !== 11000) {
          logger.warn('Failed to seed evidences collection', { error: seedErr?.message });
        }
      }
    }


    // Write to Case Diary
    await DiaryEntry.create({
      case_id: created._id,
      entry_id: uuidv4(),
      timestamp: new Date(),
      actor: { type: 'officer', id: actorId },
      event_type: 'complaint_filed',
      payload: {
        complainant_id: resolvedComplainantId,
        incident_date: incidentDate,
        incident_place: incidentPlace,
        category: category,
        short_description: shortDescription,
        detailed_description: detailedDescription,
        evidence_count: validatedEvidence.length,
        evidence_list: validatedEvidence.map((e: any) => ({ filename: e.originalFilename, type: e.resourceType })),
      }
    });

    logger.info('Complaint filed', { actorId, complainantId: resolvedComplainantId, complaintNumber: created.complaintNumber, complaintId: created._id });

    // Automatically trigger full M1-M12 processing pipeline in background
    this.triggerComplaintIntelligencePipeline(created.complaintNumber);

    return created;
  }

  // ─── Automated Pipeline Trigger ─────────────────────────────────────────────
  private triggerComplaintIntelligencePipeline(complaintNumber: string): void {
    try {
      logger.info(`[ComplaintIntelligence] Triggering full pipeline for ${complaintNumber}`);

      // 1. Primary: Microservice HTTP call
      const microserviceUrl = env.COMPLAINT_INTELLIGENCE_URL || 'http://localhost:8000';
      axios.post(`${microserviceUrl}/trigger-full-pipeline`, {
        complaint_number: complaintNumber,
      }, { timeout: 15000 }).then((response) => {
        if (response.status === 200 || response.status === 202) {
          logger.info(`[ComplaintIntelligence] Successfully triggered full pipeline via HTTP API for ${complaintNumber}`);
        }
      }).catch((httpError) => {
        logger.warn(`[ComplaintIntelligence] Microservice HTTP endpoint at ${microserviceUrl} un-reachable (${httpError?.message}). Falling back to local process spawn.`);
      // const pyProcess = spawn(pythonExec, [scriptPath, complaintNumber], {
      //   cwd: scriptDir,
      //   stdio: ['ignore', 'pipe', 'pipe'],
      //   env: { ...process.env, PYTHONUTF8: '1', MONGODB_DB: 'crime_os' }
      // });

        /* ── Previous direct process spawn code (commented out as fallback) ──
        const scriptPath = path.resolve(__dirname, '../../../../../services/complaint_intelligence/run_pipeline_from_atlas.py');
        const venvPythonIntell = path.resolve(__dirname, '../../../../../services/complaint_intelligence/.venv/Scripts/python.exe');
        const venvPythonRoot = path.resolve(__dirname, '../../../../../services/.venv/Scripts/python.exe');
        const pythonExec = process.platform === 'win32'
          ? (fs.existsSync(venvPythonIntell) ? venvPythonIntell : (fs.existsSync(venvPythonRoot) ? venvPythonRoot : 'python'))
          : 'python';

        const scriptDir = path.dirname(scriptPath);
        const pyProcess = spawn(pythonExec, [scriptPath, complaintNumber], {
          cwd: scriptDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONUTF8: '1', MONGODB_DB: 'test' }
        });

        pyProcess.stdout?.on('data', (data: Buffer) => {
          const lines = data.toString('utf-8').split(/\r?\n/);
          for (const line of lines) {
            if (line.trim()) logger.info(`[ComplaintIntelligence] ${line}`);
          }
        });

        pyProcess.stderr?.on('data', (data: Buffer) => {
          const lines = data.toString('utf-8').split(/\r?\n/);
          for (const line of lines) {
            if (line.trim()) logger.error(`[ComplaintIntelligence Error] ${line}`);
          }
        });

        pyProcess.on('close', (code: number) => {
          if (code === 0) {
            logger.info(`[ComplaintIntelligence] Pipeline completed successfully for ${complaintNumber}`);
          } else {
            logger.error(`[ComplaintIntelligence] Pipeline exited with code ${code} for ${complaintNumber}`);
          }
        });
        ─────────────── */

        // Fallback execution
        const scriptPath = path.resolve(__dirname, '../../../../../services/complaint_intelligence/run_pipeline_from_atlas.py');
        const venvPythonIntell = path.resolve(__dirname, '../../../../../services/complaint_intelligence/.venv/Scripts/python.exe');
        const venvPythonRoot = path.resolve(__dirname, '../../../../../services/.venv/Scripts/python.exe');
        const pythonExec = process.platform === 'win32'
          ? (fs.existsSync(venvPythonIntell) ? venvPythonIntell : (fs.existsSync(venvPythonRoot) ? venvPythonRoot : 'python'))
          : 'python';

        const scriptDir = path.dirname(scriptPath);
        const pyProcess = spawn(pythonExec, [scriptPath, complaintNumber], {
          cwd: scriptDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONUTF8: '1', MONGODB_DB: 'test' }
        });

        pyProcess.on('close', (code: number) => {
          if (code === 0) {
            logger.info(`[ComplaintIntelligence] Fallback pipeline completed successfully for ${complaintNumber}`);
          } else {
            logger.error(`[ComplaintIntelligence] Fallback pipeline exited with code ${code} for ${complaintNumber}`);
          }
        });
      });
    } catch (err: any) {
      logger.error(`[ComplaintIntelligence] Failed to trigger pipeline for ${complaintNumber}`, { error: err?.message });
    }
  }

  // ─── Re-run Complaint Intelligence Pipeline ─────────────────────────────────
  async rerunComplaintIntelligencePipeline(id: string): Promise<IComplaint> {
    const complaint = await this.complaintRepository.findById(id);
    if (!complaint) {
      throw new NotFoundError('Complaint');
    }

    complaint.processingStatus = 'PENDING' as any;
    await this.complaintRepository.save(complaint);

    logger.info('[ComplaintService] Re-triggering Complaint Intelligence pipeline', {
      complaintId: id,
      complaintNumber: complaint.complaintNumber,
    });

    this.triggerComplaintIntelligencePipeline(complaint.complaintNumber);

    return complaint;
  }

  // ─── Get Citizen's Complaints ──────────────────────────────────────────────
  async getCitizenComplaints(citizenId: string): Promise<IComplaint[]> {
    return this.complaintRepository.findCitizenComplaints(citizenId);
  }

  // ─── Get Complaint By ID (with Ownership Check) ─────────────────────────────
  async getComplaintById(id: string, user: { sub: string; role: string }): Promise<IComplaint> {
    const complaint = await this.complaintRepository.findById(id);
    if (!complaint) {
      throw new NotFoundError('Complaint');
    }

    // Role-based auth
    if (user.role === 'USER') {
      if (String(complaint.citizen._id) !== user.sub) {
        throw new AuthorizationError('You do not have access to view this complaint.');
      }
    } else {
      // Police check: must belong to the officer's police station
      const officer = await Officer.findById(user.sub);
      if (!officer) {
        throw new AuthorizationError('Police officer profile not found.');
      }
      if (String(complaint.policeStation._id) !== String(officer.policeStation)) {
        throw new AuthorizationError('This complaint belongs to another police station.');
      }

      if (officer.role === 'IO') {
        const assignedIOId = complaint.assignedIO ? String((complaint.assignedIO as any)._id ?? complaint.assignedIO) : null;
        if (assignedIOId !== user.sub) {
          throw new AuthorizationError('You can only view complaints assigned to you.');
        }
      }
    }

    // Normalize PDF URL so browser can open it:
    // 1. Raw uploads without fl_attachment → add it
    // 2. Old uploads stored as /image/upload/ → rewrite to /raw/upload/fl_attachment/
    const complaintObj = complaint.toObject ? complaint.toObject() : complaint;
    if (complaintObj.firPdfUrl) {
      let url = complaintObj.firPdfUrl as string;
      if (url.includes('/image/upload/') && url.endsWith('.pdf')) {
        // Old upload — switch resource type and add fl_attachment
        url = url.replace('/image/upload/', '/raw/upload/fl_attachment/');
      } else if (url.includes('/raw/upload/') && !url.includes('fl_attachment')) {
        url = url.replace('/raw/upload/', '/raw/upload/fl_attachment/');
      }
      (complaintObj as any).firPdfUrl = url;
    }

    if (complaintObj.evidence && Array.isArray(complaintObj.evidence)) {
      // Fix PDF URLs
      complaintObj.evidence = complaintObj.evidence.map((file: any) => {
        let url = file.secureUrl as string;
        if (url && url.endsWith('.pdf')) {
          if (url.includes('/image/upload/')) {
            url = url.replace('/image/upload/', '/raw/upload/fl_attachment/');
          } else if (url.includes('/raw/upload/') && !url.includes('fl_attachment')) {
            url = url.replace('/raw/upload/', '/raw/upload/fl_attachment/');
          }
          return { ...file, secureUrl: url };
        }
        return file;
      });

      // Enrich embedded evidence[] with AI metadata from the separate evidences collection.
      // The Python complaint-intelligence service writes processingStatus + aiMetadata
      // to the evidences collection keyed by evidence_id (= Cloudinary publicId path).
      try {
        const publicIds: string[] = complaintObj.evidence
          .map((f: any) => f.publicId)
          .filter(Boolean);

        if (publicIds.length > 0) {
          // evidence_id in the evidences collection matches the Cloudinary publicId
          const evidenceDocs = await Evidence.find(
            { evidence_id: { $in: publicIds } },
            { evidence_id: 1, processingStatus: 1 }
          ).lean();

          const evidenceMap = new Map(
            evidenceDocs.map((e: any) => [e.evidence_id, e])
          );

          complaintObj.evidence = complaintObj.evidence.map((file: any) => {
            const enriched = evidenceMap.get(file.publicId);
            if (!enriched) return file;
            return {
              ...file,
              processingStatus: enriched.processingStatus ?? file.processingStatus,
            };
          });
        }
      } catch (enrichErr) {
        // Non-blocking — serve complaint even if enrichment fails
        logger.warn('[ComplaintService] Failed to enrich evidence with AI metadata', { error: (enrichErr as Error).message });
      }
    }

    return complaintObj as IComplaint;
  }

  // ─── Get Station Complaints (SHO/IO Queue) ──────────────────────────────────
  async getStationComplaints(
    officerId: string,
    filters: any
  ): Promise<{ complaints: IComplaint[]; total: number }> {
    const officer = await Officer.findById(officerId);
    if (!officer) {
      throw new AuthorizationError('Police officer profile not found.');
    }

    const query: any = {
      policeStation: String(officer.policeStation),
      isDeleted: false,
    };

    if (officer.role === 'IO') {
      query.assignedIO = new Types.ObjectId(officerId);
    }

    return this.complaintRepository.findStationComplaints(query, filters);
  }

  // ─── Approve Complaint (SHO Only) ──────────────────────────────────────────
  async approveComplaint(id: string, officerId: string, ioId: string, ip: string): Promise<IComplaint> {
    const officer = await Officer.findById(officerId);
    if (!officer || officer.role !== 'SHO') {
      throw new AuthorizationError('Only the Station House Officer (SHO) can approve complaints.');
    }

    const complaint = await this.complaintRepository.findById(id);
    if (!complaint) {
      throw new NotFoundError('Complaint');
    }

    if (
      complaint.status !== ComplaintStatus.SUBMITTED &&
      complaint.status !== ComplaintStatus.UNDER_REVIEW &&
      complaint.status !== ComplaintStatus.FIR_REGISTERED
    ) {
      throw new ValidationError(`Complaint is currently in ${complaint.status} status and cannot be approved.`);
    }

    // Verify IO belongs to the same station
    const assignedIO = await Officer.findById(ioId);
    if (!assignedIO || assignedIO.role !== 'IO' || String(assignedIO.policeStation) !== String(officer.policeStation)) {
      throw new ValidationError('Invalid Investigation Officer selected for this station.');
    }

    const oldStatus = complaint.status;
    const newStatus = complaint.status === ComplaintStatus.FIR_REGISTERED ? ComplaintStatus.FIR_REGISTERED : ComplaintStatus.ASSIGNED_TO_IO;

    if (complaint.status !== ComplaintStatus.FIR_REGISTERED) {
      complaint.status = ComplaintStatus.ASSIGNED_TO_IO;
    }
    complaint.assignedSHO = new Types.ObjectId(officerId);
    complaint.assignedIO = new Types.ObjectId(ioId);
    complaint.approvedAt = new Date();
    complaint.assignedAt = new Date();

    complaint.timeline.push({
      user: `SHO (${officer.officerName})`,
      timestamp: new Date(),
      description: `Complaint assigned to IO ${assignedIO.officerName}.`,
    });

    complaint.auditLogs.push({
      actor: officerId,
      ip,
      timestamp: new Date(),
      oldValue: oldStatus,
      newValue: newStatus,
      action: 'COMPLAINT_APPROVAL',
    });

    const saved = await this.complaintRepository.save(complaint);
    logger.info('SHO assigned complaint to IO', { complaintId: saved._id, shoId: officerId, ioId: ioId });
    
    // Automatically trigger initial AI analysis in the background
    InvestigationOrchestrator.runAnalysis(saved._id.toString()).catch(err => {
      logger.error('Failed to trigger initial AI analysis during assignment:', err);
    });

    return saved;
  }

  // ─── Reject Complaint (SHO Only) ───────────────────────────────────────────
  async rejectComplaint(id: string, officerId: string, rejectionReason: string, ip: string): Promise<IComplaint> {
    const officer = await Officer.findById(officerId);
    if (!officer || officer.role !== 'SHO') {
      throw new AuthorizationError('Only the Station House Officer (SHO) can reject complaints.');
    }

    const complaint = await this.complaintRepository.findById(id);
    if (!complaint) {
      throw new NotFoundError('Complaint');
    }

    this.checkLock(complaint);

    if (complaint.status !== ComplaintStatus.SUBMITTED && complaint.status !== ComplaintStatus.UNDER_REVIEW) {
      throw new ValidationError('Complaint cannot be rejected in its current status.');
    }

    const oldStatus = complaint.status;
    complaint.status = ComplaintStatus.REJECTED;
    complaint.rejectionReason = rejectionReason;
    complaint.rejectedAt = new Date();

    complaint.timeline.push({
      user: `SHO (${officer.officerName})`,
      timestamp: new Date(),
      description: `Complaint rejected. Reason: ${rejectionReason}`,
    });

    complaint.auditLogs.push({
      actor: officerId,
      ip,
      timestamp: new Date(),
      oldValue: oldStatus,
      newValue: ComplaintStatus.REJECTED,
      action: 'COMPLAINT_REJECTION',
    });

    const saved = await this.complaintRepository.save(complaint);

    // Enqueue rejection email job via BullMQ
    const citizenUser = await User.findById(complaint.citizen);
    if (citizenUser) {
      await EmailQueue.enqueueComplaintRejectionEmail({
        to: citizenUser.email,
        name: `${citizenUser.firstName} ${citizenUser.lastName}`.trim(),
        complaintNumber: complaint.complaintNumber,
        rejectionReason,
      });
    }

    return saved;
  }

  // ─── Update Complaint Details (IO Only) ────────────────────────────────────
  async updateComplaint(id: string, officerId: string, updateData: any, ip: string): Promise<IComplaint> {
    const officer = await Officer.findById(officerId);
    if (!officer || officer.role !== 'IO') {
      throw new AuthorizationError('Only the assigned Investigation Officer (IO) can edit complaint details.');
    }

    const complaint = await this.complaintRepository.findById(id);
    if (!complaint) {
      throw new NotFoundError('Complaint');
    }

    this.checkLock(complaint);

    if (String(complaint.assignedIO?._id) !== officerId) {
      throw new AuthorizationError('You are not the assigned Investigation Officer for this complaint.');
    }

    const { detailedDescription, crimeSummary, legalSections, investigationNotes } = updateData;

    let hasEdits = false;
    const nextVersion = complaint.currentVersionNumber + 1;

    // Append to description history if edited
    if (detailedDescription && detailedDescription !== complaint.detailedDescription) {
      complaint.detailedDescription = detailedDescription;
      complaint.descriptionHistory.push({
        version: nextVersion,
        editedBy: 'IO',
        editorId: new Types.ObjectId(officerId),
        content: detailedDescription,
        timestamp: new Date(),
      });
      hasEdits = true;
    }

    // Append to crime summary history if edited
    if (crimeSummary) {
      const lastSummary = complaint.crimeSummaryHistory[complaint.crimeSummaryHistory.length - 1]?.content;
      if (crimeSummary !== lastSummary) {
        complaint.crimeSummaryHistory.push({
          version: nextVersion,
          editedBy: 'IO',
          editorId: new Types.ObjectId(officerId),
          content: crimeSummary,
          timestamp: new Date(),
        });
        hasEdits = true;
      }
    }

    // Append to legal sections history if edited
    if (legalSections) {
      const lastSections = complaint.legalSectionsHistory[complaint.legalSectionsHistory.length - 1]?.content;
      if (legalSections !== lastSections) {
        complaint.legalSectionsHistory.push({
          version: nextVersion,
          editedBy: 'IO',
          editorId: new Types.ObjectId(officerId),
          content: legalSections,
          timestamp: new Date(),
        });
        hasEdits = true;
      }
    }

    // Append to investigation notes history if edited
    if (investigationNotes) {
      const lastNotes = complaint.investigationNotesHistory[complaint.investigationNotesHistory.length - 1]?.content;
      if (investigationNotes !== lastNotes) {
        complaint.investigationNotesHistory.push({
          version: nextVersion,
          editedBy: 'IO',
          editorId: new Types.ObjectId(officerId),
          content: investigationNotes,
          timestamp: new Date(),
        });
        hasEdits = true;
      }
    }

    if (hasEdits) {
      complaint.currentVersionNumber = nextVersion;
      complaint.timeline.push({
        user: `IO (${officer.officerName})`,
        timestamp: new Date(),
        description: `Complaint details updated (Version ${nextVersion}).`,
      });

      complaint.auditLogs.push({
        actor: officerId,
        ip,
        timestamp: new Date(),
        newValue: `Version ${nextVersion} saved`,
        action: 'COMPLAINT_UPDATE',
      });

      return this.complaintRepository.save(complaint);
    }

    return complaint;
  }

  // ─── Register FIR (SHO Only) ────────────────────────────────────────────────
  async registerFir(id: string, officerId: string, ip: string): Promise<IComplaint> {
    const officer = await Officer.findById(officerId);
    if (!officer || officer.role !== 'SHO') {
      throw new AuthorizationError('Only the Station House Officer (SHO) can register the FIR.');
    }

    const complaint = await this.complaintRepository.findById(id);
    if (!complaint) {
      throw new NotFoundError('Complaint');
    }

    this.checkLock(complaint);

    if (complaint.status === ComplaintStatus.FIR_REGISTERED) {
      throw new ValidationError('FIR has already been registered for this complaint.');
    }

    if (complaint.status === ComplaintStatus.CLOSED || complaint.status === ComplaintStatus.REJECTED) {
      throw new ValidationError('FIR cannot be registered for a closed or rejected complaint.');
    }

    // Generate realistic FIR number: GJ-{StationCode}-{CurrentYear}-{4-digit-seq}
    const station = await PoliceStation.findById(complaint.policeStation);
    if (!station) {
      throw new NotFoundError('Police Station associated with this complaint was not found.');
    }

    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);

    /**
     * Race-condition-safe FIR number generation.
     *
     * The naive countDocuments+1 approach allows two concurrent requests to read
     * the same count and generate an identical FIR number, causing an E11000
     * duplicate key error on the unique `firNumber` index.
     *
     * Strategy: optimistic retry loop.
     *  1. Count ALL FIR numbers ever issued for this station+year (across all
     *     statuses), not just FIR_REGISTERED ones — this gives a high-water mark
     *     that never decreases, so a retried candidate is always strictly higher.
     *  2. Attempt to save. If MongoDB returns E11000 (concurrent write beat us),
     *     increment the candidate by 1 and retry up to MAX_RETRIES times.
     *  3. Any other error is re-thrown immediately.
     */
    const MAX_RETRIES = 5;
    let saved: IComplaint | null = null;
    let firNumber = '';

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Re-count on every attempt so we always pick up new rows written by
      // concurrent requests that succeeded while we were retrying.
      const issuedCount = await Complaint.countDocuments({
        policeStation: complaint.policeStation,
        firNumber: { $exists: true, $ne: null },
        firRegisteredAt: { $gte: startOfYear },
      });

      const seq = issuedCount + 1 + attempt; // advance on each retry
      firNumber = `GJ-${station.code}-${currentYear}-${String(seq).padStart(4, '0')}`;

      complaint.status = ComplaintStatus.FIR_REGISTERED;
      complaint.firNumber = firNumber;
      complaint.firRegisteredAt = new Date();
      complaint.firRegisteredBy = new Types.ObjectId(officerId);

      // Rebuild timeline/audit only on first attempt to avoid duplicate entries
      if (attempt === 0) {
        complaint.timeline.push({
          user: `IO (${officer.officerName})`,
          timestamp: new Date(),
          description: `FIR officially registered. Complaint is now immutable.`,
        });

        complaint.auditLogs.push({
          actor: officerId,
          ip,
          timestamp: new Date(),
          oldValue: ComplaintStatus.ASSIGNED_TO_IO,
          newValue: ComplaintStatus.FIR_REGISTERED,
          action: 'FIR_REGISTRATION',
        });
      }

      try {
        saved = await this.complaintRepository.save(complaint);
        // Update timeline description with the confirmed FIR number now that save succeeded
        saved.timeline[saved.timeline.length - 1].description =
          `FIR officially registered (FIR Number: ${firNumber}). Complaint is now immutable.`;
        await saved.save();
        logger.info('FIR number assigned', { complaintId: saved._id, firNumber, attempt });
        break; // success — exit retry loop
      } catch (err: any) {
        const isDuplicateKey =
          err?.code === 11000 ||
          (err?.errorResponse?.code === 11000) ||
          err?.message?.includes('E11000');

        if (!isDuplicateKey) {
          throw err; // not a uniqueness conflict — propagate immediately
        }

        logger.warn('FIR number collision, retrying', { firNumber, attempt, complaintId: id });

        if (attempt === MAX_RETRIES - 1) {
          throw new ConflictError(
            'Could not generate a unique FIR number after several attempts. Please try again.',
          );
        }
      }
    }

    if (!saved) {
      throw new ConflictError('Failed to register FIR. Please try again.');
    }

    // Enqueue PDF generation job via BullMQ
    await FirQueue.enqueueGenerateFirPdf(String(saved._id));

    return saved;
  }

  // ─── Get Investigation Officers for Station (SHO Flow) ──────────────────────
  async getStationIOs(officerId: string, complaintId?: string): Promise<any[]> {
    const officer = await Officer.findById(officerId);
    if (!officer) {
      throw new AuthorizationError('Officer not found.');
    }

    logger.info('Fetching station IOs', {
      officerId,
      policeStation: officer.policeStation?.toString(),
    });

    const ios = await Officer.find({
      policeStation: officer.policeStation,
      role: 'IO',
      isActive: true,
    }).select('officerName badgeNumber email phone').lean().exec();

    logger.info('Station IO query completed', {
      officerId,
      policeStation: officer.policeStation?.toString(),
      resultCount: ios.length,
      complaintId,
    });

    if (complaintId && ios.length > 0) {
      try {
        const complaint = await this.complaintRepository.findById(complaintId);
        if (complaint) {
          const availableOfficers = ios.map(io => ({
            officerId: io._id.toString(),
            officerName: io.officerName,
            badgeNumber: io.badgeNumber
          }));

          const latestCrimeSummary = complaint.crimeSummaryHistory?.slice(-1)[0]?.content || '';
          const latestLegalSections = complaint.legalSectionsHistory?.slice(-1)[0]?.content || '';
          const latestInvestigationNotes = complaint.investigationNotesHistory?.slice(-1)[0]?.content || '';

          const payload = {
            complaint: {
              complaintId: complaint._id.toString(),
              stationId: (complaint.policeStation as any)?._id?.toString() ?? complaint.policeStation.toString(),
              category: complaint.category || complaint.crimeCategory || '',
              subCategory: complaint.crimeCategory || '',
              shortDescription: complaint.shortDescription,
              detailedDescription: complaint.detailedDescription,
              incidentPlace: complaint.incidentPlace,
              incidentDate: complaint.incidentDate ? complaint.incidentDate.toISOString() : '',
              incidentTime: complaint.incidentTime || '',
              address: complaint.address || '',
              approximateDateText: complaint.approximateDateText || '',
              evidenceSummary: complaint.evidence?.map(e => e.originalFilename).join(', ') || '',
              complaintIntelligenceSummary: complaint.complaintIntelligence?.summary || '',
              crimeSummary: latestCrimeSummary,
              legalSections: latestLegalSections,
              investigationNotes: latestInvestigationNotes,
            },
            availableOfficers
          };

          const aiUrl = `${env.IO_RECOMMENDATION_URL}/recommend-officers`;
          logger.info('Calling AI Service for IO recommendations', { aiUrl, complaintId });
          const aiResponse = await axios.post(aiUrl, payload);
          const recommendations = aiResponse.data.recommendations || [];

          const recMap = new Map(recommendations.map((r: any) => [r.officerId, r]));

          return ios.map(io => {
            const rec = recMap.get(io._id.toString()) as any;
            return {
              ...io,
              aiRecommendation: rec ? {
                score: rec.score,
                matchedCases: rec.matchedCases,
                averageSimilarity: rec.averageSimilarity,
                reasons: rec.reasons
              } : null
            };
          }).sort((a: any, b: any) => {
            const scoreA = a.aiRecommendation?.score ?? -1;
            const scoreB = b.aiRecommendation?.score ?? -1;
            return scoreB - scoreA;
          });
        }
      } catch (err: any) {
        logger.error('Failed to get AI recommendation for officers', { error: err.message });
      }
    }

    return ios;
  }

  // ─── Add Evidence to Existing Complaint (Citizen Flow) ──────────────────────
  async addEvidence(id: string, citizenId: string, evidenceData: any[], ip: string): Promise<IComplaint> {
    const complaint = await this.complaintRepository.findById(id);
    if (!complaint) {
      throw new NotFoundError('Complaint');
    }

    if (String(complaint.citizen._id) !== citizenId) {
      throw new AuthorizationError('You do not have permission to modify this complaint.');
    }

    this.checkLock(complaint);

    const validatedEvidence: IEvidenceMetadata[] = evidenceData.map((file: any) => ({
      publicId: file.publicId,
      secureUrl: file.secureUrl,
      resourceType: file.resourceType,
      mimeType: file.mimeType,
      originalFilename: file.originalFilename || 'unnamed_file',
      extension: file.extension || 'bin',
      size: file.size || 0,
      uploadedBy: new Types.ObjectId(citizenId),
      uploadedAt: new Date(),
      processingStatus: 'PENDING',
    }));

    complaint.evidence.push(...validatedEvidence);

    complaint.timeline.push({
      user: 'Citizen',
      timestamp: new Date(),
      description: `Attached ${validatedEvidence.length} new evidence file(s).`,
    });

    complaint.auditLogs.push({
      actor: citizenId,
      ip,
      timestamp: new Date(),
      newValue: `Added ${validatedEvidence.length} evidence file(s)`,
      action: 'ADD_EVIDENCE',
    });

    return this.complaintRepository.save(complaint);
  }

  // ─── Close Complaint / Case (IO / SHO Flow) ─────────────────────────────────
  async closeComplaint(id: string, officerId: string, ip: string): Promise<IComplaint> {
    const officer = await Officer.findById(officerId);
    if (!officer || (officer.role !== 'IO' && officer.role !== 'SHO')) {
      throw new AuthorizationError('Only the assigned IO or SHO can close this case.');
    }

    const complaint = await this.complaintRepository.findById(id);
    if (!complaint) {
      throw new NotFoundError('Complaint');
    }

    if (complaint.status === ComplaintStatus.CLOSED) {
      return complaint; // already closed, idempotent
    }

    if (complaint.status !== ComplaintStatus.FIR_REGISTERED) {
      throw new ValidationError('A case can only be closed after an FIR has been registered.');
    }

    const oldStatus = complaint.status;
    complaint.status = ComplaintStatus.CLOSED;

    complaint.timeline.push({
      user: `${officer.role} (${officer.officerName})`,
      timestamp: new Date(),
      description: `Case closed and finalized. Sending to AI vector store for indexing.`,
    });

    complaint.auditLogs.push({
      actor: officerId,
      ip,
      timestamp: new Date(),
      oldValue: oldStatus,
      newValue: ComplaintStatus.CLOSED,
      action: 'CASE_CLOSURE',
    });

    // ── Accused check ─────────────────────────────────────────────
    const accusedCount = await CaseParticipant.countDocuments({
      case_id: complaint._id,
      roles: 'Accused',
    });
    if (accusedCount === 0) {
      throw new ValidationError(
        'NO_ACCUSED: At least one suspect must be promoted to Accused before closing the investigation.',
      );
    }

    // ── ChargeSheet Generation ─────────────────────────────────
    try {
      await ChargeSheetGenerator.generateForCase(id, officerId);
    } catch (err: any) {
      logger.error('Failed to generate ChargeSheet', { error: err.message, caseId: id });
      throw new Error(`ChargeSheet generation failed: ${err.message}. Case closure aborted.`);
    }

    const saved = await this.complaintRepository.save(complaint);
    logger.info('Case closed by officer', { officerId, complaintId: saved._id, complaintNumber: saved.complaintNumber });

    // Fetch station details for metadata (district)
    const station = await PoliceStation.findById(saved.policeStation);

    // Prepare Qdrant embedding payload
    const lastSummary = saved.crimeSummaryHistory?.[saved.crimeSummaryHistory.length - 1]?.content;
    const lastNotes = saved.investigationNotesHistory?.[saved.investigationNotesHistory.length - 1]?.content;
    const lastSections = saved.legalSectionsHistory?.[saved.legalSectionsHistory.length - 1]?.content;

    const sectionsList = lastSections
      ? lastSections.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];

    const payload = {
      firId: saved._id.toString(),
      complaintId: saved._id.toString(),
      // Extract ._id explicitly — these fields are populated objects after findById(),
      // so .toString() on the whole object would serialize the full document instead of just the ID.
      officerId: (saved.assignedIO as any)?._id?.toString() || (saved.assignedIO as any)?.toString() || officerId,
      stationId: (saved.policeStation as any)?._id?.toString() || (saved.policeStation as any)?.toString(),
      district: station?.district || 'Unknown District',
      firNumber: saved.firNumber || 'N/A',
      status: 'CLOSED',
      closedDate: new Date().toISOString(),
      createdAt: saved.createdAt.toISOString(),
      crimeCategory: saved.category,
      crimeSubCategory: saved.crimeCategory || '',
      incidentSummary: saved.shortDescription,
      modusOperandi: lastSummary || saved.shortDescription,
      evidenceSummary: saved.evidence?.map((e: any) => `${e.originalFilename} (${e.mimeType})`).join(', ') || 'None',
      investigationSummary: lastNotes || saved.detailedDescription,
      sections: sectionsList,
      location: saved.incidentPlace,
    };

    // Fire-and-forget or async call to FastAPI recommendation service
    try {
      const aiUrl = `${env.IO_RECOMMENDATION_URL}/embed-case`;
      logger.info('Sending closed FIR payload to AI service', { aiUrl, firId: payload.firId });
      axios.post(aiUrl, payload).catch((err) => {
        logger.error('Background AI embedding request failed', { error: err.message });
      });
    } catch (err: any) {
      logger.error('Failed to trigger AI embedding', { error: err.message });
    }

    return saved;
  }

  // ─── Transfer Evidence (Physical) ─────────────────────────────────────────────
  async transferEvidence(id: string, evidenceId: string, officerId: string, targetStationEmail: string, manualStationName: string, ioChecklistStepId: string, _ip: string): Promise<any> {
    const complaint = await this.complaintRepository.findById(id);
    if (!complaint) throw new NotFoundError('Complaint');
    
    const { DepartmentRequest } = require('../investigation/models/DepartmentRequest.model');
    const { v4: uuidv4 } = require('uuid');

    // Find the specific evidence to get its details
    const evidence = complaint.evidence.find(e => (e as any)._id?.toString() === evidenceId || e.publicId === evidenceId);
    if (!evidence) {
      throw new NotFoundError('Evidence');
    }

    const physicalDetails = evidence.physicalDetails || { name: 'N/A', description: 'N/A', locationFound: 'N/A' };
    const draftContent = `Subject: Transfer of Physical Evidence for Case ${complaint.complaintNumber}

To,
${manualStationName || 'External Department'}

This is to formally request the transfer of physical evidence seized during the investigation of Case Number ${complaint.complaintNumber}.

Evidence Details:
- Name: ${physicalDetails.name}
- Description: ${physicalDetails.description}
- Found Location: ${physicalDetails.locationFound}

Please acknowledge the receipt of this evidence and update the chain of custody accordingly.

Sincerely,
Investigating Officer
Gujarat Police`;

    const newRequest = new DepartmentRequest({
      case_id: complaint._id,
      request_id: uuidv4(),
      step_id: ioChecklistStepId || 'manual_transfer',
      request_type: 'inter_station_assignment',
      recipient_type: 'External Department',
      department_entity_id: manualStationName || 'External Station',
      draft_content: draftContent,
      attachments: [evidence.publicId],
      status: 'draft'
    });

    await newRequest.save();

    const { EmailQueue } = require('../../shared/queue/EmailQueue');
    const { DiaryEntry } = require('../investigation/models/DiaryEntry.model');

    newRequest.status = 'sent';
    newRequest.sent_via = 'email';
    newRequest.sent_at = new Date();
    await newRequest.save();

    await DiaryEntry.create({
      case_id: complaint._id,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: officerId },
      event_type: 'request_sent',
      payload: { 
        request_id: newRequest.request_id, 
        department_entity_id: newRequest.department_entity_id,
        content: newRequest.draft_content,
        targetEmail: targetStationEmail
      },
      ref_ids: { request_id: newRequest.request_id }
    });

    await EmailQueue.enqueueDepartmentRequest({
      to:             targetStationEmail || 'itssiddh7@gmail.com', // fallback to hardcoded test dept
      departmentName: manualStationName || 'External Department',
      caseId:         id,
      requestId:      newRequest.request_id,
      content:        newRequest.draft_content,
    });

    return newRequest;
  }
}
