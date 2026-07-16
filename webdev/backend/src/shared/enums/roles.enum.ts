/**
 * Application role enum.
 * Used in JWT payloads, Mongoose models, and RBAC middleware.
 */
export enum Role {
  USER = 'USER',   // Citizen / Complainant
  SHO = 'SHO',    // Station House Officer
  IO = 'IO',      // Investigation Officer
  ADMIN = 'ADMIN', // Administrator
}
