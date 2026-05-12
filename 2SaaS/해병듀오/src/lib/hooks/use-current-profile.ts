"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/database.types";

export type CurrentProfile =
  Database["public"]["Tables"]["profiles"]["Row"];

export function useCurrentProfile() {
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) return;
      if (userError) {
        setError(userError.message);
        setProfile(null);
        setLoading(false);
        return;
      }
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (cancelled) return;
      if (profileError) {
        setError(profileError.message);
        setProfile(null);
      } else {
        setProfile(data);
        localStorage.setItem("currentUserId", data.id);
      }
      setLoading(false);
    }

    load();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { profile, loading, error };
}
