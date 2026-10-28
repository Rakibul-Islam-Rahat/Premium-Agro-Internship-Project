import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, FileCheck2, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import StatCard from "@/components/common/StatCard";
import { Labeled, SelectInput, TextArea, TextInput } from "@/components/common/form";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { useAction } from "@/hooks/useAction";
import { useDb } from "@/services/mock/store";
import { api } from "@/services/api";
import { filterFinancialEntries, summarizeFinancialEntries } from "@/lib/reports";
import { formatBDT, toMinor } from "@/lib/money";
import { fmtDate } from "@/lib/format";

const REVENUE_CATEGORIES = [
  { value: "PRODUCT_SALES", label: "Primary product sales" },
  { value: "BYPRODUCT_SALES", label: "By-product sales" },
  { value: "SUBSIDY", label: "Grant / subsidy" },
  { value: "OTHER_REVENUE", label: "Other revenue" },
];
const EXPENSE_CATEGORIES = [
  { value: "FEED", label: "Feed" }, { value: "SEEDS_PLANTS", label: "Seeds / plants" },
  { value: "FERTILIZER", label: "Fertilizer / crop inputs" }, { value: "VETERINARY", label: "Veterinary / treatment" },
  { value: "LABOR", label: "Labor" }, { value: "TRANSPORT", label: "Transport" },
  { value: "EQUIPMENT", label: "Equipment / repairs" }, { value: "IRRIGATION", label: "Water / irrigation" },
  { value: "UTILITIES", label: "Utilities" }, { value: "RENT", label: "Rent / land use" },
  { value: "OTHER_EXPENSE", label: "Other expense" },
];
const CATEGORIES = [...REVENUE_CATEGORIES, ...EXPENSE_CATEGORIES];
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const blankForm = () => ({ projectId: "", mode: "STANDARD", kind: "REVENUE", category: "PRODUCT_SALES", amount: "", transactionDate: today(), reference: "", description: "", reversalOf: "" });
const categoryLabel = (value) => CATEGORIES.find((item) => item.value === value)?.label ?? value ?? "—";

function ReviewControls({ entry, user, projectName, onReview }) {
  const [reason, setReason] = useState("");
  const isOwnEntry = entry.createdBy === user.id;
  const [approve, approving] = useAction(() => onReview(entry, true, ""), "Financial entry approved and included in reports");
  const [reject, rejecting] = useAction(() => onReview(entry, false, reason), "Financial entry rejected");
  if (isOwnEntry) return <span className="text-xs text-muted-foreground">Independent review required</span>;
  return <div className="min-w-56 space-y-2">
    <ConfirmAction triggerLabel="Approve" triggerVariant="default" disabled={approving || rejecting} title="Approve this financial entry?" description={`Approve ${formatBDT(entry.amount)} for ${projectName}. Approved records immediately affect operating reports and settlement totals. Verify the programme, date, category, reference, and evidence first.`} confirmLabel="Approve entry" onConfirm={approve} />
    <div className="space-y-1.5">
      <TextInput aria-label="Rejection reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason required to reject" maxLength={500} />
      <ConfirmAction triggerLabel="Reject" triggerVariant="destructive" disabled={approving || rejecting || reason.trim().length < 5} title="Reject this financial entry?" description={`The entry for ${projectName} will not affect approved report totals. The submitter will receive your reason: “${reason.trim()}”.`} confirmLabel="Reject entry" destructive onConfirm={reject} />
    </div>
  </div>;
}

