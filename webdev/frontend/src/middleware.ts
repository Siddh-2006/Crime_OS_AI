import { NextRequest, NextResponse } from 'next/server';
import { APP_ROUTES, ROLE } from '@/lib/constants';

/**
 * Next.js Edge Middleware for route-level RBAC.
 * Runs on every request matching the config.matcher pattern.
 *
 * Strategy:
 * - If no token in cookie → redirect to /login
 * - If police accessing citizen dashboard → redirect to police dashboard
 * - If citizen accessing police dashboard → redirect to citizen dashboard
 *
 * NOTE: Access token is not stored in a cookie by default (it's in localStorage).
 * We use the user role stored in a separate cookie set on login for edge-level checks.
 * The Axios interceptor handles API-level auth.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const roleCookie = req.cookies.get('role')?.value;

  const isProtectedCitizenRoute = pathname.startsWith('/dashboard');
  const isProtectedPoliceRoute = pathname.startsWith('/police/dashboard');
  const isProtectedAdminRoute = pathname.startsWith('/admin/dashboard');

  // Not a protected route — allow
  if (!isProtectedCitizenRoute && !isProtectedPoliceRoute && !isProtectedAdminRoute) {
    return NextResponse.next();
  }

  // No role cookie — redirect to login
  if (!roleCookie) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = isProtectedAdminRoute ? APP_ROUTES.ADMIN_LOGIN : APP_ROUTES.LOGIN;
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin trying to access citizen/police dashboard
  if ((isProtectedCitizenRoute || isProtectedPoliceRoute) && roleCookie === ROLE.ADMIN) {
    const adminUrl = req.nextUrl.clone();
    adminUrl.pathname = APP_ROUTES.ADMIN_DASHBOARD;
    return NextResponse.redirect(adminUrl);
  }

  // Non-admin trying to access admin dashboard
  if (isProtectedAdminRoute && roleCookie !== ROLE.ADMIN) {
    const adminLoginUrl = req.nextUrl.clone();
    adminLoginUrl.pathname = APP_ROUTES.ADMIN_LOGIN;
    return NextResponse.redirect(adminLoginUrl);
  }

  // Police trying to access citizen dashboard
  if (isProtectedCitizenRoute && (roleCookie === ROLE.SHO || roleCookie === ROLE.IO)) {
    const policeUrl = req.nextUrl.clone();
    policeUrl.pathname = APP_ROUTES.POLICE_DASHBOARD;
    return NextResponse.redirect(policeUrl);
  }

  // Citizen trying to access police dashboard
  if (isProtectedPoliceRoute && roleCookie === ROLE.USER) {
    const citizenUrl = req.nextUrl.clone();
    citizenUrl.pathname = APP_ROUTES.DASHBOARD;
    return NextResponse.redirect(citizenUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/police/dashboard/:path*', '/admin/dashboard/:path*'],
};
