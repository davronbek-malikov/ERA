import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge pre-check for the three workspaces (defence in depth, Prompt 07).
 * It only looks for the presence of the session cookie so that signed-out visitors get an immediate
 * redirect that keeps the deep link (`?next=`). It does NOT authorize: every layout, page, route handler
 * and server action still verifies the signed session and the user's role/ownership on the server.
 */
export function middleware(request: NextRequest) {
  if (request.cookies.has("era_session")) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;
  const signIn = request.nextUrl.clone();
  signIn.pathname = "/sign-in";
  signIn.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
  return NextResponse.redirect(signIn, 307);
}

export const config = {
  matcher: ["/learn/:path*", "/teacher/:path*", "/admin/:path*"]
};
