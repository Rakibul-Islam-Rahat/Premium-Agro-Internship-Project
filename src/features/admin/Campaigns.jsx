import { useEffect, useRef, useState } from "react";
import { CircleAlert, PauseCircle, PlayCircle, Save, Sprout } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/common/PageHeader";
import StatusBadge from "@/components/common/StatusBadge";
import { Labeled, TextArea, TextInput } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { useAction } from "@/hooks/useAction";
import { formatBDT } from "@/lib/money";
import { api } from "@/services/api";
import { getState, useDb } from "@/services/mock/store";

const toForm = (p) => ({
  title: p?.title ?? "Premium Agro Collective Investment Program",
  location: p?.location ?? "Bangladesh",
  description: p?.description ?? "A pooled investment programme supporting multiple approved agricultural activities.",
  bankName: p?.payment?.bankName ?? "",
  bankAccountName: p?.payment?.bankAccountName ?? "",
  bankAccountNumber: p?.payment?.bankAccountNumber ?? "",
  bankBranch: p?.payment?.bankBranch ?? "",
  bankVerified: Boolean(p?.payment?.bankVerified),
});

function ProgressEditor({ project }) {
  const { user } = useAuth();
  const [progress, setProgress] = useState(String(project.progress ?? 0));
  const [stage, setStage] = useState(project.stage ?? "Programme planning");
  useEffect(() => { setProgress(String(project.progress ?? 0)); setStage(project.stage ?? "Programme planning"); }, [project.progress, project.stage]);
  const [save, pending] = useAction(() => api.setProjectProgress(user.id, project.id, { progress: Number(progress), stage }), "Programme progress updated");
  return <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"><Labeled label="Progress (%)"><TextInput type="number" min="0" max="100" step="1" value={progress} onChange={(e) => setProgress(e.target.value)} /></Labeled><Labeled label="Current stage"><TextInput value={stage} onChange={(e) => setStage(e.target.value)} maxLength={160} /></Labeled><Button disabled={pending || !stage.trim() || !Number.isInteger(Number(progress)) || Number(progress) < 0 || Number(progress) > 100} onClick={save}>Save progress</Button></div>;
}

