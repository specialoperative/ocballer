import { NextResponse } from "next/server";
import { issueSession, SESSION_COOKIE } from "@/lib/session";

export const runtime = "edge";

export async function POST(request: Request) {
  const expected = process.env.PORTAL_PASSWORD;
  if (!expected || !process.env.SESSION_SECRET) {
    return NextResponse.json(
      { error: "PORTAL_PASSWORD and SESSION_SECRET are not set on this deployment." },
      { status: 500 },
    );
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");

  if (password !== expected) {
    return NextResponse.redirect(new URL("/login?e=1", request.url), { status: 303 });
  }

  const cookie = await issueSession();
  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: cookie.maxAge,
  });
  return response;
}

export async function DELETE(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
