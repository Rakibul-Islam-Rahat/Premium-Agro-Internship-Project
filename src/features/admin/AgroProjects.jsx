import { useMemo, useState, useEffect } from "react";
import { Archive, Check, ClipboardList, Edit3, Plus, Save, Trash2, X } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import StatusBadge from "@/components/common/StatusBadge";
import DataTable from "@/components/common/DataTable";
import { Labeled, ProgressBar, SelectInput, TextArea, TextInput } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { useAction } from "@/hooks/useAction";
import { useDb } from "@/services/mock/store";
import { api } from "@/services/api";
import { formatBDT, toMinor, bn } from "@/lib/money";
import { fmtDate } from "@/lib/format";

const CATEGORIES = [
  { value: "LIVESTOCK", label: "Livestock" }, { value: "ORCHARD", label: "Orchards / fruit" },
  { value: "CROPS", label: "Seasonal crops" }, { value: "DAIRY", label: "Dairy / animal rearing" },
  { value: "AQUACULTURE", label: "Aquaculture" }, { value: "OTHER", label: "Other approved agro activity" },
];
const emptyForm = () => ({ title: "", category: "LIVESTOCK", location: "", summary: "", description: "", startDate: "", expectedEndDate: "" });
const formOf = (p) => ({ title: p.title ?? "", category: p.category ?? "OTHER", location: p.location ?? "", summary: p.summary ?? "", description: p.description ?? "", startDate: p.startDate ?? "", expectedEndDate: p.expectedEndDate ?? "" });
const isDateOrderValid = (f) => !f.startDate || !f.expectedEndDate || f.expectedEndDate >= f.startDate;

function ProjectProgressEditor({ project, actorId }) {
  const [progress, setProgress] = useState(String(project.progress ?? 0));
  const [stage, setStage] = useState(project.stage ?? "Planning");
  useEffect(() => { setProgress(String(project.progress ?? 0)); setStage(project.stage ?? "Planning"); }, [project.id, project.progress, project.stage]);
  const [save, pending] = useAction(() => api.setAgroProjectProgress(actorId, project.id, { progress: Number(progress), stage }), "Project progress updated");
  return <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end">
    <Labeled label="Progress (%)"><TextInput type="number" min="0" max="100" step="1" value={progress} onChange={(e) => setProgress(e.target.value)} /></Labeled>
    <Labeled label="Current stage"><TextInput value={stage} onChange={(e) => setStage(e.target.value)} maxLength={160} /></Labeled>
    <Button variant="outline" disabled={pending || !stage.trim() || !Number.isInteger(Number(progress)) || Number(progress) < 0 || Number(progress) > 100} onClick={save}><Save className="mr-2 h-4 w-4" />Save progress</Button>
  </div>;
}

