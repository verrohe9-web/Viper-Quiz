import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export default function AdminDashboard() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Operations</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">ViperQuiz Admin</h1>
          <p className="mt-2 text-muted-foreground">Safaricom Daraja is the only active payment provider for paid rounds.</p>
        </div>
        <Card className="flex items-start gap-4 border-emerald-200 bg-emerald-50 p-6">
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-emerald-950">Safaricom Daraja payments</h2>
            <p className="mt-1 max-w-2xl text-sm text-emerald-900">
              Players receive an M-Pesa STK Push and the room unlocks only after Daraja confirms the required participant payments. Callback reconciliation remains fail-closed until the approved production merchant configuration is enabled.
            </p>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
