import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  UNAUTHORIZED_EVENT,
  authApi,
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from '../lib/api';

const AuthContext = createContext(null);

function createAnonymousSession() {
  return { token: null, user: null, status: 'anonymous' };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const token = getStoredToken();
    return {
      token,
      user: null,
      status: token ? 'loading' : 'anonymous',
    };
  });

  const logout = useCallback(() => {
    clearStoredToken();
    setSession(createAnonymousSession());
  }, []);

  // Hydrate an existing token once on startup. The identity always comes from
  // /auth/me, never from decoded token claims.
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return undefined;

    let cancelled = false;

    authApi
      .me()
      .then((response) => {
        if (cancelled) return;
        setSession({ token, user: response.user, status: 'authenticated' });
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredToken();
        setSession(createAnonymousSession());
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 from any authenticated request ends the session immediately.
  useEffect(() => {
    const handleUnauthorized = () => logout();
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const response = await authApi.login(email, password);
    setStoredToken(response.token);
    setSession({
      token: response.token,
      user: response.user,
      status: 'authenticated',
    });
    return response.user;
  }, []);

  const register = useCallback(async (payload) => {
    const response = await authApi.register(payload);
    setStoredToken(response.token);
    setSession({
      token: response.token,
      user: response.user,
      status: 'authenticated',
    });
    return response.user;
  }, []);

  const refreshUser = useCallback(async () => {
    const response = await authApi.me();
    setSession((current) => ({
      ...current,
      user: response.user,
      status: 'authenticated',
    }));
    return response.user;
  }, []);

  const value = useMemo(
    () => ({
      ...session,
      isAuthenticated: session.status === 'authenticated',
      login,
      register,
      logout,
      refreshUser,
    }),
    [session, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
