"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface FranchiseContextValue {
  franchiseId: string;
  isMaster: boolean;
  impersonating: string | null;
  impersonatingFranchiseName: string | null;
  loading: boolean;
}

const FranchiseContext = createContext<FranchiseContextValue>({
  franchiseId: "",
  isMaster: false,
  impersonating: null,
  impersonatingFranchiseName: null,
  loading: true,
});

export function useFranchise() {
  return useContext(FranchiseContext);
}

export function FranchiseProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<FranchiseContextValue>({
    franchiseId: "",
    isMaster: false,
    impersonating: null,
    impersonatingFranchiseName: null,
    loading: true,
  });

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => {
        setValue({
          franchiseId: d.user?.active_franchise_id ?? "",
          isMaster: d.user?.is_master ?? false,
          impersonating: d.user?.impersonating ?? null,
          impersonatingFranchiseName: d.user?.impersonating_franchise_name ?? null,
          loading: false,
        });
      })
      .catch(() => setValue(prev => ({ ...prev, loading: false })));
  }, []);

  return (
    <FranchiseContext.Provider value={value}>
      {children}
    </FranchiseContext.Provider>
  );
}
