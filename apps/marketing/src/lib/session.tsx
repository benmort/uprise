"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, type AuthPrincipal } from "@yarns/api-client";

/**
 * Single source of truth for the marketing site's signed-in state. Calls the
 * yarns API's /auth/check ONCE (credentialed, via the shared httpOnly session
 * cookie) and shares the verified principal with every consumer — the header,
 * the mobile menu and the homepage launchpad — so they can never disagree.
 *
 * This deliberately replaces the earlier advisory `session_hint` cookie, which
 * collided by name with prog's cookie on the shared `.dev.prog.network` dev
 * domain and could surface a prog account. checkSession proves a real yarns
 * session against the yarns API, so the identity shown is always correct.
 */
type SessionState = { loading: boolean; user: AuthPrincipal | null };

const SessionContext = createContext<SessionState>({ loading: true, user: null });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ loading: true, user: null });

  useEffect(() => {
    let active = true;
    auth
      .checkSession()
      .then((res) => {
        if (active) setState({ loading: false, user: res.ok ? res.data.user : null });
      })
      .catch(() => {
        if (active) setState({ loading: false, user: null });
      });
    return () => {
      active = false;
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