export default function FinancialEntries() {
  const { user } = useAuth();
  const programmes = useDb((s) => s.projects ?? []);
  const agroProjects = useDb((s) => s.agroProjects ?? []);
  const allProjects = [...agroProjects, ...programmes];
  const mainProgramme = programmes[0];
  const users = useDb((s) => s.users);
  const entries = useDb((s) => s.financialEntries);
  const allocations = useDb((s) => s.projectAllocations);
  const [form, setForm] = useState(() => blankForm());
  const [evidence, setEvidence] = useState(null);
  const [evidenceKey, setEvidenceKey] = useState(0);
  const clearEvidence = () => { setEvidence(null); setEvidenceKey((key) => key + 1); };
  const [filters, setFilters] = useState({ projectId: "ALL", status: "ALL", kind: "ALL", start: "", end: "" });

  const openProjects = useMemo(() => agroProjects.filter((project) => !["COMPLETED", "ARCHIVED"].includes(project.status)), [agroProjects]);
  const projectId = form.projectId || openProjects[0]?.id || "";
  const currentProject = agroProjects.find((p) => p.id === projectId);
  // Settlement belongs to the pooled programme, not to an individual operating project.
  const projectSettled = allocations.some((a) => a.projectId === mainProgramme?.id);
  const reversibleEntries = useMemo(() => (entries ?? []).filter((entry) => {
    if (entry.projectId !== projectId || entry.status !== "APPROVED" || entry.reversalOf || projectSettled) return false;
    const alreadyReversed = (entries ?? []).filter((r) => r.reversalOf === entry.id && r.status !== "REJECTED").reduce((total, r) => total + Math.abs(Number(r.amount) || 0), 0);
    return Number(entry.amount) - alreadyReversed > 0;
  }), [entries, projectId, projectSettled]);
  const originalForReversal = reversibleEntries.find((entry) => entry.id === form.reversalOf);
  const availableCategories = form.mode === "REVERSAL" && originalForReversal
    ? [{ value: originalForReversal.category, label: categoryLabel(originalForReversal.category) }]
    : (form.kind === "REVENUE" ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES);
  const filtered = useMemo(() => filterFinancialEntries(entries ?? [], filters).filter((entry) => filters.kind === "ALL" || entry.kind === filters.kind), [entries, filters]);
  const stats = useMemo(() => summarizeFinancialEntries(entries ?? []), [entries]);
  const approvedForProject = useMemo(() => (entries ?? []).filter((entry) => entry.projectId === projectId && entry.status === "APPROVED"), [entries, projectId]);
  const totalFor = (kind) => approvedForProject.filter((entry) => entry.kind === kind).reduce((total, entry) => total + Number(entry.amount), 0);
  const remainingOnOriginal = originalForReversal ? Number(originalForReversal.amount) - (entries ?? []).filter((r) => r.reversalOf === originalForReversal.id && r.status !== "REJECTED").reduce((total, r) => total + Math.abs(Number(r.amount) || 0), 0) : 0;

  const change = (key, value) => {
    if (key === "projectId" || key === "mode") clearEvidence();
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "projectId") { next.reversalOf = ""; next.amount = ""; next.reference = ""; next.description = ""; }
      if (key === "mode" && value !== current.mode) { next.reversalOf = ""; next.amount = ""; next.reference = ""; next.description = ""; }
      if (key === "kind") next.category = value === "REVENUE" ? "PRODUCT_SALES" : "FEED";
      if (key === "reversalOf") {
        const original = (entries ?? []).find((entry) => entry.id === value);
        if (original) { next.kind = original.kind; next.category = original.category; }
      }
      return next;
    });
  };

  const [create, creating] = useAction(async () => {
    await api.createFinancialEntry(user.id, {
      ...form, projectId, amount: toMinor(form.amount), evidence,
      mode: form.mode,
    });
    setForm(blankForm());
    clearEvidence();
  }, "Financial entry submitted for independent approval");
  const amountNumeric = Number(form.amount);
  const amountMinor = toMinor(form.amount);
  const amountHasAtMostTwoDecimals = Number.isFinite(amountNumeric) && Math.abs(amountNumeric * 100 - Math.round(amountNumeric * 100)) < 1e-7;
  const formInvalid = !projectId || !form.amount.trim() || !Number.isFinite(amountNumeric) || amountNumeric <= 0 || !Number.isSafeInteger(amountMinor) || !amountHasAtMostTwoDecimals || amountMinor < 1 || !form.transactionDate || form.description.trim().length < 5 || (form.mode === "REVERSAL" && (!originalForReversal || amountMinor > remainingOnOriginal));

  const readEvidence = (file) => {
    if (!file) { clearEvidence(); return; }
    const allowed = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type)) { clearEvidence(); toast.error("Choose a PNG, JPEG, WebP, or PDF evidence file."); return; }
    if (file.size > 350 * 1024) { clearEvidence(); toast.error("For local demo storage, supporting files must be 350 KB or smaller."); return; }
    const reader = new FileReader();
    reader.onload = () => setEvidence({ name: file.name, type: file.type, dataUrl: String(reader.result ?? "") });
    reader.onerror = () => toast.error("Could not read this file. Try another copy.");
    reader.readAsDataURL(file);
  };

  return <>
    <PageHeader title="Programme Financial Entries" description="Record programme revenue and expenses with evidence. Entries affect reports only after a different active administrator approves them." />
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Approved revenue" value={formatBDT(stats.revenue)} hint="Includes approved corrections" icon={ArrowDownToLine} />
      <StatCard label="Approved expenses" value={formatBDT(stats.expenses)} hint="Includes approved corrections" icon={ArrowUpFromLine} />
      <StatCard label="Approved operating result" value={formatBDT(stats.operatingResult)} hint="Revenue less expenses; before commission and settlement" icon={FileCheck2} />
      <StatCard label="Awaiting review" value={String(stats.pendingCount)} hint={`${stats.rejectedCount} rejected entry/entries`} icon={ShieldCheck} />
    </div>

    <Card className="mb-6">
      <CardHeader><CardTitle className="text-base">Record an underlying-project financial entry</CardTitle>
        <p className="text-sm text-muted-foreground">Choose the agro project this income or expense belongs to. Programme settlement rolls up approved records across all underlying projects. For corrections, create a reversal record; approved history cannot be silently edited or deleted.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {projectSettled && form.mode === "REVERSAL" && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">This programme is already settled. New reversals are blocked; use a formal post-settlement restatement process.</div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Labeled label="Underlying project"><SelectInput value={projectId} onChange={(e) => change("projectId", e.target.value)} options={openProjects.map((p) => ({ value: p.id, label: p.title }))} /></Labeled>
          <Labeled label="Entry mode"><SelectInput value={form.mode} onChange={(e) => change("mode", e.target.value)} options={[{ value: "STANDARD", label: "New revenue / expense" }, { value: "REVERSAL", label: "Correction / reversal" }]} /></Labeled>
          {form.mode === "STANDARD" ? <>
            <Labeled label="Entry type"><SelectInput value={form.kind} onChange={(e) => change("kind", e.target.value)} options={[{ value: "REVENUE", label: "Revenue / income" }, { value: "EXPENSE", label: "Expense / cost" }]} /></Labeled>
            <Labeled label="Category"><SelectInput value={form.category} onChange={(e) => change("category", e.target.value)} options={availableCategories} /></Labeled>
          </> : <>
            <Labeled label="Approved entry to reverse"><SelectInput value={form.reversalOf} onChange={(e) => change("reversalOf", e.target.value)} options={[{ value: "", label: "Select original entry" }, ...reversibleEntries.map((entry) => ({ value: entry.id, label: `${entry.kind} · ${formatBDT(entry.amount)} · ${fmtDate(entry.transactionDate)}` }))]} /></Labeled>
            <Labeled label="Entry type / category"><TextInput readOnly value={originalForReversal ? `${originalForReversal.kind} · ${categoryLabel(originalForReversal.category)}` : "Select an original entry"} /></Labeled>
          </>}
          <Labeled label={form.mode === "REVERSAL" ? "Reversal amount (BDT)" : "Amount (BDT)"}><TextInput type="number" min="0.01" step="0.01" max={form.mode === "REVERSAL" ? remainingOnOriginal / 100 : undefined} value={form.amount} onChange={(e) => change("amount", e.target.value)} placeholder="0.00" /></Labeled>
          <Labeled label="Transaction date"><TextInput type="date" value={form.transactionDate} max={today()} onChange={(e) => change("transactionDate", e.target.value)} /></Labeled>
          <Labeled label="Invoice / receipt / bank reference (optional)"><TextInput value={form.reference} maxLength={120} onChange={(e) => change("reference", e.target.value)} placeholder="Unique reference for this project" /></Labeled>
          <Labeled label="Evidence file (optional)"><TextInput key={evidenceKey} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => readEvidence(e.target.files?.[0])} className="h-auto py-2" /></Labeled>
          <div className="sm:col-span-2 lg:col-span-4"><Labeled label={form.mode === "REVERSAL" ? "Correction reason (required)" : "Description / business purpose"}><TextArea value={form.description} maxLength={500} onChange={(e) => change("description", e.target.value)} placeholder="Explain what this income or expense relates to; be specific enough for independent review." /></Labeled></div>
        </div>
        {form.mode === "REVERSAL" && originalForReversal && <p className="text-xs text-muted-foreground">Unreversed original balance: <strong>{formatBDT(remainingOnOriginal)}</strong>. Reversal amounts are recorded with the opposite sign and require a second administrator's approval.</p>}
        {evidence && <p className="text-xs text-muted-foreground">Attached: {evidence.name}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <ConfirmAction
            triggerLabel={form.mode === "REVERSAL" ? "Submit correction for review" : "Submit entry for review"}
            triggerIcon={form.mode === "REVERSAL" ? RotateCcw : FileCheck2}
            disabled={creating || formInvalid || (form.mode === "REVERSAL" && projectSettled)}
            title={form.mode === "REVERSAL" ? "Submit this financial correction?" : "Submit this underlying-project financial entry?"}
            description={`${form.mode === "REVERSAL" ? "Create a reviewed reversal of an existing approved record" : `Record ${form.kind.toLowerCase()} for ${categoryLabel(form.category)}`} for ${currentProject?.title ?? "the selected programme"}. Amount: ${formatBDT(form.mode === "REVERSAL" ? -amountMinor : amountMinor)}; transaction date: ${form.transactionDate}. This entry will not affect reports or programme settlement until a different active administrator approves it.`}
            confirmLabel="Submit for review"
            onConfirm={create}
          />
          <span className="text-xs text-muted-foreground">Maker-checker control: the person entering a record cannot approve or reject that same record.</span>
        </div>
        {!openProjects.length && <p className="text-sm text-amber-700">No eligible underlying projects are available for new financial entries. Create or reopen a project first.</p>}
      </CardContent>
    </Card>

    <Card className="mb-5">
      <CardHeader><CardTitle className="text-base">Find financial entries</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Labeled label="Underlying project"><SelectInput value={filters.projectId} onChange={(e) => setFilters((f) => ({ ...f, projectId: e.target.value }))} options={[{ value: "ALL", label: "All underlying projects" }, ...agroProjects.map((p) => ({ value: p.id, label: p.title }))]} /></Labeled>
        <Labeled label="Status"><SelectInput value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} options={[{ value: "ALL", label: "All statuses" }, { value: "PENDING", label: "Awaiting review" }, { value: "APPROVED", label: "Approved" }, { value: "REJECTED", label: "Rejected" }]} /></Labeled>
        <Labeled label="Type"><SelectInput value={filters.kind} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))} options={[{ value: "ALL", label: "Revenue and expense" }, { value: "REVENUE", label: "Revenue" }, { value: "EXPENSE", label: "Expense" }]} /></Labeled>
        <Labeled label="From date"><TextInput type="date" max={filters.end || today()} value={filters.start} onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))} /></Labeled>
        <Labeled label="To date"><TextInput type="date" min={filters.start || undefined} max={today()} value={filters.end} onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))} /></Labeled>
      </CardContent>
    </Card>

    <div className="mb-3"><h2 className="text-lg font-semibold">Underlying project financial register</h2><p className="text-sm text-muted-foreground">Each entry is attributed to one operational project. Programme profit allocation consolidates approved entries from all underlying projects. Pending and rejected entries never enter approved totals.</p></div>
    <DataTable rows={filtered} empty="No financial entries match these filters." columns={[
      { key: "date", header: "Transaction date", render: (r) => fmtDate(r.transactionDate) },
      { key: "programme", header: "Underlying project", render: (r) => allProjects.find((p) => p.id === r.projectId)?.title ?? "Legacy programme-level entry" },
      { key: "type", header: "Type / category", render: (r) => <div><span className="font-medium">{r.kind === "REVENUE" ? "Revenue" : "Expense"}{r.reversalOf ? " · Reversal" : ""}</span><span className="block text-xs text-muted-foreground">{categoryLabel(r.category)}</span></div> },
      { key: "amount", header: "Amount", className: "text-right tabular-nums", render: (r) => <span className={r.amount < 0 ? "font-medium text-red-600" : "font-medium"}>{formatBDT(r.amount)}</span> },
      { key: "description", header: "Description / reference", render: (r) => <div className="max-w-64"><p>{r.description}</p>{r.reference && <p className="mt-1 text-xs text-muted-foreground">Ref: {r.reference}</p>}{r.evidence && <a className="mt-1 inline-block text-xs text-primary underline" href={r.evidence.dataUrl} target="_blank" rel="noreferrer">View {r.evidence.name}</a>}{r.reversalOf && <p className="mt-1 text-xs text-muted-foreground">Reverses {r.reversalOf}</p>}</div> },
      { key: "submitted", header: "Submitted by", render: (r) => users.find((u) => u.id === r.createdBy)?.name ?? "Former account" },
      { key: "status", header: "Status", render: (r) => <div><StatusBadge status={r.status} />{r.reviewNote && <span className="mt-1 block max-w-40 text-xs text-muted-foreground">{r.reviewNote}</span>}{r.reviewedBy && <span className="mt-1 block text-xs text-muted-foreground">By {users.find((u) => u.id === r.reviewedBy)?.name ?? "Former admin"}</span>}</div> },
      { key: "review", header: "Review action", render: (r) => r.status !== "PENDING" ? "—" : <ReviewControls entry={r} user={user} projectName={allProjects.find((p) => p.id === r.projectId)?.title ?? "underlying project"} onReview={(entry, decision, note) => api.reviewFinancialEntry(user.id, entry.id, decision, note)} /> },
    ]} />

    <div className="mt-5 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground"><strong className="text-foreground">Settlement rule:</strong> Profit Allocation consolidates and reconciles approved revenue and expense entries across every underlying project and any legacy programme-level records. Pending entries anywhere in the programme block close-out. After the programme is settled, new entries and reversals are blocked; use a formal restatement workflow for post-settlement corrections.</div>
  </>;
}
