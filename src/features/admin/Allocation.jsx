import { useMemo, useState } from "react";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import EmptyState from "@/components/common/EmptyState";
import { Labeled, SelectInput, TextInput } from "@/components/common/form";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { useAction } from "@/hooks/useAction";
import { useDb, getState } from "@/services/mock/store";
import { api, previewAllocation } from "@/services/api";
import { bn, formatBDT, toMinor } from "@/lib/money";

export default function Allocation() {
  const { user } = useAuth();
  const projects = useDb((s) => s.projects);
  const investments = useDb((s) => s.investments);
  const users = useDb((s) => s.users);
  const financialEntries = useDb((s) => s.financialEntries);
  const eligible = useMemo(() => projects.filter((p) => p.status === "IN_PROGRESS"), [projects]);
  const [f, setF] = useState({ projectId: "", gross: "", costs: "", commissionPct: "2" });
  const projectId = f.projectId || eligible[0]?.id;
  const projectEntries = useMemo(() => (financialEntries ?? []).filter((entry) => entry.projectId === projectId), [financialEntries, projectId]);
  const approvedEntries = projectEntries.filter((entry) => entry.status === "APPROVED");
  const pendingFinancialEntries = projectEntries.filter((entry) => entry.status === "PENDING");
  const hasApprovedFinancialEntries = approvedEntries.length > 0;
  const useFinancialLedger = projectEntries.length > 0;
  const ledgerGross = approvedEntries.filter((entry) => entry.kind === "REVENUE").reduce((total, entry) => total + Number(entry.amount), 0);
  const ledgerCosts = approvedEntries.filter((entry) => entry.kind === "EXPENSE").reduce((total, entry) => total + Number(entry.amount), 0);
  const grossAmount = useFinancialLedger ? ledgerGross : toMinor(f.gross || 0);
  const costsAmount = useFinancialLedger ? ledgerCosts : toMinor(f.costs || 0);
  const commissionPct = Number(f.commissionPct || 0);
  const input = { projectId, gross: grossAmount, costs: costsAmount, commissionPct };
  // Once approved financial entries exist, settlement must use their totals; the API enforces the same rule.
  // Include live ledger totals so approving/correcting an entry immediately refreshes the payout preview.
  const pv = useMemo(() => (projectId ? previewAllocation(getState(), { projectId, gross: grossAmount, costs: costsAmount, commissionPct }) : null), [projectId, grossAmount, costsAmount, commissionPct, investments]);
  const [run, pending] = useAction(() => api.allocate(user.id, input), "Programme proceeds have been allocated and credited to investor wallets");
  const name = (id) => users.find((u) => u.id === id)?.name;
  const invalid = (useFinancialLedger ? input.gross < 0 : f.gross === "" || !Number.isFinite(Number(f.gross)) || Number(f.gross) < 0) || (useFinancialLedger ? input.costs < 0 : f.costs !== "" && (!Number.isFinite(Number(f.costs)) || Number(f.costs) < 0)) || (useFinancialLedger && !hasApprovedFinancialEntries) || ledgerGross < 0 || ledgerCosts < 0 || pendingFinancialEntries.length > 0 || pv?.net < 0 || !pv?.rows.length;

  if (!eligible.length) return <><PageHeader title="Profit Allocation" /><EmptyState title="The programme is not marked In Progress" description="The programme must be In Progress before sales proceeds can be allocated." /></>;
  return (
    <>
      <PageHeader title="Profit Allocation" description="Settlement is allocated proportionally to approved investor capital contributions. Actual proceeds depend on programme accounts; returns are not guaranteed." />
      {hasApprovedFinancialEntries && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-950"><strong>Using approved financial records:</strong> gross sales {formatBDT(ledgerGross)} · expenses {formatBDT(ledgerCosts)}. These figures are locked to the approved Programme Financial Entries ledger so the final settlement reconciles to recorded activity.</div>}
      {useFinancialLedger && !hasApprovedFinancialEntries && <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Settlement blocked:</strong> this programme has financial-entry history, but none of the entries is approved. Submit valid corrected entries and have another administrator approve them before close-out.</div>}
      {pendingFinancialEntries.length > 0 && <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Settlement blocked:</strong> {pendingFinancialEntries.length} financial entr{pendingFinancialEntries.length === 1 ? "y is" : "ies are"} still awaiting independent review. Approve or reject every entry before closing out the programme.</div>}
      <Card><CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Labeled label="Programme"><SelectInput value={projectId} onChange={(e) => setF({ ...f, projectId: e.target.value, gross: "", costs: "" })} options={eligible.map((p) => ({ value: p.id, label: p.title }))} /></Labeled>
        <Labeled label="Gross Sales (BDT)" hint={useFinancialLedger ? "Taken from approved revenue entries" : "Enter manually, or record revenue in Programme Financial Entries first."}><TextInput type="number" min={0} value={useFinancialLedger ? (ledgerGross / 100).toFixed(2) : f.gross} disabled={useFinancialLedger} onChange={(e) => setF({ ...f, gross: e.target.value })} /></Labeled>
        <Labeled label="Operating, feed, and treatment costs (BDT)" hint={useFinancialLedger ? "Taken from approved expense entries" : "Enter manually, or record expenses in Programme Financial Entries first."}><TextInput type="number" min={0} value={useFinancialLedger ? (ledgerCosts / 100).toFixed(2) : f.costs} disabled={useFinancialLedger} onChange={(e) => setF({ ...f, costs: e.target.value })} /></Labeled>
        <Labeled label="Platform commission (% of sales)"><TextInput type="number" min={0} max={100} step="0.1" value={f.commissionPct} onChange={(e) => setF({ ...f, commissionPct: e.target.value })} /></Labeled>
      </CardContent></Card>
      {pv && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            {[["Invested Capital", formatBDT(pv.invested)], ["Commission", formatBDT(pv.commission)], ["Distributable Net Amount", formatBDT(pv.net)], ["Investor Positions", bn(pv.rows.length)]].map(([k, v]) => (
              <div key={k} className="rounded-lg border bg-background p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="text-lg font-semibold">{v}</p></div>))}
          </div>
          {pv.net < 0 && <p role="alert" className="text-sm text-red-600">Costs and commission exceed gross sales.</p>}
          {hasApprovedFinancialEntries && (ledgerGross < 0 || ledgerCosts < 0) && <p role="alert" className="text-sm text-red-600">Approved corrections result in a negative gross sales or expense total. Reconcile financial entries before settlement.</p>}
          <DataTable rows={pv.rows} empty="No active investor positions found" rowKey={(r) => r.inv.id} columns={[
            { key: "i", header: "Investor", render: (r) => name(r.inv.investorId) },
            { key: "p", header: "Share of invested capital", render: (r) => `${bn(Number(((r.inv.amount / pv.totalCapital) * 100).toFixed(2)))}%` },
            { key: "inv", header: "Investment", render: (r) => formatBDT(r.inv.amount) },
            { key: "pay", header: "Payable", render: (r) => <b>{formatBDT(r.payout)}</b> },
            { key: "pl", header: "Profit / Loss", render: (r) => <span className={r.payout - r.inv.amount < 0 ? "text-red-600" : "text-emerald-600"}>{formatBDT(r.payout - r.inv.amount)}</span> },
          ]} />
          <ConfirmAction triggerLabel="Confirm & Distribute" disabled={invalid || pending} title="Close out this programme and distribute proceeds?" description={`This records gross sales of ${formatBDT(input.gross)}, costs of ${formatBDT(input.costs)}, commission of ${formatBDT(pv.commission)}, and net proceeds of ${formatBDT(pv.net)} across ${bn(pv.rows.length)} investor position(s). Realized programme gain/loss versus invested capital is ${formatBDT(pv.net - pv.invested)}. The programme will be marked Completed and investor wallets credited; verify every figure before confirming.`} confirmLabel="Distribute proceeds" onConfirm={run} />
        </div>
      )}
    </>
  );
}