function ProjectCard({ project, fundingRows, financialEntries, programme, actor, onEdit }) {
  const allocated = fundingRows.filter((x) => x.projectId === project.id && x.status === "APPROVED").reduce((n, x) => n + Number(x.amount || 0), 0);
  const pendingFunding = fundingRows.filter((x) => x.projectId === project.id && x.status === "PENDING").reduce((n, x) => n + Number(x.amount || 0), 0);
  const hasPendingFieldReviews = useDb((s) => (s.fieldLogs ?? []).some((x) => x.projectId === project.id && x.status === "PENDING_REVIEW"));
  const hasPendingFinancialReviews = useDb((s) => (s.financialEntries ?? []).some((x) => x.projectId === project.id && x.status === "PENDING"));
  const approvedEntries = financialEntries.filter((x) => x.projectId === project.id && x.status === "APPROVED");
  const revenue = approvedEntries.filter((x) => x.kind === "REVENUE").reduce((n, x) => n + Number(x.amount || 0), 0);
  const expenses = approvedEntries.filter((x) => x.kind === "EXPENSE").reduce((n, x) => n + Number(x.amount || 0), 0);
  const nextStatuses = project.status === "PLANNING" ? ["PAUSED", ...(programme?.status === "IN_PROGRESS" && allocated > 0 ? ["ACTIVE"] : [])]
    : project.status === "ACTIVE" ? ["PAUSED", "COMPLETED"]
      : project.status === "PAUSED" ? ["COMPLETED", ...(programme?.status === "IN_PROGRESS" && allocated > 0 ? ["ACTIVE"] : [])] : [];
  const [setStatus, changingStatus] = useAction((status) => api.setAgroProjectStatus(actor.id, project.id, status), "Project status updated");
  const [deleteProject, deleting] = useAction(() => api.deleteAgroProject(actor.id, project.id), "Project deleted");
  const [archiveProject, archiving] = useAction(() => api.archiveAgroProject(actor.id, project.id), "Project archived; reporting history retained");
  const [fundAmount, setFundAmount] = useState("");
  const [fundNote, setFundNote] = useState("");
  const [requestFunding, fundingPending] = useAction(async () => {
    const amount = toMinor(fundAmount);
    if (!Number.isSafeInteger(amount) || amount < 100000) throw new Error("Enter at least ৳1,000, with no more than two decimal places.");
    await api.requestProjectFunding(actor.id, project.id, amount, fundNote);
    setFundAmount(""); setFundNote("");
  }, "Capital allocation proposal submitted for independent review");
  return <Card className="overflow-hidden">
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-base">{project.title}</CardTitle><StatusBadge status={project.status} /></div>
          <p className="mt-1 text-sm text-muted-foreground">{project.category?.replaceAll("_", " ")} · {project.location}</p>
          {project.summary && <p className="mt-2 text-sm">{project.summary}</p>}
        </div>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={["COMPLETED", "ARCHIVED"].includes(project.status)} onClick={() => onEdit(project)}><Edit3 className="mr-1.5 h-3.5 w-3.5" />Edit</Button>
          {project.status !== "ARCHIVED" && <ConfirmAction triggerLabel={<><Archive className="mr-1.5 h-3.5 w-3.5" />Archive</>} triggerVariant="outline" disabled={archiving || project.status === "ACTIVE" || hasPendingFieldReviews || hasPendingFinancialReviews || pendingFunding > 0} title="Archive this underlying project?" description={project.status === "ACTIVE" ? "Pause the active project first. This prevents an operating project from disappearing from the current project directory." : "The project will be hidden from the active investor project directory. Resolve every pending field, financial and funding review first. Its completed reports, capital allocations and audit history will be retained."} confirmLabel="Archive project" onConfirm={archiveProject} />}
          <ConfirmAction triggerLabel={<><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete</>} triggerVariant="destructive" destructive disabled={deleting || ["ACTIVE", "COMPLETED"].includes(project.status)} title="Delete this project permanently?" description="Deletion is allowed only when the project has no field logs, financial entries or capital-allocation history. If history exists, the server will reject deletion; archive the project instead." confirmLabel="Delete project" onConfirm={deleteProject} />
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Approved capital allocated</p><p className="mt-1 font-semibold">{formatBDT(allocated)}</p>{pendingFunding > 0 && <p className="mt-1 text-xs text-amber-700">{formatBDT(pendingFunding)} awaiting review</p>}</div>
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Approved revenue</p><p className="mt-1 font-semibold">{formatBDT(revenue)}</p></div>
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Approved expenses</p><p className="mt-1 font-semibold">{formatBDT(expenses)}</p></div>
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Operating result</p><p className={`mt-1 font-semibold ${revenue - expenses >= 0 ? "text-emerald-700" : "text-red-600"}`}>{formatBDT(revenue - expenses)}</p></div>
      </div>
      <div><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-medium">{project.stage || "Planning"}</span><span className="text-muted-foreground">{bn(project.progress ?? 0)}%</span></div><ProgressBar value={project.progress ?? 0} /><p className="mt-2 text-xs text-muted-foreground">{project.startDate ? `Start: ${fmtDate(project.startDate)}` : "Start date not set"} · {project.expectedEndDate ? `Expected end: ${fmtDate(project.expectedEndDate)}` : "End date not set"}</p></div>
      {nextStatuses.length > 0 && <div className="flex flex-wrap items-center gap-2 border-t pt-4"><span className="mr-1 text-sm font-medium">Project lifecycle:</span>{nextStatuses.map((status) => <ConfirmAction key={status} triggerLabel={status === "ACTIVE" ? "Activate project" : status === "PAUSED" ? "Pause project" : "Mark completed"} triggerVariant={status === "ACTIVE" ? "default" : "outline"} disabled={changingStatus} title={`${status === "ACTIVE" ? "Activate" : status === "PAUSED" ? "Pause" : "Complete"} ${project.title}?`} description={status === "ACTIVE" ? "This project will become active for field updates after the pooled programme has started and capital has been approved." : status === "PAUSED" ? "New field updates will be disabled while this project is paused. Existing history is retained." : "Completion is final. Resolve pending field updates, financial entries and funding reviews first. Historical reports remain available."} confirmLabel={`${status === "ACTIVE" ? "Activate" : status === "PAUSED" ? "Pause" : "Mark completed"} project`} onConfirm={() => setStatus(status)} />)}</div>}
      {!(["COMPLETED", "ARCHIVED"].includes(project.status)) && <><div className="border-t pt-4"><h3 className="mb-3 flex items-center gap-2 font-semibold"><ClipboardList className="h-4 w-4" />Project progress detail</h3><ProjectProgressEditor project={project} actorId={actor.id} /></div>
        <div className="rounded-lg border p-4"><h3 className="font-semibold">Propose pooled-capital allocation</h3><p className="mb-3 mt-1 text-sm text-muted-foreground">This requests an earmark from active programme capital. It does not initiate a bank transfer. A different administrator must approve it.</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"><Labeled label="Amount (BDT)"><TextInput type="number" min="1000" step="0.01" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} placeholder="e.g. 250000" /></Labeled><Labeled label="Allocation note"><TextInput value={fundNote} onChange={(e) => setFundNote(e.target.value)} maxLength={1000} placeholder="Purpose, period or approved work package" /></Labeled><Button disabled={fundingPending || programme?.status !== "IN_PROGRESS" || !fundAmount || !Number.isFinite(Number(fundAmount)) || toMinor(fundAmount) < 100000} onClick={requestFunding}>Propose allocation</Button></div>
          {programme?.status !== "IN_PROGRESS" && <p className="mt-2 text-xs text-amber-700">Capital allocation is available only after pooled programme operations start.</p>}
        </div></>}
    </CardContent>
  </Card>;
}

