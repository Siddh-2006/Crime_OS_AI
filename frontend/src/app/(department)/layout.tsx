/**
 * Department portal layout — DISABLED.
 * The email-based flow (GmailPollWorker) has replaced the department portal.
 * All routes under /(department)/ are blocked here by redirecting to 404.
 * The page files are preserved for reference.
 */
import { notFound } from 'next/navigation';

export default function DepartmentPortalLayout() {
  // Unconditionally return 404 for every route under this group.
  notFound();
}
