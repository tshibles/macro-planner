"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/supabase/client";

export function UserButton() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!email) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-600 hidden sm:block truncate max-w-[160px]">
        {email}
      </span>
      <button
        onClick={handleLogout}
        className="text-xs text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-brand-300 rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap"
      >
        Log out
      </button>
    </div>
  );
}