function FundingReview({ allocation, project, users, actor, onReview }) {
  const [reason, setReason] = useState("");
  const [approve, approving] = useAction(() => onReview(allocation, true, ""), "Capital allocation approved");
  const [reject, rejecting] = useAction(() => onReview(allocation, false, reason), "Capital allocation rejected");
  const createdBy = users.find((u) => u.id === allocation.createdBy)?.name ?? allocation.createdBy;
  if (allocation.createdBy === actor.id) return <span className="text-xs text-muted-foreground">Waiting for a different administrator</span>;
  return <div className="min-w-52 space-y-2"><p className="text-xs text-muted-foreground">Proposed by {createdBy}</p><div className="flex gap-2"><ConfirmAction triggerLabel="Approve" triggerIcon={Check} disabled={approving || rejecting} title="Approve capital allocation?" description={`Approve ${formatBDT(allocation.amount)} from the pooled programme for ${project?.title ?? "this project"}. Confirm available capital and the stated use before approval.`} confirmLabel="Approve allocation" onConfirm={approve} /><TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rejection reason" aria-label="Allocation rejection reason" maxLength={500} /></div><ConfirmAction triggerLabel="Reject" triggerIcon={X} triggerVariant="outline" destructive disabled={approving || rejecting || reason.trim().length < 5} title="Reject capital allocation?" description={`The proposed allocation for ${project?.title ?? "this project"} will not become available capital.`} confirmLabel="Reject allocation" onConfirm={reject} /></div>;
}

