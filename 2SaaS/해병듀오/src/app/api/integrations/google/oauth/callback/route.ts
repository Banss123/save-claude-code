import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  encryptGoogleToken,
  exchangeGoogleCodeForToken,
  fetchGoogleUserInfo,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "@/lib/integrations/google/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const settingsUrl = new URL("/app/settings", url.origin);
  const redirect = (status: string, detail?: string) => {
    settingsUrl.searchParams.set("google", status);
    if (detail) settingsUrl.searchParams.set("detail", detail.slice(0, 120));
    const response = NextResponse.redirect(settingsUrl);
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
      maxAge: 0,
      path: "/",
    });
    return response;
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const actualState = url.searchParams.get("state");
  if (!expectedState || !actualState || expectedState !== actualState) {
    return redirect("invalid_state");
  }

  const oauthError = url.searchParams.get("error");
  if (oauthError) return redirect("oauth_error", oauthError);

  const code = url.searchParams.get("code");
  if (!code) return redirect("missing_code");

  try {
    const token = await exchangeGoogleCodeForToken({
      code,
      origin: url.origin,
    });
    const userInfo = await fetchGoogleUserInfo(token.access_token!);

    const { data: existing, error: existingError } = await supabase
      .from("google_accounts")
      .select("id, refresh_token_ciphertext")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const refreshTokenCiphertext = token.refresh_token
      ? encryptGoogleToken(token.refresh_token)
      : existing?.refresh_token_ciphertext;
    if (!refreshTokenCiphertext) {
      return redirect("missing_refresh_token");
    }

    const scopes = token.scope?.split(/\s+/).filter(Boolean) ?? [];
    const expiresAt =
      typeof token.expires_in === "number"
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null;

    const { error: upsertError } = await supabase.from("google_accounts").upsert(
      {
        profile_id: user.id,
        google_sub: userInfo.sub,
        email: userInfo.email,
        display_name: userInfo.name ?? null,
        avatar_url: userInfo.picture ?? null,
        scopes,
        refresh_token_ciphertext: refreshTokenCiphertext,
        token_expires_at: expiresAt,
        connected_at: new Date().toISOString(),
        revoked_at: null,
        metadata: {
          token_type: token.token_type ?? null,
          has_refresh_token: Boolean(token.refresh_token),
        },
      },
      { onConflict: "profile_id" },
    );
    if (upsertError) throw new Error(upsertError.message);

    return redirect("connected");
  } catch (error) {
    return redirect("callback_error", error instanceof Error ? error.message : "unknown");
  }
}
