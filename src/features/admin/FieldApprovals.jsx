import { useMemo, useState } from "react";
import { Check, Eye, FileImage, X } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/AuthContext";
import { useAction } from "@/hooks/useAction";
import { useDb } from "@/services/mock/store";
import { api } from "@/services/api";
import { LOG_TYPE } from "@/config/labels";
import { fmtDateTime } from "@/lib/format";

function Decision({ log, actorId }) {
  const [run, pending] = useAction((approve) => api.reviewFieldLog(actorId, log.id, approve), "Field update review saved");
  if (log.status !== "PENDING_REVIEW") return <StatusBadge status={log.status ?? "APPROVED"} />;
  return <div className="flex flex-wrap gap-2"><ConfirmAction triggerLabel="Approve" triggerIcon={Check} disabled={pending} title="Approve this field update?" description="Approving publishes these notes and photos to investors as verified programme evidence. Check that the media and notes are appropriate before publishing." confirmLabel="Approve and publish" onConfirm={() => run(true)} /><ConfirmAction triggerLabel="Reject" triggerIcon={X} triggerVariant="outline" destructive disabled={pending} title="Reject this field update?" description="Reject this evidence. It will not appear in the investor-facing programme progress feed." confirmLabel="Reject evidence" onConfirm={() => run(false)} /></div>;
}

export default function FieldApprovals() {
  const { user } = useAuth();
  const logs = useDb((s) => s.fieldLogs);
  const agroProjects = useDb((s) => s.agroProjects);
  const programmeProjects = useDb((s) => s.projects);
  // useSyncExternalStore requires stable snapshots. Build the combined list
  // after selecting stable store references, not inside the selector itself.
  const projects = useMemo(
    () => [...(agroProjects ?? []), ...(programmeProjects ?? [])],
    [agroProjects, programmeProjects],
  );
  const users = useDb((s) => s.users);
  const [viewId, setViewId] = useState(null);
  const rows = useMemo(() => [...logs].sort((a, b) => {
    const ap = a.status === "PENDING_REVIEW" ? 0 : 1;
    const bp = b.status === "PENDING_REVIEW" ? 0 : 1;
    return ap - bp || new Date(b.date) - new Date(a.date);
  }), [logs]);
  const selected = rows.find((l) => l.id === viewId);
  const projectTitle = (id) => projects.find((p) => p.id === id)?.title ?? id;
  const userName = (id) => users.find((u) => u.id === id)?.name ?? "Field manager";
  return <>
    <PageHeader title="Field Evidence Review" description="All photos and field notes remain hidden from investors until an administrator approves them." />
    <DataTable rows={rows} empty="No field reports have been submitted." columns={[
      { key: "date", header: "Submitted", render: (l) => fmtDateTime(l.date) },
      { key: "project", header: "Underlying project", render: (l) => <b>{projectTitle(l.projectId)}</b> },
      { key: "author", header: "Submitted by", render: (l) => userName(l.loggedBy) },
      { key: "type", header: "Update type", render: (l) => LOG_TYPE[l.type] ?? l.type },
      { key: "summary", header: "Notes", render: (l) => <span className="block max-w-xs truncate">{l.note || (l.media?.length ? `${l.media.length} attachment(s)` : "No notes")}</span> },
      { key: "evidence", header: "Evidence", render: (l) => <Button size="sm" variant="outline" onClick={() => setViewId(l.id)}><Eye className="mr-1 h-3.5 w-3.5" />Review ({l.media?.length ?? 0})</Button> },
      { key: "status", header: "Decision", render: (l) => <Decision log={l} actorId={user.id} /> },
    ]} />
    <Dialog open={!!selected} onOpenChange={(open) => !open && setViewId(null)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {selected && <><DialogHeader><DialogTitle>{projectTitle(selected.projectId)}</DialogTitle><DialogDescription>{LOG_TYPE[selected.type] ?? selected.type} · submitted by {userName(selected.loggedBy)} · {fmtDateTime(selected.date)}</DialogDescription></DialogHeader>
          <div className="mb-4 rounded-xl border bg-muted/20 p-4 text-sm"><p><strong>Notes:</strong> {selected.note || "No notes provided."}</p>{selected.tag && <p className="mt-1"><strong>Tag:</strong> {selected.tag}</p>}{selected.value != null && <p className="mt-1"><strong>Measurement:</strong> {selected.value} {selected.unit}</p>}</div>
          {selected.media?.length ? <div className="grid gap-3 sm:grid-cols-2">{selected.media.map((m, i) => <div key={`${selected.id}-${i}`} className="overflow-hidden rounded-xl border bg-background">{m.dataUrl && m.type?.startsWith("image/") ? <a href={m.dataUrl} target="_blank" rel="noreferrer"><img src={m.dataUrl} alt={m.caption ?? m.name ?? "Field evidence"} className="max-h-80 w-full object-contain bg-muted" /></a> : m.dataUrl && m.type === "application/pdf" ? <a href={m.dataUrl} target="_blank" rel="noreferrer" className="flex h-36 items-center justify-center gap-2 text-sm font-semibold text-primary"><FileImage className="h-5 w-5" />Open PDF: {m.name ?? m.caption}</a> : <div className="flex h-36 items-center justify-center bg-muted text-sm text-muted-foreground">{m.caption ?? m.name ?? "Attachment details unavailable"}</div>}<p className="p-3 text-xs text-muted-foreground">{m.caption ?? m.name ?? `Attachment ${i + 1}`}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No attachments were included with this update.</p>}
          {selected.status === "PENDING_REVIEW" && <div className="mt-5 flex justify-end gap-2"><ReviewFooter log={selected} actorId={user.id} after={() => setViewId(null)} /></div>}
        </>}
      </DialogContent>
    </Dialog>
  </>;
}

function ReviewFooter({ log, actorId, after }) {
  const [run, pending] = useAction((approve) => api.reviewFieldLog(actorId, log.id, approve), "Field update review saved");
  const decide = async (approve) => { const ok = await run(approve); if (ok) after(); return ok; };
  return <><ConfirmAction triggerLabel="Reject evidence" triggerIcon={X} triggerVariant="outline" destructive disabled={pending} title="Reject this field update?" description="This prevents these notes and photos from becoming visible to investors." confirmLabel="Reject evidence" onConfirm={() => decide(false)} /><ConfirmAction triggerLabel="Approve and publish" triggerIcon={Check} disabled={pending} title="Publish verified field evidence?" description="This makes the field update visible to investors as approved programme evidence." confirmLabel="Approve and publish" onConfirm={() => decide(true)} /></>;
}
