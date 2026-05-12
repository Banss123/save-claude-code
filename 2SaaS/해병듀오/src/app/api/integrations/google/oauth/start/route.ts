import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildGoogleAuthorizationUrl,
  createGoogleOAuthState,
  GOOGLE_OAUTH_STATE_COOKIE,
  googleOAuthConfigured,
  googleTokenEncryptionConfigured,
} from "@/lib/integrations/google/oauth";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const settingsUrl = new URL("/app/settings", request.url);
  if (!googleOAuthConfigured()) {
    settingsUrl.searchParams.set("google", "missing_oauth_env");
    return NextResponse.redirect(settingsUrl);
  }
  if (!googleTokenEncryptionConfigured()) {
    settingsUrl.searchParams.set("google", "missing_encryption_key");
    return NextResponse.redirect(settingsUrl);
  }

  const state = createGoogleOAuthState();
  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.redirect(
    buildGoogleAuthorizationUrl({
      origin: new URL(request.url).origin,
      state,
    }),
  );
}
