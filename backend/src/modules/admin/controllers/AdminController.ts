import axios from 'axios';
import FormData from 'form-data';
import { Request, Response, NextFunction } from 'express';
import { AdminAuthService } from '../services/AdminAuthService';
import { PoliceStation } from '../../police/models/PoliceStation.model';
import { Officer } from '../../police/models/Officer.model';
import { sendSuccess } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import { ConflictError } from '../../../common/errors/ConflictError';
import { NotFoundError } from '../../../common/errors/NotFoundError';
import { hashPassword } from '../../../shared/utils/hash.util';
import env from '../../../config/env';
import logger from '../../../config/logger';

const REFRESH_TOKEN_COOKIE = 'refreshToken';

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: env.JWT_REFRESH_EXPIRY_SECONDS * 1000,
  path: '/',
};
export class AdminController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { username, password } = req.body;
      const result = await this.adminAuthService.login(username, password);

      res.cookie(REFRESH_TOKEN_COOKIE, result.refreshToken, cookieOptions);
      sendSuccess(res, HttpStatusCode.OK, 'Admin logged in successfully', {
        accessToken: result.accessToken,
        admin: result.admin,
      });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.sub;
      await this.adminAuthService.logout(adminId);
      res.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/' });
      sendSuccess(res, HttpStatusCode.OK, 'Admin logged out successfully');
    } catch (err) {
      next(err);
    }
  };

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const adminId = req.user!.sub;
      const admin = await this.adminAuthService.getProfile(adminId);
      sendSuccess(res, HttpStatusCode.OK, 'Admin profile fetched successfully', admin);
    } catch (err) {
      next(err);
    }
  };

  // ─── Police Station CRUD ───────────────────────────────────────────────────

  createPoliceStation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code } = req.body;
      const existing = await PoliceStation.findOne({ code: code.toUpperCase() });
      if (existing) {
        throw new ConflictError('Police station with this code already exists');
      }

      const station = new PoliceStation(req.body);
      await station.save();

      logger.info('Police station created by admin', { stationId: station._id, code: station.code });

      sendSuccess(res, HttpStatusCode.CREATED, 'Police station created successfully', station);
    } catch (err) {
      next(err);
    }
  };

  listPoliceStations = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stations = await PoliceStation.find().sort({ createdAt: -1 });
      sendSuccess(res, HttpStatusCode.OK, 'Police stations retrieved successfully', stations);
    } catch (err) {
      next(err);
    }
  };

  getPoliceStation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const station = await PoliceStation.findById(id);
      if (!station) {
        throw new NotFoundError('Police Station');
      }
      sendSuccess(res, HttpStatusCode.OK, 'Police station retrieved successfully', station);
    } catch (err) {
      next(err);
    }
  };

  updatePoliceStation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { code } = req.body;

      const station = await PoliceStation.findById(id);
      if (!station) {
        throw new NotFoundError('Police Station');
      }

      if (code && code.toUpperCase() !== station.code) {
        const existing = await PoliceStation.findOne({ code: code.toUpperCase() });
        if (existing) {
          throw new ConflictError('Police station with this code already exists');
        }
      }

      Object.assign(station, req.body);
      await station.save();

      logger.info('Police station updated by admin', { stationId: station._id, code: station.code });

      sendSuccess(res, HttpStatusCode.OK, 'Police station updated successfully', station);
    } catch (err) {
      next(err);
    }
  };

  deletePoliceStation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const station = await PoliceStation.findById(id);
      if (!station) {
        throw new NotFoundError('Police Station');
      }

      // Check if any officers are assigned to this station
      const assignedOfficersCount = await Officer.countDocuments({ policeStation: id });
      if (assignedOfficersCount > 0) {
        throw new ConflictError('Cannot delete station: officers are still assigned to it');
      }

      await PoliceStation.findByIdAndDelete(id);
      sendSuccess(res, HttpStatusCode.OK, 'Police station deleted successfully');
    } catch (err) {
      next(err);
    }
  };

  // ─── Officer CRUD ──────────────────────────────────────────────────────────

  createOfficer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, badgeNumber, policeStation, password } = req.body;

      // Validate station existence
      const stationExists = await PoliceStation.exists({ _id: policeStation });
      if (!stationExists) {
        throw new NotFoundError('Police Station');
      }

      // Check duplicate email or badge
      const existingEmail = await Officer.findOne({ email: email.toLowerCase() });
      if (existingEmail) {
        throw new ConflictError('An officer with this email already exists');
      }

      const existingBadge = await Officer.findOne({ badgeNumber: badgeNumber.toUpperCase() });
      if (existingBadge) {
        throw new ConflictError('An officer with this badge number already exists');
      }

      const hashedPassword = await hashPassword(password);
      const officer = new Officer({
        ...req.body,
        password: hashedPassword,
      });
      await officer.save();

      logger.info('Police officer created by admin', { officerId: officer._id, badgeNumber: officer.badgeNumber });

      // Return sanitized officer details (excluding password)
      const officerObj = officer.toObject();
      delete (officerObj as any).password;

      sendSuccess(res, HttpStatusCode.CREATED, 'Officer created successfully', officerObj);
    } catch (err) {
      next(err);
    }
  };

  listOfficers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const officers = await Officer.find()
        .populate('policeStation', 'name code city district')
        .sort({ createdAt: -1 });
      sendSuccess(res, HttpStatusCode.OK, 'Officers retrieved successfully', officers);
    } catch (err) {
      next(err);
    }
  };

  getOfficer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const officer = await Officer.findById(id).populate('policeStation', 'name code city district');
      if (!officer) {
        throw new NotFoundError('Officer');
      }
      sendSuccess(res, HttpStatusCode.OK, 'Officer retrieved successfully', officer);
    } catch (err) {
      next(err);
    }
  };

  updateOfficer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { email, badgeNumber, policeStation, password } = req.body;

      const officer = await Officer.findById(id);
      if (!officer) {
        throw new NotFoundError('Officer');
      }

      if (policeStation) {
        const stationExists = await PoliceStation.exists({ _id: policeStation });
        if (!stationExists) {
          throw new NotFoundError('Police Station');
        }
      }

      if (email && email.toLowerCase() !== officer.email) {
        const existingEmail = await Officer.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
          throw new ConflictError('An officer with this email already exists');
        }
      }

      if (badgeNumber && badgeNumber.toUpperCase() !== officer.badgeNumber) {
        const existingBadge = await Officer.findOne({ badgeNumber: badgeNumber.toUpperCase() });
        if (existingBadge) {
          throw new ConflictError('An officer with this badge number already exists');
        }
      }

      const updateData = { ...req.body };
      if (password) {
        updateData.password = await hashPassword(password);
      }

      Object.assign(officer, updateData);
      await officer.save();

      logger.info('Police officer updated by admin', { officerId: officer._id, badgeNumber: officer.badgeNumber });

      const officerObj = officer.toObject();
      delete (officerObj as any).password;

      sendSuccess(res, HttpStatusCode.OK, 'Officer updated successfully', officerObj);
    } catch (err) {
      next(err);
    }
  };

  deleteOfficer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const officer = await Officer.findById(id);
      if (!officer) {
        throw new NotFoundError('Officer');
      }

      await Officer.findByIdAndDelete(id);
      logger.info('Police officer deleted by admin', { officerId: id });
      sendSuccess(res, HttpStatusCode.OK, 'Officer deleted successfully');
    } catch (err) {
      next(err);
    }
  };
  // RAG Ingestion Proxies
  ingestRag = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, message: 'PDF file is required' });
        return;
      }
      const { doc_type } = req.body;
      
      const form = new FormData();
      form.append('file', req.file.buffer, { filename: req.file.originalname });
      form.append('doc_type', doc_type || 'SOP');

      const response = await axios.post(`${env.LEGAL_AGENT_URL}/ingest`, form, {
        headers: { ...form.getHeaders() }
      });
      
      sendSuccess(res, HttpStatusCode.OK, 'Ingestion started', response.data);
    } catch (err: any) {
      if (err.response) {
        res.status(err.response.status).json(err.response.data);
      } else {
        next(err);
      }
    }
  };

  getRagStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { jobId } = req.params;
      const response = await axios.get(`${env.LEGAL_AGENT_URL}/ingest/status/${jobId}`);
      sendSuccess(res, HttpStatusCode.OK, 'Status retrieved', response.data);
    } catch (err: any) {
      if (err.response) {
        res.status(err.response.status).json(err.response.data);
      } else {
        next(err);
      }
    }
  };
}
