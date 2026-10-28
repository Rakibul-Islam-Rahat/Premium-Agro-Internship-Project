import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, Banknote, Download, FileText, Printer, RotateCcw, TrendingUp, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import StatCard from "@/components/common/StatCard";
import StatusBadge from "@/components/common/StatusBadge";
import { Labeled, SelectInput, TextInput } from "@/components/common/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthContext";
import { CHANNEL, ROLE, TX_TYPE } from "@/config/labels";
import { useDb } from "@/services/mock/store";
import { buildMonthlyCloseoutReport, buildMonthlyFinancialEntryReport, buildMonthlyReport, buildProjectPerformance, filterFinancialEntries, filterReportTransactions, reconcileCloseout, reportCsv, summarizeFinancialEntries, summarizeReportTransactions } from "@/lib/reports";
import { formatBDT, bn } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { printElement } from "@/lib/print";

const TYPE_OPTIONS = [{ value: "ALL", label: "All transaction types" }, ...Object.entries(TX_TYPE).map(([value, label]) => ({ value, label }))];
const STATUS_OPTIONS = [{ value: "ALL", label: "All statuses" }, { value: "COMPLETED", label: "Completed / settled" }, { value: "PENDING", label: "Pending review" }, { value: "REJECTED", label: "Rejected" }];
const dateValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const datePreset = (days) => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start: dateValue(start), end: dateValue(end) };
};
const compactTaka = (value) => {
  if (Math.abs(value) >= 10000000) return `${bn(value / 10000000)} Cr`;
  if (Math.abs(value) >= 100000) return `${bn(value / 100000)} L`;
  if (Math.abs(value) >= 1000) return `${bn(value / 1000)}k`;
  return bn(value);
};

