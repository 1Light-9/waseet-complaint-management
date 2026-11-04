"use client";

import { createContext, ReactNode, useContext } from "react";
import { UserMe } from "@/lib/api";

const AppUserContext = createContext<UserMe | null>(null);

export function AppUserProvider({ user, children }: { user: UserMe | null; children: ReactNode }) {
    return (
        <AppUserContext.Provider value={user}>
            {children}
        </AppUserContext.Provider>
    );
}

export function useAppUser() {
    return useContext(AppUserContext);
}
