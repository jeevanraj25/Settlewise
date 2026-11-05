import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes — always accessible
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/i/") ||      // public invoice view
    pathname.startsWith("/api/mcp") || // MCP endpoint (self-authenticates via ?key=)
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // Protected routes — redirect to login if not authenticated
  const session = await auth();
  if (!session?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
