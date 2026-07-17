import { Role } from '../enums/roles.enum';

/**
 * Shape of the JWT payload for both citizen and police tokens.
 * Keep this minimal — only IDs and role.
 */
export interface IJwtPayload {
  sub: string;      // user/officer MongoDB ObjectId
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}
