"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SitesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/projects");
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
    </div>
  );
}
