"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { auth } from "../lib/firebase";

interface AuthState {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });
  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, loading: false })), []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Pages that need a signed-in adult. Sends visitors to sign in and brings them back afterwards. */
export function useRequireUser(): AuthState {
  const state = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();

  useEffect(() => {
    if (!state.loading && !state.user) {
      const here = search ? `${pathname}?${search}` : pathname;
      router.replace(`/sign-in?next=${encodeURIComponent(here)}`);
    }
  }, [state.loading, state.user, pathname, search, router]);

  return state;
}
