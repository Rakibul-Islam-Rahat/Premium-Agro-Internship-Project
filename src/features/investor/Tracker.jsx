import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Camera, Sprout } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import DataTable from "@/components/common/DataTable";
import { ProgressBar, SelectInput, TextInput } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LOG_TYPE } from "@/config/labels";
import { useDb } from "@/services/mock/store";
import { bn } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";

export default function Tracker() {
  const programmes = useDb((s) => s.projects ?? []);
  const projects = useDb((s) => s.agroProjects ?? []);
  const logs = useDb((s) => s.fieldLogs ?? []);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const options = useMemo(() => [...projects].filter((p) => p.status !== "ARCHIVED").sort((a, b) => a.title.localeCompare(b.title)), [projects]);
  const project = options.find((p) => p.id === params.get("project")) ?? options[0];
  const plogs = useMemo(() => logs.filter((l) => l.projectId === project?.id && (l.status === "APPROVED" || !l.status)).sort((a, b) => new Date(a.date) - new Date(b.date)), [logs, project]);
  const tags = useMemo(() => [...new Set(plogs.filter((l) => l.tag).map((l) => l.tag))], [plogs]);
  const matchingTags = tags.filter((t) => t.toLowerCase().includes(q.trim().toLowerCase().replace("#", "")));
  const tag = matchingTags[0] ?? tags[0];
  const weights = plogs.filter((l) => l.type === "WEIGHT" && l.tag === tag).map((l) => ({ date: fmtDate(l.date), kg: l.value }));
  const media = [...plogs].reverse().filter((l) => l.media?.length);
  const lastLog = plogs[plogs.length - 1];

  if (!options.length) return <><PageHeader title="Project Activity Tracker" description="Approved operational information for projects within the pooled investment programme." /><EmptyState title="No underlying projects published yet" description="Project profiles will appear after an administrator creates them." /></>;
  return <>
    <PageHeader title="Project Activity Tracker" description="Select an underlying project to inspect approved field-manager updates. Connected sessions refresh on authenticated live-update events, with a 10-second polling fallback." actions={<div className="w-64"><SelectInput aria-label="Underlying project" value={project.id} onChange={(e) => setParams({ project: e.target.value })} options={options.map((p) => ({ value: p.id, label: p.title }))} /></div>} />
    <Card className="mb-4"><CardContent className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800"><Sprout className="h-5 w-5" /></span><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Underlying project status</p><h2 className="mt-1 text-xl font-semibold">{project.title}</h2><p className="mt-1 text-sm text-muted-foreground">{project.location} · Last approved field update: {lastLog ? fmtDateTime(lastLog.reviewedAt || lastLog.date) : "No approved updates yet"}</p></div></div><div className="min-w-28 text-right"><p className="text-3xl font-bold text-primary">{bn(project.progress ?? 0)}%</p><p className="text-xs text-muted-foreground">Admin-reported progress</p><p className="mt-1 text-xs text-muted-foreground">{project.status.replaceAll("_", " ")}</p></div></div><div className="mt-4"><ProgressBar value={project.progress ?? 0} /></div><p className="mt-3 text-sm leading-5 text-muted-foreground">{project.stage || "Planning"}. Only administrator-approved field reports appear below. Pending and rejected reports are not published to investors.</p><div className="mt-4 flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link to={`/dashboard/marketplace/project/${project.id}`}>View full project details</Link></Button><Button asChild size="sm"><Link to={`/dashboard/marketplace/${programmes[0]?.id ?? ""}`}>Main investment programme</Link></Button></div></CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-2">
      {tags.length > 0 && <Card className="lg:col-span-2"><CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-base">Weight Growth Trend {tag && `— Tag #${tag}`}</CardTitle><div className="w-48"><TextInput placeholder="Search tag, e.g. C-402" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search livestock tag" /></div></CardHeader><CardContent className="h-64">{weights.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={weights}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="date" fontSize={12} /><YAxis domain={["auto", "auto"]} fontSize={12} tickFormatter={(v) => bn(v)} unit=" kg" width={70} /><Tooltip formatter={(v) => `${bn(v)} kg`} /><Line type="monotone" dataKey="kg" name="Weight" stroke="#15803d" strokeWidth={2} dot /></LineChart></ResponsiveContainer> : <EmptyState title="No weight data for the matching tag" />}</CardContent></Card>}
      <Card className={tags.length ? "" : "lg:col-span-2"}><CardHeader><CardTitle className="text-base">Approved Activity Timeline</CardTitle></CardHeader><CardContent><DataTable rows={[...plogs].reverse()} empty="No approved field updates have been published for this project yet." columns={[{ key: "d", header: "Reported", render: (l) => fmtDateTime(l.date) }, { key: "t", header: "Category", render: (l) => LOG_TYPE[l.type] ?? l.type }, { key: "n", header: "Update", render: (l) => <div className="max-w-lg whitespace-normal">{l.value != null && <b>{bn(l.value)} {l.unit} </b>}{l.note || "—"}{l.tag && <p className="mt-1 text-xs text-muted-foreground">Tag #{l.tag}</p>}</div> }, { key: "v", header: "Verified", render: (l) => l.reviewedAt ? fmtDate(l.reviewedAt) : "Admin-approved" }]} /></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Field Evidence — Photos and Attachments</CardTitle></CardHeader><CardContent>{media.length ? <div className="grid grid-cols-2 gap-3">{media.flatMap((l) => l.media.map((m, i) => <figure key={`${l.id}-${i}`} className="overflow-hidden rounded-lg border">{m.dataUrl && m.type?.startsWith("image/") ? <a href={m.dataUrl} target="_blank" rel="noreferrer"><img src={m.dataUrl} alt={m.caption ?? m.name ?? "Field report evidence"} loading="lazy" className="h-40 w-full object-cover" /></a> : <div className="flex h-40 items-center justify-center bg-muted"><Camera className="h-6 w-6 text-muted-foreground" /></div>}<figcaption className="p-2 text-xs"><b className="block">{m.caption ?? m.name ?? "Field evidence"}</b><span className="text-muted-foreground">{fmtDate(l.date)}</span></figcaption></figure>))}</div> : <EmptyState title="No photos or attachments published" description="Evidence becomes visible after an administrator approves the field report." />}</CardContent></Card>
    </div>
  </>;
}