export default function Reports() {
  const { user } = useAuth();
  const isAdmin = ["ADMIN", "MAIN_ADMIN"].includes(user.role);
  const allTx = useDb((s) => s.transactions);
  const users = useDb((s) => s.users);
  const projects = useDb((s) => s.projects);
  const agroProjects = useDb((s) => s.agroProjects ?? []);
  const investments = useDb((s) => s.investments);
  const allocationSnapshot = useDb((s) => s.projectAllocations);
  const financialEntries = useDb((s) => s.financialEntries);
  const investmentRequests = useDb((s) => s.investmentRequests);
  const allocations = allocationSnapshot ?? [];
  const reportRef = useRef(null);
  const [filters, setFilters] = useState({ start: "", end: "", type: "ALL", status: "ALL", projectId: "ALL", financialProjectId: "ALL", userId: "ALL" });

  const accountTx = useMemo(() => isAdmin ? allTx : allTx.filter((tx) => tx.userId === user.id), [allTx, isAdmin, user.id]);
  // Include former investors with ledger/position history even if their role later changed.
  const reportAccounts = useMemo(() => users.filter((account) => account.role === "INVESTOR" || allTx.some((tx) => tx.userId === account.id) || investments.some((inv) => inv.investorId === account.id)), [users, allTx, investments]);
  const reportInvestorId = isAdmin ? (filters.userId === "ALL" ? null : filters.userId) : user.id;
  const performance = useMemo(() => buildProjectPerformance({ investments, transactions: accountTx, projects, investorId: reportInvestorId, projectId: filters.projectId }), [investments, accountTx, projects, reportInvestorId, filters.projectId]);
  const visibleProjects = useMemo(() => {
    if (isAdmin) return projects.filter((p) => p.status !== "DRAFT");
    const visible = new Set([
      ...investments.filter((inv) => inv.investorId === user.id).map((inv) => inv.projectId),
      ...accountTx.filter((tx) => tx.ref).map((tx) => tx.ref),
    ]);
    return projects.filter((p) => visible.has(p.id));
  }, [isAdmin, projects, investments, user.id, accountTx]);
  const filteredTx = useMemo(() => filterReportTransactions(accountTx, filters), [accountTx, filters]);
  const rows = useMemo(() => filteredTx.map((tx) => ({
    ...tx,
    accountName: users.find((u) => u.id === tx.userId)?.name ?? "Unknown account",
    category: TX_TYPE[tx.type] ?? tx.type,
    projectTitle: projects.find((p) => p.id === tx.ref)?.title ?? (tx.ref ? `Programme ${tx.ref}` : "—"),
  })), [filteredTx, users, projects]);
  const totals = useMemo(() => summarizeReportTransactions(filteredTx), [filteredTx]);
  const monthly = useMemo(() => buildMonthlyReport(filteredTx), [filteredTx]);
  const chartData = useMemo(() => monthly.map((r) => ({ ...r, depositsTaka: r.deposits / 100, investedTaka: r.invested / 100, payoutsTaka: r.payouts / 100, withdrawalsTaka: r.withdrawals / 100 })), [monthly]);
  const pendingInvestmentRequests = useMemo(() => (investmentRequests ?? []).filter((r) => ["PENDING_REVIEW", "PAYMENT_PENDING", "APPROVED_AWAITING_PAYMENT", "PAYMENT_REJECTED"].includes(r.status)).length, [investmentRequests]);
  const closeoutProjectCounts = useMemo(() => {
    const counts = new Map();
    for (const allocation of allocations) if (allocation.projectId) counts.set(allocation.projectId, (counts.get(allocation.projectId) ?? 0) + 1);
    return counts;
  }, [allocations]);
  const closeouts = useMemo(() => allocations.filter((a) => {
    if (filters.projectId !== "ALL" && a.projectId !== filters.projectId) return false;
    const date = new Date(a.createdAt);
    const key = Number.isNaN(date.getTime()) ? "" : dateValue(date);
    if (filters.start && (!key || key < filters.start)) return false;
    if (filters.end && (!key || key > filters.end)) return false;
    return true;
  }).map((a) => {
    const reconciliation = reconcileCloseout(a);
    if (a.projectId && closeoutProjectCounts.get(a.projectId) > 1) return { ...a, reconciliation: { status: "MISMATCH", reasons: [...reconciliation.reasons, "More than one settlement snapshot exists for this programme"] } };
    return { ...a, reconciliation };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [allocations, closeoutProjectCounts, filters.projectId, filters.start, filters.end]);
  const monthlyCloseouts = useMemo(() => buildMonthlyCloseoutReport(closeouts), [closeouts]);
  const reportFinancialFilters = useMemo(() => ({ start: filters.start, end: filters.end, projectId: filters.financialProjectId }), [filters.start, filters.end, filters.financialProjectId]);
  const filteredFinancialEntries = useMemo(() => isAdmin ? filterFinancialEntries(financialEntries, reportFinancialFilters) : [], [isAdmin, financialEntries, reportFinancialFilters]);
  const financialEntryTotals = useMemo(() => summarizeFinancialEntries(filteredFinancialEntries), [filteredFinancialEntries]);
  const monthlyOperationalFinance = useMemo(() => buildMonthlyFinancialEntryReport(financialEntries, reportFinancialFilters), [financialEntries, reportFinancialFilters]);
  const incompleteSettlements = performance.filter((row) => row.settlementStatus === "INCOMPLETE").length;
  const closeoutMismatches = closeouts.filter((row) => row.reconciliation.status === "MISMATCH").length;
  const closeoutsWithoutDetail = closeouts.filter((row) => row.reconciliation.status === "DETAILS_UNAVAILABLE").length;

  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const resetFilters = () => setFilters({ start: "", end: "", type: "ALL", status: "ALL", projectId: "ALL", financialProjectId: "ALL", userId: "ALL" });
  const useLastDays = (days) => setFilters((current) => ({ ...current, ...datePreset(days) }));
  const exportCsv = () => {
    const blob = new Blob(["\uFEFF", reportCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `agrofund-${isAdmin ? "platform" : "investor"}-statement-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const exportFinancialCsv = () => {
    const financeRows = filteredFinancialEntries.map((entry) => ({
      id: entry.id,
      date: entry.transactionDate,
      accountName: users.find((u) => u.id === entry.createdBy)?.name ?? "Former account",
      category: `${entry.kind === "REVENUE" ? "Revenue" : "Expense"}${entry.reversalOf ? " reversal" : ""} — ${entry.category?.replaceAll("_", " ") ?? ""}`,
      projectTitle: agroProjects.find((p) => p.id === entry.projectId)?.title ?? projects.find((p) => p.id === entry.projectId)?.title ?? `Unknown project (${entry.projectId})`,
      amount: entry.amount,
      status: entry.status,
      channel: entry.reference ? "Reference" : "",
      trxId: entry.reference || entry.id,
    }));
    const blob = new Blob(["\uFEFF", reportCsv(financeRows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `premium-agro-programme-financial-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };
  const printReport = () => { if (reportRef.current) void printElement(reportRef.current); };

  const stats = [
    { label: isAdmin ? "Confirmed incoming investment payments" : "Incoming payments recorded", value: formatBDT(totals.deposits), hint: "Verified bank-transfer investment receipts", icon: ArrowDownLeft },
    { label: isAdmin ? "Capital deployed" : "Capital invested", value: formatBDT(totals.capitalInvested), hint: "Investment debits settled", icon: TrendingUp },
    { label: "Programme payouts credited", value: formatBDT(totals.projectPayouts), hint: "Payouts include returned capital where applicable", icon: Wallet },
    { label: isAdmin ? "Withdrawals paid" : "Withdrawals completed", value: formatBDT(totals.withdrawalsPaid), hint: "Pending withdrawals are excluded", icon: ArrowUpRight },
  ];

  return (
    <>
      <PageHeader
        title={isAdmin ? "Reports & Financials" : "Reports & Statements"}
        description={isAdmin
          ? "Review settled platform ledger activity, programme settlements, payout outcomes, and export records for reconciliation."
          : "Review your settled financial activity and pooled-programme results, and download a statement for your records."}
        actions={<>
          {isAdmin && <Button variant="outline" asChild><Link to="/admin/financial-entries"><FileText className="h-4 w-4" />Manage financial entries</Link></Button>}
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" />Export CSV</Button>
          <Button onClick={printReport} disabled={!rows.length}><Printer className="h-4 w-4" />Print / Save PDF</Button>
        </>}
      />

      {isAdmin && <div className="mb-5 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="font-semibold">Need to update project revenue or expenses?</p><p className="mt-1 text-sm text-muted-foreground">Use Underlying Project Financial Entries to attribute each income/cost to a specific agro project, attach evidence, and submit for independent admin approval. Programme settlement rolls up approved entries across all projects.</p></div>
        <Button asChild><Link to="/admin/financial-entries">Open entry manager</Link></Button>
      </div>}

      <Card className="mb-5">
        <CardHeader className="pb-3"><CardTitle className="text-base">Report filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <Labeled label="From date"><TextInput type="date" value={filters.start} max={filters.end || undefined} onChange={(e) => updateFilter("start", e.target.value)} /></Labeled>
          <Labeled label="To date"><TextInput type="date" value={filters.end} min={filters.start || undefined} onChange={(e) => updateFilter("end", e.target.value)} /></Labeled>
          <Labeled label="Transaction type"><SelectInput value={filters.type} onChange={(e) => updateFilter("type", e.target.value)} options={TYPE_OPTIONS} /></Labeled>
          <Labeled label="Status"><SelectInput value={filters.status} onChange={(e) => updateFilter("status", e.target.value)} options={STATUS_OPTIONS} /></Labeled>
          <Labeled label="Programme"><SelectInput value={filters.projectId} onChange={(e) => updateFilter("projectId", e.target.value)} options={[{ value: "ALL", label: "All programme activity" }, ...visibleProjects.map((p) => ({ value: p.id, label: p.title }))]} /></Labeled>
          {isAdmin && <Labeled label="Underlying project (finance)"><SelectInput value={filters.financialProjectId} onChange={(e) => updateFilter("financialProjectId", e.target.value)} options={[{ value: "ALL", label: "All underlying projects" }, ...agroProjects.filter((p) => p.status !== "ARCHIVED").map((p) => ({ value: p.id, label: p.title }))]} /></Labeled>}
          {isAdmin && <Labeled label="Investor / historical account"><SelectInput value={filters.userId} onChange={(e) => updateFilter("userId", e.target.value)} options={[{ value: "ALL", label: "All investor accounts" }, ...reportAccounts.map((u) => ({ value: u.id, label: `${u.name} — ${u.email}${u.role !== "INVESTOR" ? ` (${ROLE[u.role] ?? u.role}; historical)` : ""}${u.accountStatus === "DELETED" ? " (Deleted)" : u.accountStatus === "INACTIVE" ? " (Inactive)" : ""}` }))]} /></Labeled>}
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-6">
            <span className="pb-2 text-xs text-muted-foreground">Quick range:</span>
            <Button type="button" variant="outline" size="sm" onClick={() => useLastDays(29)}>Last 30 days</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => useLastDays(89)}>Last 90 days</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { const now = new Date(); setFilters((f) => ({ ...f, start: `${now.getFullYear()}-01-01`, end: dateValue(now) })); }}>Year to date</Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetFilters}><RotateCcw className="h-3.5 w-3.5" />Clear filters</Button>
          </div>
          {filters.start && filters.end && filters.start > filters.end && <p role="alert" className="text-sm text-destructive sm:col-span-2 lg:col-span-6">The start date must be on or before the end date.</p>}
        </CardContent>
      </Card>

      <div ref={reportRef} className="space-y-6 rounded-lg bg-background">
        <div className="mb-4 hidden border-b pb-3 print:block">
          <h1 className="text-xl font-bold">{isAdmin ? "AgroFund — Reports & Financials" : "AgroFund — Reports & Statements"}</h1>
          <p className="mt-1 text-sm">Account: {isAdmin ? (filters.userId === "ALL" ? "All investor accounts" : users.find((u) => u.id === filters.userId)?.email ?? "Selected investor") : `${user.name} (${user.email})`}</p>
          <p className="text-sm">Period: {filters.start || "All dates"} to {filters.end || "All dates"} | Programme: {filters.projectId === "ALL" ? "All programme activity" : projects.find((p) => p.id === filters.projectId)?.title ?? filters.projectId} | Financial project: {filters.financialProjectId === "ALL" ? "All underlying projects" : agroProjects.find((p) => p.id === filters.financialProjectId)?.title ?? filters.financialProjectId} | Type: {filters.type === "ALL" ? "All types" : TX_TYPE[filters.type] ?? filters.type} | Status: {filters.status}</p>
          <p className="text-xs">Prepared {fmtDateTime(new Date().toISOString())} · Amounts in Bangladeshi Taka (BDT)</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => <StatCard key={stat.label} {...stat} />)}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
          <Card>
            <CardHeader><CardTitle className="text-base">Monthly settled activity</CardTitle><p className="text-sm text-muted-foreground">Deposits, investment debits, payouts, and withdrawals by transaction month.</p></CardHeader>
            <CardContent className="h-80">
              {chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 5, right: 10, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis dataKey="month" fontSize={11} tick={{ fill: "currentColor" }} />
                <YAxis width={64} fontSize={11} tick={{ fill: "currentColor" }} tickFormatter={compactTaka} />
                <Tooltip formatter={(v) => formatBDT(Math.round(Number(v) * 100))} />
                <Legend />
                <Bar dataKey="depositsTaka" name="Deposits" fill="#0f766e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="investedTaka" name="Invested" fill="#64748b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="payoutsTaka" name="Programme payouts" fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="withdrawalsTaka" name="Withdrawals" fill="#d97706" radius={[3, 3, 0, 0]} />
              </BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No completed transactions match these filters.</div>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Reconciliation notes</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-3"><span className="mt-0.5 rounded-md bg-emerald-500/10 p-2 text-emerald-700"><FileText className="h-4 w-4" /></span><div><p className="font-medium">Settled vs. pending</p><p className="mt-1 text-muted-foreground">Summary cards and monthly chart include completed ledger entries only. Pending entries appear in the detailed table but are not treated as money already settled.</p></div></div>
              <div className="flex items-start gap-3"><span className="mt-0.5 rounded-md bg-blue-500/10 p-2 text-blue-700"><Banknote className="h-4 w-4" /></span><div><p className="font-medium">Payouts are not the same as profit</p><p className="mt-1 text-muted-foreground">A programme payout may include money returned from the original investment. Realized gain/loss is calculated as completed payout minus the invested capital for completed positions.</p></div></div>
              <div className="rounded-md border p-3"><p className="font-semibold">{bn(totals.completedCount)} settled record(s)</p><p className="mt-1 text-muted-foreground">{bn(totals.pendingCount)} transaction(s) in the current filter are pending review.</p>{isAdmin && <p className="mt-1 text-muted-foreground">Across the platform, {bn(pendingInvestmentRequests)} investment request(s) are in review, awaiting payment, or need payment attention.</p>}</div>
            </CardContent>
          </Card>
        </div>

        <section>
          <div className="mb-3"><h2 className="text-lg font-semibold">Monthly financial summary</h2><p className="text-sm text-muted-foreground">Only completed ledger entries contribute to these monthly totals.</p></div>
          <DataTable rows={monthly} empty="No monthly activity matches this date range." columns={[
            { key: "month", header: "Month" },
            { key: "deposits", header: "Deposits", className: "text-right tabular-nums", render: (r) => formatBDT(r.deposits) },
            { key: "invested", header: "Capital invested", className: "text-right tabular-nums", render: (r) => formatBDT(r.invested) },
            { key: "payouts", header: "Programme payouts", className: "text-right tabular-nums", render: (r) => formatBDT(r.payouts) },
            { key: "withdrawals", header: "Withdrawals", className: "text-right tabular-nums", render: (r) => formatBDT(r.withdrawals) },
            { key: "entries", header: "Entries", className: "text-right", render: (r) => bn(r.entries) },
          ]} />
        </section>

        {isAdmin && <section className="space-y-4">
          <div><h2 className="text-lg font-semibold">Approved project revenue and expense entries</h2><p className="text-sm text-muted-foreground">This is the operational report sourced from independently approved financial entries, filtered by the selected underlying project when chosen. Monthly operating result equals recorded revenue minus recorded expenses; it is before platform commission, capital settlement, tax, and any unrecorded items. Final programme settlement results below are a separate settlement view and must not be added to this table.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Approved revenue" value={formatBDT(financialEntryTotals.revenue)} hint="For the selected project and date range" icon={ArrowDownLeft} />
            <StatCard label="Approved expenses" value={formatBDT(financialEntryTotals.expenses)} hint="Includes approved reversal entries" icon={ArrowUpRight} />
            <StatCard label="Operating result" value={formatBDT(financialEntryTotals.operatingResult)} hint="Revenue less expense entries" icon={TrendingUp} />
            <StatCard label="Awaiting review" value={bn(financialEntryTotals.pendingCount)} hint="Pending entries excluded from totals" icon={FileText} />
          </div>
          <DataTable rows={monthlyOperationalFinance} empty="No approved project financial entries match this period." columns={[
            { key: "month", header: "Month" },
            { key: "projects", header: "Programme activities", className: "text-right", render: (r) => bn(r.projects) },
            { key: "revenue", header: "Revenue", className: "text-right tabular-nums", render: (r) => formatBDT(r.revenue) },
            { key: "expenses", header: "Expenses", className: "text-right tabular-nums", render: (r) => formatBDT(r.expenses) },
            { key: "result", header: "Operating result", className: "text-right tabular-nums", render: (r) => <span className={r.operatingResult >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>{formatBDT(r.operatingResult)}</span> },
            { key: "entries", header: "Approved entries", className: "text-right", render: (r) => bn(r.entries) },
          ]} />
          <div><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold">Financial entry register</h3><Button variant="outline" size="sm" onClick={exportFinancialCsv} disabled={!filteredFinancialEntries.length}><Download className="h-4 w-4" />Export financial entries CSV</Button></div><DataTable rows={filteredFinancialEntries} empty="No financial entries match the selected report filters." columns={[
            { key: "date", header: "Transaction date", render: (r) => fmtDate(r.transactionDate) },
            { key: "project", header: "Underlying project", render: (r) => agroProjects.find((p) => p.id === r.projectId)?.title ?? projects.find((p) => p.id === r.projectId)?.title ?? "Legacy programme-level entry" },
            { key: "type", header: "Type / category", render: (r) => <div><span className="font-medium">{r.kind === "REVENUE" ? "Revenue" : "Expense"}{r.reversalOf ? " · Reversal" : ""}</span><span className="block text-xs text-muted-foreground">{r.category?.replaceAll("_", " ")}</span></div> },
            { key: "amount", header: "Amount", className: "text-right tabular-nums", render: (r) => <span className={r.amount < 0 ? "text-red-600" : ""}>{formatBDT(r.amount)}</span> },
            { key: "reference", header: "Reference / description", render: (r) => <div className="max-w-64"><p>{r.description}</p>{r.reference && <span className="text-xs text-muted-foreground">Ref: {r.reference}</span>}</div> },
            { key: "status", header: "Review status", render: (r) => <StatusBadge status={r.status} /> },
          ]} /></div>
          <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">Pending and rejected entries stay visible for audit but are excluded from approved financial totals. To add, correct, or approve entries, use <Link className="font-medium text-primary underline" to="/admin/financial-entries">Programme Financial Entries</Link>. Approved entries are immutable; correct them through a reviewed reversal.</div>
        </section>}

        {incompleteSettlements > 0 && <div role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Some settlement results need reconciliation</p><p className="mt-1">{bn(incompleteSettlements)} programme position(s) show completed capital but do not have a complete matching payout ledger, or contain mixed active and completed positions. Realized gain/loss is withheld for those rows until the records reconcile.</p></div>}

        <section>
          <div className="mb-3"><h2 className="text-lg font-semibold">{isAdmin ? "Programme funding and realized results" : "My programme performance"}</h2><p className="text-sm text-muted-foreground">Lifetime programme position results are shown here. Date, type, and transaction-status filters affect the ledger and monthly summary only. These are lifetime position totals; the programme and investor-account filters apply.</p></div>
          <DataTable rows={performance} empty="No active or completed investment positions were found." columns={[
            { key: "project", header: "Programme", render: (r) => <div className="min-w-44"><p className="font-medium">{r.title}</p><p className="text-xs text-muted-foreground">{r.project?.status?.replaceAll("_", " ") ?? "Programme"}</p></div> },
            { key: "active", header: "Active capital", className: "text-right tabular-nums", render: (r) => formatBDT(r.activeCapital) },
            { key: "completed", header: "Capital at close-out", className: "text-right tabular-nums", render: (r) => formatBDT(r.completedCapital) },
            { key: "payout", header: "Payouts credited", className: "text-right tabular-nums", render: (r) => formatBDT(r.payoutCredited) },
            { key: "result", header: "Realized gain / loss", className: "text-right tabular-nums", render: (r) => r.realizedProfitLoss == null ? <span className="text-muted-foreground">Not realized yet</span> : <span className={r.realizedProfitLoss >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>{formatBDT(r.realizedProfitLoss)}</span> },
            { key: "return", header: "Realized return", className: "text-right tabular-nums", render: (r) => r.realizedReturnPct == null ? "—" : `${r.realizedReturnPct >= 0 ? "+" : ""}${bn(Number(r.realizedReturnPct.toFixed(2)))}%` },
          ]} />
        </section>

        {isAdmin && <section>
          <div className="mb-3"><h2 className="text-lg font-semibold">Monthly programme profit & loss</h2><p className="text-sm text-muted-foreground">This summary uses stored close-out snapshots only. Snapshots that fail arithmetic reconciliation are excluded; older records without per-investor detail remain marked as aggregate-only and are not backfilled with invented numbers.</p></div>
          <DataTable rows={monthlyCloseouts} empty="No itemized settlements match the selected period." columns={[
            { key: "month", header: "Month" },
            { key: "projects", header: "Programme settlements", className: "text-right", render: (r) => bn(r.projects) },
            { key: "sales", header: "Gross sales", className: "text-right tabular-nums", render: (r) => formatBDT(r.grossSales) },
            { key: "costs", header: "Operating costs", className: "text-right tabular-nums", render: (r) => formatBDT(r.operatingCosts) },
            { key: "commission", header: "Platform commission", className: "text-right tabular-nums", render: (r) => formatBDT(r.platformCommission) },
            { key: "net", header: "Net proceeds", className: "text-right tabular-nums", render: (r) => <b>{formatBDT(r.netProceeds)}</b> },
            { key: "gain", header: "Gain / loss vs capital", className: "text-right tabular-nums", render: (r) => <span className={r.realizedProfitLoss >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>{formatBDT(r.realizedProfitLoss)}</span> },
            { key: "detail", header: "Detail quality", render: (r) => r.detailUnavailable ? <StatusBadge status="DETAILS_UNAVAILABLE" /> : <StatusBadge status="RECONCILED" /> },
          ]} />
          <div className="mb-3 mt-6"><h2 className="text-lg font-semibold">Recorded programme settlements</h2><p className="text-sm text-muted-foreground">These are platform-level sales, operating-cost, commission, and payout snapshots. Date filters apply; investor-account, type, and transaction-status filters do not change aggregate close-out records.</p></div>
          {closeoutMismatches > 0 && <div role="alert" className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"><p className="font-semibold">{bn(closeoutMismatches)} close-out snapshot(s) failed reconciliation</p><p className="mt-1">They remain visible for investigation but are excluded from monthly profit-and-loss totals. Review the source financial records before using the figures for decisions.</p></div>}
          {closeoutsWithoutDetail > 0 && <div role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{bn(closeoutsWithoutDetail)} historical close-out record(s) do not contain per-investor payout details. Aggregate values are shown, but detailed reconciliation cannot be confirmed.</div>}
          {closeouts.length ? <DataTable rows={closeouts} empty="No close-outs recorded" columns={[ 
            { key: "project", header: "Programme", render: (r) => projects.find((p) => p.id === r.projectId)?.title ?? `Programme ${r.projectId}` },
            { key: "date", header: "Closed on", render: (r) => fmtDate(r.createdAt) },
            { key: "gross", header: "Gross sales", className: "text-right tabular-nums", render: (r) => formatBDT(r.grossSales) },
            { key: "costs", header: "Operating costs", className: "text-right tabular-nums", render: (r) => formatBDT(r.operatingCosts) },
            { key: "commission", header: "Commission", className: "text-right tabular-nums", render: (r) => formatBDT(r.platformCommission) },
            { key: "net", header: "Net proceeds", className: "text-right tabular-nums", render: (r) => <b>{formatBDT(r.netProceeds)}</b> },
            { key: "invested", header: "Capital at close-out", className: "text-right tabular-nums", render: (r) => formatBDT(r.investedCapital) },
            { key: "profit", header: "Gain / loss", className: "text-right tabular-nums", render: (r) => <span className={r.realizedProfitLoss >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-red-600"}>{formatBDT(r.realizedProfitLoss)}</span> },
            { key: "reconciliation", header: "Reconciliation", render: (r) => <div><StatusBadge status={r.reconciliation.status} />{r.reconciliation.reasons?.length > 0 && <span title={r.reconciliation.reasons.join("; ")} className="mt-1 block max-w-44 text-xs text-muted-foreground">{r.reconciliation.reasons[0]}</span>}</div> },
          ]} /> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No itemized programme settlement has been recorded with this report version yet. Historical payouts remain visible in the ledger, but their original sales and cost breakdown is not reconstructed because that evidence was not stored. Future close-outs will be recorded here automatically.</div>}
        </section>}

        <section>
          <div className="mb-3"><h2 className="text-lg font-semibold">Transaction statement</h2><p className="text-sm text-muted-foreground">{bn(rows.length)} ledger entry/entries match the selected filters. Amounts use BDT; pending entries are not included in settled summaries.</p></div>
          <DataTable rows={rows} empty="No transactions match the selected filters." columns={[
            { key: "date", header: "Date", render: (r) => fmtDateTime(r.date) },
            ...(isAdmin ? [{ key: "account", header: "Account", render: (r) => <span>{r.accountName}</span> }] : []),
            { key: "type", header: "Category", render: (r) => TX_TYPE[r.type] ?? r.type },
            { key: "project", header: "Programme / Channel", render: (r) => r.projectTitle !== "—" ? r.projectTitle : (CHANNEL[r.channel] ?? r.channel ?? "—") },
            { key: "amount", header: "Amount", className: "text-right tabular-nums", render: (r) => <span className={r.amount < 0 ? "text-red-600" : "text-emerald-700"}>{r.amount > 0 ? "+" : ""}{formatBDT(r.amount)}</span> },
            { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
            { key: "reference", header: "Reference", render: (r) => <span className="font-mono text-xs">{r.trxId || r.id}</span> },
          ]} />
        </section>
      </div>
      <p className="mt-5 text-xs text-muted-foreground">Report data is generated from the AgroFund demo ledger and stored programme settlement records. It is a management statement, not a bank confirmation, audited account, or tax advice. Production reports must be generated by the authenticated backend and reconciled against verified bank records.</p>
    </>
  );
}
