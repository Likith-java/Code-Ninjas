"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "@/lib/auth-storage";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "authed">("checking");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    setStatus("authed");
  }, [router]);

  if (status === "checking") {
    return (
      <div className="min-h-screen grid place-items-center bg-[#F5F0E3]">
        <div className="size-8 animate-spin rounded-full border-2 border-[#0E4B3E] border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}