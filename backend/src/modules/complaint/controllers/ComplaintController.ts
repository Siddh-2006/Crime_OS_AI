import { Request, Response, NextFunction } from 'express';
import { Blob } from 'buffer';
import { ComplaintService } from '../services/ComplaintService';
import { sendSuccess } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import env from '../../../config/env';
import logger from '../../../config/logger';

export class ComplaintController {
  constructor(private readonly complaintService: ComplaintService) {}

  getUploadSignature = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const citizenId = req.user!.sub;
      const caseId = req.query.caseId as string | undefined;
      const signatureData = await this.complaintService.getUploadSignature(citizenId, caseId);
      sendSuccess(res, HttpStatusCode.OK, 'Upload signature generated successfully', signatureData);
    } catch (err) {
      next(err);
    }
  };

  analyzeComplaintIntake = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const text = String(req.body?.text ?? '');
      const context = typeof req.body?.context === 'string' ? req.body.context : '';
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];

      const formData = new FormData();
      formData.append('text', text);
      if (context) {
        formData.append('context', context);
      }

      for (const file of files) {
        const blob = new Blob([file.buffer], { type: file.mimetype || 'application/octet-stream' });
        formData.append('files', blob, file.originalname || 'upload.bin');
      }

      const response = await fetch(`${env.COMPLAINT_INTELLIGENCE_URL}/profile-complaint-multimodal`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Complaint intake analysis failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      sendSuccess(res, HttpStatusCode.OK, 'Complaint intake analysed successfully', data);
    } catch (err) {
      next(err);
    }
  };

  searchPoliceStations = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = String(req.query.q ?? '');
      logger.info('[ComplaintController] GET /police-stations/search', {
        query,
        hasQuery: query.trim().length > 0,
      });
      const stations = await this.complaintService.searchPoliceStations(query);
      logger.info('[ComplaintController] Police stations response prepared', {
        count: stations.length,
      });
      sendSuccess(res, HttpStatusCode.OK, 'Police stations retrieved successfully', stations);
    } catch (err) {
      logger.error('[ComplaintController] Failed to fetch police stations', { error: err });
      next(err);
    }
  };

  createComplaint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actorId = req.user!.sub;
      const ip = req.ip ?? 'unknown';
      const complaint = await this.complaintService.createComplaint(actorId, req.body, ip);
      sendSuccess(res, HttpStatusCode.CREATED, 'Complaint filed successfully', complaint);
    } catch (err) {
      next(err);
    }
  };

  getCitizenComplaints = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const citizenId = req.user!.sub;
      const complaints = await this.complaintService.getCitizenComplaints(citizenId);
      sendSuccess(res, HttpStatusCode.OK, 'Citizen complaints retrieved successfully', complaints);
    } catch (err) {
      next(err);
    }
  };

  getComplaintById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const user = req.user!;
      const complaint = await this.complaintService.getComplaintById(id, { sub: user.sub, role: user.role });
      sendSuccess(res, HttpStatusCode.OK, 'Complaint retrieved successfully', complaint);
    } catch (err) {
      next(err);
    }
  };

  getStationComplaints = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const officerId = req.user!.sub;
      const filters = {
        status: req.query.status ? String(req.query.status) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 10,
      };

      const result = await this.complaintService.getStationComplaints(officerId, filters);
      sendSuccess(res, HttpStatusCode.OK, 'Station complaints retrieved successfully', result);
    } catch (err) {
      next(err);
    }
  };

  approveComplaint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const officerId = req.user!.sub;
      const { assignedIO } = req.body;
      const ip = req.ip ?? 'unknown';

      const complaint = await this.complaintService.approveComplaint(id, officerId, assignedIO, ip);
      sendSuccess(res, HttpStatusCode.OK, 'Complaint approved and assigned to IO successfully', complaint);
    } catch (err) {
      next(err);
    }
  };

  rejectComplaint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const officerId = req.user!.sub;
      const { rejectionReason } = req.body;
      const ip = req.ip ?? 'unknown';

      const complaint = await this.complaintService.rejectComplaint(id, officerId, rejectionReason, ip);
      sendSuccess(res, HttpStatusCode.OK, 'Complaint rejected successfully', complaint);
    } catch (err) {
      next(err);
    }
  };

  updateComplaint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const officerId = req.user!.sub;
      const ip = req.ip ?? 'unknown';

      const complaint = await this.complaintService.updateComplaint(id, officerId, req.body, ip);
      sendSuccess(res, HttpStatusCode.OK, 'Complaint updated successfully', complaint);
    } catch (err) {
      next(err);
    }
  };

  registerFir = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const officerId = req.user!.sub;
      const ip = req.ip ?? 'unknown';

      const complaint = await this.complaintService.registerFir(id, officerId, ip);
      sendSuccess(res, HttpStatusCode.OK, 'FIR registered successfully', complaint);
    } catch (err) {
      next(err);
    }
  };

  getStationIOs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const officerId = req.user!.sub;
      const complaintId = req.query.complaintId ? String(req.query.complaintId) : undefined;
      logger.info('[ComplaintController] GET /police/ios', {
        officerId,
        complaintId,
      });
      const ios = await this.complaintService.getStationIOs(officerId, complaintId);
      sendSuccess(res, HttpStatusCode.OK, 'Investigation Officers retrieved successfully', ios);
    } catch (err) {
      next(err);
    }
  };

  addEvidence = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const citizenId = req.user!.sub;
      const { evidence } = req.body;
      const ip = req.ip ?? 'unknown';

      const complaint = await this.complaintService.addEvidence(id, citizenId, evidence, ip);
      sendSuccess(res, HttpStatusCode.OK, 'Evidence added successfully', complaint);
    } catch (err) {
      next(err);
    }
  };

  addPhysicalEvidence = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const uploaderId = req.user!.sub; // IO or Citizen
      const { evidence } = req.body; // should contain isPhysical, physicalDetails
      const ip = req.ip ?? 'unknown';

      // We can use the existing addEvidence service since it accepts evidence objects.
      const complaint = await this.complaintService.addEvidence(id, uploaderId, evidence, ip);
      sendSuccess(res, HttpStatusCode.OK, 'Physical Evidence added successfully', complaint);
    } catch (err) {
      next(err);
    }
  };

  transferEvidence = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, evidenceId } = req.params;
      const { targetStationEmail, manualStationName, ioChecklistStepId } = req.body;
      const officerId = req.user!.sub;
      const ip = req.ip ?? 'unknown';

      // Transfer logic handled in service
      await this.complaintService.transferEvidence(id, evidenceId, officerId, targetStationEmail, manualStationName, ioChecklistStepId, ip);
      sendSuccess(res, HttpStatusCode.OK, 'Evidence transfer request dispatched', null);
    } catch (err) {
      next(err);
    }
  };

  closeComplaint = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const officerId = req.user!.sub;
      const ip = req.ip ?? 'unknown';

      const complaint = await this.complaintService.closeComplaint(id, officerId, ip);
      sendSuccess(res, HttpStatusCode.OK, 'Complaint/Case closed successfully', complaint);
    } catch (err) {
      next(err);
    }
  };

  rerunPipeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const complaint = await this.complaintService.rerunComplaintIntelligencePipeline(id);
      sendSuccess(res, HttpStatusCode.OK, 'Complaint Intelligence pipeline re-triggered successfully', complaint);
    } catch (err) {
      next(err);
    }
  };
}
