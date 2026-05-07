"use client";

import { createContext, useContext } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthUserState = {
  userId: string | null;
  supabase: SupabaseClient | null;
};

export const AuthUserContext = createContext<AuthUserState>({
  userId: null,
  supabase: null,
});

export function useAuthUser(): AuthUserState {
  return useContext(AuthUserContext);
}
