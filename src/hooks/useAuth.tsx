import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile } from "@/types/database";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** True until the initial session has been resolved. */
  loading: boolean;
  /** True while the role/profile lookup for the current user is in flight. */
  roleLoading: boolean;
  role: AppRole | null;
  /** Set when the role lookup failed, so callers can avoid acting on a guess. */
  roleError: string | null;
  isAdmin: boolean;
  isEditor: boolean;
  canEdit: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  /**
   * The session callback must stay synchronous.
   *
   * Calling an async supabase-js method from inside `onAuthStateChange` is the
   * documented way to deadlock the client: the callback holds the auth lock,
   * and the nested call waits for it. The previous version awaited a
   * `user_roles` query in there. Here the callback only sets state, and the
   * lookup runs from an effect keyed on the user id.
   */
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = user?.id ?? null;

  const loadRoleAndProfile = useCallback(async (id: string, signal: { cancelled: boolean }) => {
    setRoleLoading(true);
    setRoleError(null);
    try {
      const [roleResult, profileResult] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", id).maybeSingle(),
        supabase.from("profiles").select("*").eq("user_id", id).maybeSingle(),
      ]);
      if (signal.cancelled) return;

      if (roleResult.error) throw roleResult.error;

      // No row is a legitimate state - the signup trigger grants the default -
      // so it means viewer. An *error*, though, is not the same thing, and
      // silently reporting "viewer" for a network blip used to hide an admin's
      // real permissions from them with no indication anything had failed.
      setRole((roleResult.data?.role as AppRole | undefined) ?? "viewer");
      setProfile((profileResult.data as Profile | null) ?? null);
    } catch (error) {
      if (signal.cancelled) return;
      console.error("Error loading role/profile:", error);
      setRole(null);
      setRoleError(error instanceof Error ? error.message : "Could not load your permissions");
    } finally {
      if (!signal.cancelled) setRoleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setRole(null);
      setProfile(null);
      setRoleError(null);
      setRoleLoading(false);
      return;
    }
    const signal = { cancelled: false };
    void loadRoleAndProfile(userId, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [userId, loadRoleAndProfile]);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, [userId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setRoleError(null);
  }, []);

  const value = useMemo<AuthContextType>(() => {
    const isAdmin = role === "admin";
    const isEditor = role === "editor";
    return {
      user,
      session,
      profile,
      loading,
      roleLoading,
      role,
      roleError,
      isAdmin,
      isEditor,
      canEdit: isAdmin || isEditor,
      refreshProfile,
      signOut,
    };
  }, [user, session, profile, loading, roleLoading, role, roleError, refreshProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
