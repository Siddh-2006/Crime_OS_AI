import { Request, Response, NextFunction } from 'express';
import { physicalEvidenceService } from '../services/PhysicalEvidenceService';
import { sendSuccess } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';

export class PhysicalEvidenceController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: caseId } = req.params;
      const officer = (req as any).user || {
        sub: 'OFFICER-001',
        name: 'Insp. V. Sharma',
        badge: 'GJ-4029',
        station: 'PS-CENTRAL-01',
      };

      const result = await physicalEvidenceService.createPhysicalEvidence({
        ...req.body,
        case_id: caseId,
        seizedByOfficer: {
          id: officer.sub || 'OFFICER-001',
          name: officer.name || 'Insp. V. Sharma',
          badge: officer.badge || 'GJ-4029',
          station: officer.station || 'PS-CENTRAL-01',
        },
      });

      sendSuccess(res, HttpStatusCode.CREATED, 'Physical Evidence logged successfully', result);
    } catch (err) {
      next(err);
    }
  }

  async getByCase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: caseId } = req.params;
      const items = await physicalEvidenceService.getByCaseId(caseId);
      sendSuccess(res, HttpStatusCode.OK, 'Physical evidence retrieved', items);
    } catch (err) {
      next(err);
    }
  }

  async getByTag(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tagId } = req.params;
      const item = await physicalEvidenceService.getByTagId(tagId);
      sendSuccess(res, HttpStatusCode.OK, 'Physical Evidence details retrieved', item);
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const item = await physicalEvidenceService.getById(id);
      sendSuccess(res, HttpStatusCode.OK, 'Physical Evidence details retrieved', item);
    } catch (err) {
      next(err);
    }
  }

  async initiateDispatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const officer = (req as any).user || {
        sub: 'OFFICER-001',
        name: 'Insp. V. Sharma',
        badge: 'GJ-4029',
        station: 'PS-CENTRAL-01',
      };

      const fromOfficer = {
        id: officer.sub || 'OFFICER-001',
        name: officer.name || 'Insp. V. Sharma',
        badge: officer.badge || 'GJ-4029',
        station: officer.station || 'PS-CENTRAL-01',
      };

      const updated = await physicalEvidenceService.initiateDispatch(id, req.body, fromOfficer);
      sendSuccess(res, HttpStatusCode.OK, 'Evidence dispatch initiated successfully', updated);
    } catch (err) {
      next(err);
    }
  }

  async acknowledgeReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const officer = (req as any).user || {
        sub: 'FSL-EXPERT-009',
        name: 'Dr. A. Mehta (FSL Scientist)',
        badge: 'DFS-104',
        station: 'State FSL Gandhinagar',
      };

      const currentOfficer = {
        id: officer.sub || 'FSL-EXPERT-009',
        name: officer.name || 'Dr. A. Mehta',
        badge: officer.badge || 'DFS-104',
        station: officer.station || 'State FSL Gandhinagar',
      };

      const updated = await physicalEvidenceService.acknowledgeReceipt(
        id,
        {
          ...req.body,
          receivedByOfficer: req.body.receivedByOfficer || currentOfficer,
        },
        currentOfficer
      );

      sendSuccess(res, HttpStatusCode.OK, 'Evidence receipt acknowledged successfully', updated);
    } catch (err) {
      next(err);
    }
  }

  async verifyIntegrity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const verification = await physicalEvidenceService.verifyIntegrity(id);
      sendSuccess(res, HttpStatusCode.OK, 'Chain of Custody hash verification completed', verification);
    } catch (err) {
      next(err);
    }
  }
}

export const physicalEvidenceController = new PhysicalEvidenceController();
