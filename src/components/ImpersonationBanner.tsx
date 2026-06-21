"use client";

import { useFranchise } from "./FranchiseProvider";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ImpersonationBanner() {
  const { impersonating, impersonatingFranchiseName } = useFranchise();
  const router = useRouter();

  if (!impersonating) return null;

  const handleReturn = async () => {
    await fetch("/api/master/impersonate", { method: "DELETE" });
    router.push("/master");
    router.refresh();
  };

  return (
    <div className="fixed top-0 left-0 right-0 md:left-[260px] z-50 bg-orange-500 text-white text-sm font-semibold px-4 py-2 flex items-center justify-between shadow-md">
      <span>Vous gérez: <strong>{impersonatingFranchiseName ?? impersonating}</strong></span>
      <button
        onClick={handleReturn}
        className="flex items-center gap-1.5 hover:bg-orange-600 px-2.5 py-1 rounded-lg transition text-xs font-medium"
      >
        <ArrowLeft size={14} />
        Retour au Master
      </button>
    </div>
  );
}
