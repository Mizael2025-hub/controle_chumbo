"use client";

import { useCallback, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { LeadApp } from "@/components/LeadApp";

export default function Home() {
  const [syncFatal, setSyncFatal] = useState<string | null>(null);
  const clearSyncFatal = useCallback(() => setSyncFatal(null), []);

  return (
    <AuthGate onSyncError={(msg) => setSyncFatal(msg)} onSyncRecovered={clearSyncFatal}>
      <LeadApp syncFatalMessage={syncFatal} onClearSyncFatal={clearSyncFatal} />
    </AuthGate>
  );
}
