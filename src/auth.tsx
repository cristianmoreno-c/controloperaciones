import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

export type Role = "admin" | "sup_comercial" | "sup_operativo" | "vendedor" | "inspector";
export const ROLES: Record<Role, string> = { admin: "Administrador", sup_comercial: "Supervisor comercial", sup_operativo: "Supervisor operativo", vendedor: "Vendedor", inspector: "Inspector" };
export interface Profile { id: string; email: string | null; full_name: string; role: Role; active: boolean; theme: "dark" | "light" }
interface Ctx { session: Session | null; profile: Profile | null; loading: boolean; signOut: () => Promise<void>; setTheme: (t: "dark" | "light") => Promise<void> }
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setLoading(false); return; }
    const { data } = await supabase.from("profiles").select("*").eq("id", s.user.id).maybeSingle();
    setProfile((data as Profile | null) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); void loadProfile(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); void loadProfile(s); });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const value: Ctx = {
    session, profile, loading,
    signOut: async () => { await supabase.auth.signOut(); },
    setTheme: async (t) => {
      if (!profile) return;
      setProfile({ ...profile, theme: t });
      await supabase.from("profiles").update({ theme: t }).eq("id", profile.id);
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export function useAuth(): Ctx {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth fuera de AuthProvider");
  return c;
}
