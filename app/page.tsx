"use client";

import { useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { LeadApp } from "@/components/LeadApp";

export default function Home() {
  const [syncFatal, setSyncFatal] = useState<string | null>(null);

  return (
    <AuthGate onSyncError={(msg) => setSyncFatal(msg)}>
      <LeadApp syncFatalMessage={syncFatal} onClearSyncFatal={() => setSyncFatal(null)} />
    </AuthGate>
  );
}
