import { NextResponse, type NextRequest } from 'next/server'

const AUTH_COOKIE_NAME = 'mongo_console_session'

// Public routes that unauthenticated users can access
const PUBLIC_PATHS = ['/login', '/register', '/api/auth/login', '/api/auth/register']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value

  // Static files and internal Next.js assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/apple-icon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path))

  // If user is already authenticated and visits login/register, redirect to /connections
  if (token && (pathname === '/login' || pathname === '/register')) {
    const url = request.nextUrl.clone()
    url.pathname = '/connections'
    return NextResponse.redirect(url)
  }

  // If user is not authenticated and tries to access protected pages
  if (!token && !isPublicPath) {
    // For API routes, let them hit the route handler to return proper JSON 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.next()
    }

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    if (pathname !== '/' && pathname !== '/connections') {
      url.searchParams.set('from', pathname)
    }
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
