import type { Metadata } from "next"

import { DashboardShell } from "@/components/dashboard/dashboard-shell"

export const metadata: Metadata = {
  title: "Sem título · reason",
}

export default function DashboardPage() {
  return <DashboardShell />
}