export default function AgroProjects() {
  const { user } = useAuth();
  const programmes = useDb((s) => s.projects);
  const projects = useDb((s) => s.agroProjects ?? []);
  const fundingRows = useDb((s) => s.projectFundingAllocations ?? []);
  const financialEntries = useDb((s) => s.financialEntries ?? []);
  const users = useDb((s) => s.users ?? []);
  const investments = useDb((s) => s.investments ?? []);
  const programme = programmes[0];
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const activeCapital = investments.filter((i) => i.projectId === programme?.id && i.status === "ACTIVE").reduce((n, i) => n + Number(i.amount || 0), 0);
  const committed = fundingRows.filter((a) => ["PENDING", "APPROVED"].includes(a.status)).reduce((n, a) => n + Number(a.amount || 0), 0);
  const availableCapital = Math.max(0, activeCapital - committed);
  const totalApproved = fundingRows.filter((a) => a.status === "APPROVED").reduce((n, a) => n + Number(a.amount || 0), 0);
  const [saveProject, saving] = useAction(async () => {
    if (!isDateOrderValid(form)) throw new Error("Expected end date must be on or after the start date.");
    if (editingId) await api.updateAgroProject(user.id, editingId, form);
    else await api.createAgroProject(user.id, form);
    setForm(emptyForm()); setEditingId(null);
  }, editingId ? "Project details saved" : "Underlying project added to the pooled programme");
  const [reviewFunding, reviewingFunding] = useAction((allocation, approve, note) => api.reviewProjectFunding(user.id, allocation.id, approve, note), "Capital allocation review saved");
  const beginEdit = (project) => { setEditingId(project.id); setForm(formOf(project)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancelEdit = () => { setEditingId(null); setForm(emptyForm()); };
  const sortedProjects = useMemo(() => [...projects].sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0) - new Date(a.updatedAt ?? a.createdAt ?? 0)), [projects]);
  const pendingAllocations = fundingRows.filter((x) => x.status === "PENDING").sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return <>
    <PageHeader title="Underlying Agro Projects" description="Manage operational projects within the one pooled Premium Agro investment programme. Investors never invest in these projects separately." />
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl border bg-background p-4"><p className="text-sm text-muted-foreground">Pooled programme active capital</p><p className="mt-1 text-xl font-semibold">{formatBDT(activeCapital)}</p></div>
      <div className="rounded-xl border bg-background p-4"><p className="text-sm text-muted-foreground">Allocated to projects</p><p className="mt-1 text-xl font-semibold">{formatBDT(totalApproved)}</p></div>
      <div className="rounded-xl border bg-background p-4"><p className="text-sm text-muted-foreground">Available, not yet committed</p><p className="mt-1 text-xl font-semibold">{formatBDT(availableCapital)}</p><p className="mt-1 text-xs text-muted-foreground">Pending allocations reserve capacity</p></div>
      <div className="rounded-xl border bg-background p-4"><p className="text-sm text-muted-foreground">Underlying projects</p><p className="mt-1 text-xl font-semibold">{bn(projects.filter((p) => p.status !== "ARCHIVED").length)}</p></div>
    </div>

    <Card className="mb-6"><CardHeader><CardTitle className="flex items-center gap-2 text-base">{editingId ? <Edit3 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editingId ? "Edit underlying project" : "Create an underlying project"}</CardTitle><p className="text-sm text-muted-foreground">Create a project record for operational visibility, field updates and per-project reporting. This never creates a separate investor investment product.</p></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Project name"><TextInput value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} maxLength={160} placeholder="e.g. Gazipur Dairy Unit" /></Labeled>
        <Labeled label="Category"><SelectInput value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} options={CATEGORIES} /></Labeled>
        <Labeled label="Location"><TextInput value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} maxLength={200} placeholder="District, upazila or farm name" /></Labeled>
        <Labeled label="Short summary"><TextInput value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} maxLength={300} placeholder="Quick investor-facing summary" /></Labeled>
        <Labeled label="Start date (optional)"><TextInput type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} /></Labeled>
        <Labeled label="Expected end date (optional)"><TextInput type="date" min={form.startDate || undefined} value={form.expectedEndDate} onChange={(e) => setForm((f) => ({ ...f, expectedEndDate: e.target.value }))} /></Labeled>
        <div className="sm:col-span-2"><Labeled label="Full project description"><TextArea rows={5} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} maxLength={6000} placeholder="Describe objectives, operating plan, key milestones, risks, evidence and expected activities." /></Labeled></div>
        <div className="flex flex-wrap gap-2 sm:col-span-2"><Button disabled={saving || form.title.trim().length < 3 || form.location.trim().length < 2 || form.description.trim().length < 20 || !isDateOrderValid(form)} onClick={saveProject}><Save className="mr-2 h-4 w-4" />{saving ? "Saving…" : editingId ? "Save project details" : "Create project"}</Button>{editingId && <Button variant="outline" disabled={saving} onClick={cancelEdit}>Cancel edit</Button>}</div>
      </CardContent>
    </Card>

    <div className="mb-3"><h2 className="text-lg font-semibold">Project catalogue</h2><p className="text-sm text-muted-foreground">Use Archive to preserve a project's history. Permanent deletion is intentionally blocked after related field, financial or allocation records exist.</p></div>
    <div className="mb-7 space-y-4">{sortedProjects.length ? sortedProjects.map((project) => <ProjectCard key={project.id} project={project} fundingRows={fundingRows} financialEntries={financialEntries} programme={programme} actor={user} onEdit={beginEdit} />) : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No underlying projects yet. Create the first project above.</div>}</div>

    <Card><CardHeader><CardTitle className="text-base">Capital allocation approvals</CardTitle><p className="text-sm text-muted-foreground">A separate active administrator must approve each proposal. A person may not approve their own proposal.</p></CardHeader><CardContent>
      {pendingAllocations.length ? <DataTable rows={pendingAllocations} empty="No pending allocations." columns={[
        { key: "project", header: "Underlying project", render: (a) => projects.find((p) => p.id === a.projectId)?.title ?? a.projectId },
        { key: "amount", header: "Proposed amount", render: (a) => <b>{formatBDT(a.amount)}</b> },
        { key: "note", header: "Purpose", render: (a) => a.note || "—" },
        { key: "created", header: "Submitted", render: (a) => fmtDate(a.createdAt) },
        { key: "review", header: "Decision", render: (a) => <FundingReview allocation={a} project={projects.find((p) => p.id === a.projectId)} users={users} actor={user} onReview={reviewFunding} /> },
      ]} /> : <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No capital allocation proposals awaiting review.</p>}
      <h3 className="mb-3 mt-6 font-semibold">Allocation history</h3>
      <DataTable rows={[...fundingRows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))} empty="No capital has been proposed or allocated yet." columns={[
        { key: "project", header: "Underlying project", render: (a) => projects.find((p) => p.id === a.projectId)?.title ?? a.projectId },
        { key: "amount", header: "Amount", render: (a) => formatBDT(a.amount) },
        { key: "status", header: "Status", render: (a) => <StatusBadge status={a.status} /> },
        { key: "created", header: "Submitted", render: (a) => fmtDate(a.createdAt) },
        { key: "reviewed", header: "Reviewed by", render: (a) => users.find((u) => u.id === a.reviewedBy)?.name ?? (a.reviewedBy ? a.reviewedBy : "—") },
      ]} />
    </CardContent></Card>
  </>;
}
