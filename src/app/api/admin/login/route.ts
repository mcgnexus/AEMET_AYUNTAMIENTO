import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminSession, verifyAdminPassword } from "@/lib/adminAuth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { password?: string } | null;
  if (!body?.password || !verifyAdminPassword(body.password)) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, createAdminSession(), {
    httpOnly: true,
    sameSite: "strict",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return response;
}
