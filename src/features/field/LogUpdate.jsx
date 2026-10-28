import { useMemo, useState } from "react";
import PageHeader from "@/components/common/PageHeader";
import { Labeled, SelectInput, TextArea, TextInput } from "@/components/common/form";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { useAction } from "@/hooks/useAction";
import { useDb } from "@/services/mock/store";
import { api } from "@/services/api";
import { imageToDataUrl } from "@/lib/image";

const TYPES = [
  { value: "WEIGHT", label: "Livestock Weight", unit: "kg" }, { value: "FEED", label: "Feed Intake", unit: "kg/head/day" },
  { value: "HEALTH", label: "Health & Treatment", unit: "" }, { value: "STAGE", label: "Orchard/Crop Stage", unit: "" }, { value: "HARVEST", label: "Harvest Quantity", unit: "kg" },
];
const blank = { type: "WEIGHT", tag: "", value: "", note: "", files: [], notifyInvestors: true };
const readMedia = (file) => imageToDataUrl(file, { maxBytes: 240 * 1024, maxDimension: 1280 });

// Lightweight form for low-bandwidth use on a phone.
export default function LogUpdate() {
  const { user } = useAuth();
  const programmes = useDb((s) => s.projects ?? []);
  const projects = useDb((s) => s.agroProjects ?? []);
  const program = programmes[0];
  const live = useMemo(() => program?.status === "IN_PROGRESS" ? projects.filter((p) => p.status === "ACTIVE") : [], [projects, program?.status]);
  const [projectId, setProjectId] = useState("");
  const [f, setF] = useState(blank);
  const pid = projectId || live[0]?.id;
  const t = TYPES.find((x) => x.value === f.type);
  const [save, pending] = useAction(async () => {
    if (f.files.length > 3) throw new Error("Upload no more than 3 photos per report.");
    const media = await Promise.all(f.files.map(readMedia));
    await api.addFieldLog(user.id, { projectId: pid, ...f, unit: t.unit, media });
    setF(blank);
  }, "Field update submitted for admin review");
  return (
    <>
      <PageHeader title="Add Project Field Update" description="Submit measurements and evidence against a specific underlying project. Investor visibility starts only after independent administrator approval." />
      <Card className="max-w-xl"><CardContent className="space-y-4 p-5">
        {!live.length && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">No underlying projects are currently available for field updates. The main programme must be In Progress and an administrator must allocate capital and activate a project first.</div>}
        <Labeled label="Underlying project"><SelectInput value={pid} onChange={(e) => setProjectId(e.target.value)} options={live.map((p) => ({ value: p.id, label: p.title }))} /></Labeled>
        <Labeled label="Update Type"><SelectInput value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} options={TYPES} /></Labeled>
        {f.type === "WEIGHT" && <Labeled label="Livestock Tag" hint="e.g. C-402"><TextInput value={f.tag} onChange={(e) => setF({ ...f, tag: e.target.value.toUpperCase() })} /></Labeled>}
        {t.unit && <Labeled label={`Amount (${t.unit})`}><TextInput type="number" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Labeled>}
        <Labeled label="Notes"><TextArea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Labeled>
        <Labeled label="Project photos" hint="Photos are private until an administrator approves this report. Up to 3 images, 5 MB original size each; compressed before saving.">
          <input type="file" multiple accept="image/*" onChange={(e) => setF({ ...f, files: [...(e.target.files ?? [])] })} className="block w-full text-sm" />
        </Labeled>
        {f.files.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{f.files.map((x) => <li key={`${x.name}-${x.lastModified}`}>{x.name} ({Math.max(1, Math.round(x.size / 1024))} KB)</li>)}</ul>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.notifyInvestors} onChange={(e) => setF({ ...f, notifyInvestors: e.target.checked })} />Notify pooled-programme investors</label>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">This report is tied to the selected underlying project and enters <strong>Pending Review</strong>. It becomes visible to investors only after administrator approval.</div>
        <ConfirmAction triggerLabel={pending ? "Submitting…" : "Submit for Review"} disabled={pending || !live.length || !pid || (t.unit && f.value === "") || (!t.unit && !f.note)} title="Submit this field report?" description={`This ${t.label.toLowerCase()} report for ${projects.find((p) => p.id === pid)?.title ?? "the selected project"}${f.files.length ? ` includes ${f.files.length} photo(s)` : ""}. It will remain private until an administrator approves it. ${f.notifyInvestors ? "Investors will be notified after approval." : "Investors will not be notified."}`} confirmLabel="Submit field report" onConfirm={() => save()} />
      </CardContent></Card>
    </>
  );
}
