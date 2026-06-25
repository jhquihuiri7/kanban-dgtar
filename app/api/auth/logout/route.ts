import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-token";
import { sessionCookieOptions } from "@/lib/auth-server";
import { publicUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const res = NextResponse.redirect(publicUrl(req, "/login"), { status: 303 });
  res.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  });
  return res;
}
