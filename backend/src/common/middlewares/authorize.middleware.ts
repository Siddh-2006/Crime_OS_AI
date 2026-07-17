import { Request, Response, NextFunction, RequestHandler } from 'express';
import { AuthorizationError } from '../errors/AuthorizationError';
import { Role } from '../../shared/enums/roles.enum';

/**
 * RBAC authorization middleware factory.
 * Must be used AFTER the authenticate middleware.
 * Checks that req.user.role is one of the allowed roles.
 *
 * @example
 * router.get('/police/me', authenticate, authorize(Role.SHO, Role.IO), ...)
 */
export function authorize(...allowedRoles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      return next(new AuthorizationError('No authenticated user found'));
    }

    if (!allowedRoles.includes(user.role as Role)) {
      return next(new AuthorizationError('You do not have permission to access this resource'));
    }

    next();
  };
}
