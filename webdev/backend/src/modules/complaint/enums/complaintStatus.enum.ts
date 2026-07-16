/**
 * Complaint status lifecycle.
 * Follows real Indian police workflow.
 *
 * SUBMITTED → (SHO) → UNDER_REVIEW → ASSIGNED_TO_IO → (IO) → FIR_REGISTERED
 *                                  ↘ REJECTED
 */
export enum ComplaintStatus {
  SUBMITTED      = 'SUBMITTED',
  UNDER_REVIEW   = 'UNDER_REVIEW',
  ASSIGNED_TO_IO = 'ASSIGNED_TO_IO',
  REJECTED       = 'REJECTED',
  FIR_REGISTERED = 'FIR_REGISTERED',
  CLOSED         = 'CLOSED',
}
