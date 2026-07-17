import { IJwtPayload } from '../interfaces/IJwtPayload';

declare global {
  namespace Express {
    interface Request {
      user?: IJwtPayload;
      requestId?: string;
    }
  }
}
