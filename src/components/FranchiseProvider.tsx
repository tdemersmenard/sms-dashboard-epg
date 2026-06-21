"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useParams, usePathname } from "next/navigation";

interface FranchiseContextValue {
  franchiseId: string;
  franchiseSlug: string;
  franchiseName: string;
  isMaster: boolean;
  loading: boolean;
}

const FranchiseContext = createContext<FranchiseContextValue>({
  franchiseId: "",
  franchiseSlug: "",
  franchiseName: "",
  isMaster: false,
  loading: true,
});

export function useFranchise() {
  return useContext(FranchiseContext);
}

export function FranchiseProvider({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const slug = (params?.slug as string) || "";

  const [value, setValue] = useState<FranchiseContextValue>({
    franchiseId: "",
    franchiseSlug: slug,
    franchiseName: "",
    isMaster: false,
    loading: true,
  });

  const franchiseIdRef = useRef("");

  // Resolve slug to franchise data + user info
  useEffect(() => {
    if (!slug) {
      // No slug (e.g. /master, /login) — just load user info
      fetch("/api/auth/me")
        .then(r => r.json())
        .then(d => {
          setValue({
            franchiseId: d.user?.active_franchise_id ?? "",
            franchiseSlug: slug,
            franchiseName: "",
            isMaster: d.user?.is_master ?? false,
            loading: false,
          });
        })
        .catch(() => setValue(prev => ({ ...prev, loading: false })));
      return;
    }

    // Resolve slug → franchise
    Promise.all([
      fetch(`/api/franchises/resolve?slug=${encodeURIComponent(slug)}`).then(r => r.json()),
      fetch("/api/auth/me").then(r => r.json()),
    ])
      .then(([franchise, auth]) => {
        const fId = franchise?.id ?? "";
        franchiseIdRef.current = fId;
        setValue({
          franchiseId: fId,
          franchiseSlug: slug,
          franchiseName: franchise?.name ?? "",
          isMaster: auth.user?.is_master ?? false,
          loading: false,
        });
      })
      .catch(() => setValue(prev => ({ ...prev, loading: false })));
  }, [slug]);

  // Global fetch interceptor: add x-franchise-id header to all /api/ calls
  useEffect(() => {
    const fId = value.franchiseId;
    if (!fId) return;

    franchiseIdRef.current = fId;
    const origFetch = window.fetch;

    window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;

      if (url.startsWith("/api/") && franchiseIdRef.current) {
        const newHeaders = new Headers(init?.headers);
        if (!newHeaders.has("x-franchise-id")) {
          newHeaders.set("x-franchise-id", franchiseIdRef.current);
        }
        return origFetch(input, { ...init, headers: newHeaders });
      }

      return origFetch(input, init);
    };

    return () => {
      window.fetch = origFetch;
    };
  }, [value.franchiseId]);

  return (
    <FranchiseContext.Provider value={value}>
      {children}
    </FranchiseContext.Provider>
  );
}