export default function Campaigns() {
  const { user } = useAuth();
  const projects = useDb((s) => s.projects);
  const agroProjects = useDb((s) => s.agroProjects ?? []);
  const requests = useDb((s) => s.investmentRequests ?? []);
  const investments = useDb((s) => s.investments ?? []);
  const program = projects[0];
  const [form, setForm] = useState(() => toForm(program));
  // The remote snapshot refreshes every 10 seconds. Do not let that background
  // refresh overwrite values while an administrator is editing this form.
  const formDirtyRef = useRef(false);
  const [formDirty, setFormDirty] = useState(false);
  useEffect(() => {
    if (program && !formDirtyRef.current) setForm(toForm(program));
  }, [program]);
  const set = (key) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    formDirtyRef.current = true;
    setFormDirty(true);
    setForm((current) => ({
      ...current,
      [key]: value,
      // Any receiving-bank detail edit invalidates the previous attestation.
      // The administrator must explicitly confirm the new details again.
      ...(["bankName", "bankAccountName", "bankAccountNumber", "bankBranch"].includes(key)
        ? { bankVerified: false }
        : {}),
    }));
  };
  const [save, saving] = useAction(async () => {
    await api.updateProgram(user.id, form);
    // Successful API writes refresh the remote snapshot. Now that it is saved,
    // resync from the authoritative state and allow future polling updates.
    const savedProgram = getState().projects.find((item) => item.id === program.id);
    if (savedProgram) setForm(toForm(savedProgram));
    formDirtyRef.current = false;
    setFormDirty(false);
  }, "Collective programme and bank settings saved");
  const toggleStatus = program?.status === "OPEN" || program?.status === "IN_PROGRESS" ? "PAUSED" : program?.operationsStartedAt ? "IN_PROGRESS" : "OPEN";
  const [toggle, toggling] = useAction(() => api.setProgramStatus(user.id, program.id, toggleStatus), "Programme status updated");
  const [startOperations, startingOperations] = useAction(() => api.setProgramStatus(user.id, program.id, "IN_PROGRESS"), "Programme operations started");
  const activePositions = investments.filter((investment) => investment.projectId === program?.id && investment.status === "ACTIVE").length;
  const unresolvedRequests = requests.filter((request) => request.projectId === program?.id && ["PENDING_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_PENDING", "PAYMENT_REJECTED"].includes(request.status)).length;
  const accountReady = Boolean(program?.payment?.bankVerified && program?.payment?.bankName && program?.payment?.bankAccountName && program?.payment?.bankAccountNumber);
  if (!program) return <PageHeader title="Collective Investment Programme" description="No programme record exists. Contact the system administrator." />;
  return <>
    <PageHeader title="Collective Investment Programme" description="Manage the one pooled programme. Do not create separate investable projects." />
    <Card className="mb-5"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-base">{program.title}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Every investor invests in this single programme. Programme capital may support multiple approved agro activities.</p></div><StatusBadge status={program.status} /></div></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-muted/50 p-4"><p className="text-sm text-muted-foreground">Capital raised</p><p className="mt-1 text-xl font-semibold">{formatBDT(program.raisedAmount ?? 0)}</p></div>
        <div className="rounded-lg bg-muted/50 p-4"><p className="text-sm text-muted-foreground">Programme target</p><p className="mt-1 text-xl font-semibold">{formatBDT(program.targetAmount ?? 0)}</p></div>
        <div className="rounded-lg bg-muted/50 p-4"><p className="text-sm text-muted-foreground">Return approach</p><p className="mt-1 font-semibold">Variable · not guaranteed</p></div>
        <div className="sm:col-span-3 rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">Underlying project operations</h3><p className="mt-1 text-sm text-muted-foreground">{agroProjects.filter((item) => item.status !== "ARCHIVED").length} published operational project(s). Manage each project’s details, progress, financial entries, field updates and pooled-capital allocation in the project manager.</p></div><Button asChild><Link to="/admin/projects"><Sprout className="mr-2 h-4 w-4" />Manage underlying projects</Link></Button></div></div>
      </CardContent>
    </Card>
    <Card className="mb-5"><CardHeader><CardTitle className="text-base">Programme information</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
      <Labeled label="Programme name"><TextInput value={form.title} onChange={set("title")} maxLength={120} /></Labeled>
      <Labeled label="Location"><TextInput value={form.location} onChange={set("location")} maxLength={160} /></Labeled>
      <div className="sm:col-span-2"><Labeled label="Description"><TextArea value={form.description} onChange={set("description")} rows={5} maxLength={6000} /></Labeled></div>
      <div className="sm:col-span-2 rounded-lg border p-4"><h3 className="font-semibold">Bank transfer details for investment payments</h3><p className="mb-3 mt-1 text-sm text-muted-foreground">Only bank transfer is supported. Verify the details against the organisation's real bank records before opening the programme.</p>
        <div className="grid gap-3 sm:grid-cols-2"><Labeled label="Bank name"><TextInput value={form.bankName} onChange={set("bankName")} maxLength={160} placeholder="Official receiving bank" /></Labeled><Labeled label="Account holder"><TextInput value={form.bankAccountName} onChange={set("bankAccountName")} maxLength={160} placeholder="Registered organisation name" /></Labeled><Labeled label="Account number"><TextInput value={form.bankAccountNumber} onChange={set("bankAccountNumber")} maxLength={80} placeholder="Actual bank account number" /></Labeled><Labeled label="Branch name (optional)"><TextInput value={form.bankBranch} onChange={set("bankBranch")} maxLength={160} placeholder="Branch, if available" /></Labeled></div>
        <label className="mt-4 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={form.bankVerified} onChange={set("bankVerified")} /><span><b>I have verified these receiving-account details.</b><span className="block text-muted-foreground">This is an internal confirmation, not a bank verification API.</span></span></label>
        {form.bankVerified && <p className="mt-2 flex items-center gap-2 text-sm text-amber-700"><CircleAlert className="h-4 w-4" />Confirm that the account belongs to Premium Agro before saving.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button disabled={saving || !formDirty} onClick={save}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save programme settings"}</Button><p className="text-xs text-muted-foreground">Changing bank details resets verification unless you explicitly confirm them above.</p>{formDirty && <p className="w-full text-sm text-amber-700">Unsaved changes are protected from automatic refresh. Save programme settings to apply them.</p>}</div>
    </CardContent></Card>
    <Card className="mb-5"><CardHeader><CardTitle className="text-base">Operational progress visible to investors</CardTitle></CardHeader><CardContent><ProgressEditor project={program} /></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Programme lifecycle</CardTitle></CardHeader><CardContent className="space-y-4">
      <div><p className="font-medium">{program.status === "OPEN" ? "Investment requests are open" : program.status === "IN_PROGRESS" ? "Programme operations are in progress" : program.status === "LIQUIDATED" ? "Programme completed and settled" : program.operationsStartedAt ? "Operations are paused" : "Investment requests are paused"}</p>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Requests open only before operations start and only when verified organisation bank details are saved. Once operations start, this programme cannot reopen for new investors; resolve all requests and payment reviews before transitioning.</p>
      </div>
      {program.status !== "LIQUIDATED" ? <div className="flex flex-wrap gap-3">
        {program.status === "OPEN" && <ConfirmAction triggerLabel={<><PauseCircle className="mr-2 h-4 w-4" />Pause requests</>} disabled={toggling} title="Pause investment requests?" description="New investment requests will be disabled. Existing requests and financial records remain unchanged." confirmLabel="Pause requests" onConfirm={toggle} />}
        {program.status === "PAUSED" && !program.operationsStartedAt && <ConfirmAction triggerLabel={<><PlayCircle className="mr-2 h-4 w-4" />Open investment requests</>} disabled={toggling || !accountReady} title="Open investment requests?" description="Confirm that the official bank account is correct and verified. Investors will then be able to submit requests to the single pooled programme." confirmLabel="Open requests" onConfirm={toggle} />}
        {program.status === "PAUSED" && program.operationsStartedAt && <ConfirmAction triggerLabel={<><PlayCircle className="mr-2 h-4 w-4" />Resume operations</>} disabled={toggling} title="Resume programme operations?" description="The programme will resume operations. The intake of new investor requests remains closed." confirmLabel="Resume operations" onConfirm={toggle} />}
        {program.status === "IN_PROGRESS" && <ConfirmAction triggerLabel={<><PauseCircle className="mr-2 h-4 w-4" />Pause operations</>} disabled={toggling} title="Pause programme operations?" description="Operational updates may be paused. The programme will remain closed to new investment requests." confirmLabel="Pause operations" onConfirm={toggle} />}
        {program.status === "OPEN" && <ConfirmAction triggerLabel="Start programme operations" disabled={startingOperations || activePositions === 0 || unresolvedRequests > 0} title="Start programme operations?" description={`This closes the intake of new investors for this cycle. Active investment positions: ${activePositions}. Unresolved requests or payment reviews: ${unresolvedRequests}. Resolve all pending requests and independently verify all submitted bank payments first.`} confirmLabel="Start operations" onConfirm={startOperations} />}
      </div> : <p className="rounded-lg border bg-muted/40 p-3 text-sm">This investment cycle has been settled. Start a new cycle only through a reviewed backend-supported process; do not reopen the closed ledger.</p>}
      {program.status === "OPEN" && (activePositions === 0 || unresolvedRequests > 0) && <p className="text-xs text-amber-700">Start operations is locked until at least one investment is active and all open requests/payment reviews are resolved (currently {unresolvedRequests} unresolved).</p>}
    </CardContent></Card>
  </>;
}
