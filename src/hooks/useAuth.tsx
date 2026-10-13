/**
 * The signed-in user, their role, and the sign in / sign up / sign out calls.
 *
 * `isAdmin`, `isEditor` and `canEdit` are for UI affordances only. Hiding a
 * button is not authorization; the edge function re-checks every one of these
 * on the request itself.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  clearSession,
  onAccessRevoked,
  onSessionChange,
  storeSession,
  tokens,
  type ApiUser,
} from "@/lib/api";
import type { AppRole, Profile } from "@/types/database";

interface AuthContextType {
  user: ApiUser | null;
  profile: Profile | null;
  /** True until the stored token has been checked against the server. */
  loading: boolean;
  role: AppRole | null;
  /**
   * Signed in and let in by an admin. Every page but the sign-in form and the
   * "waiting for access" notice needs this, not merely `user`.
   */
  hasAccess: boolean;
  isAdmin: boolean;
  isEditor: boolean;
  canEdit: boolean;
  /** Resolves with the account, so the caller can tell "in" from "waiting". */
  signIn: (email: string, password: string) => Promise<ApiUser>;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // No token means signed out - don't spend a request finding that out.
    if (!tokens.access() && !tokens.refresh()) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const { user: me, profile: myProfile } = await api.auth.me();
      setUser(me);
      setProfile(myProfile);
    } catch {
      // A 401 here has already cleared the tokens inside the API client; any
      // other failure means we genuinely do not know who this is, and treating
      // an unknown as signed-out is the safe direction.
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The API client clears tokens on any 401, including one raised deep inside
   * a background query. Without this subscription the header would keep
   * showing an avatar for a session the client has already discarded.
   */
  useEffect(() => {
    return onSessionChange((nextUser) => {
      if (nextUser === null) {
        setUser(null);
        setProfile(null);
      } else {
        setUser(nextUser);
      }
    });
  }, []);

  /**
   * Access withdrawn mid-session. The flag is flipped locally rather than
   * refetched: the server has just told us the answer, and the route guard
   * needs it now to move them to the notice.
   */
  useEffect(() => {
    return onAccessRevoked(() => {
      setUser((current) =>
        current && current.access_granted ? { ...current, access_granted: false } : current,
      );
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await api.auth.login({ email, password });
    storeSession(session);
    setUser(session.user);
    const { profile: myProfile } = await api.auth.me();
    setProfile(myProfile);
    return session.user;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const session = await api.auth.signup({ email, password, full_name: fullName });
    storeSession(session);
    setUser(session.user);
    const { profile: myProfile } = await api.auth.me();
    setProfile(myProfile);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Revoking server-side is best effort. Whatever happens, the local
      // session goes - a sign-out that appears not to work is worse than a
      // refresh token that lingers until it expires.
    }
    clearSession();
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextType>(() => {
    const role = (user?.role ?? null) as AppRole | null;
    const isAdmin = role === "admin";
    const isEditor = role === "editor";
    return {
      user,
      profile,
      loading,
      role,
      hasAccess: Boolean(user?.access_granted),
      isAdmin,
      isEditor,
      canEdit: isAdmin || isEditor,
      signIn,
      signUp,
      signOut,
      refresh: load,
    };
  }, [user, profile, loading, signIn, signUp, signOut, load]);

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
