import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Banknote, CheckCircle2, ShieldCheck, Sprout } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import StatusBadge from "@/components/common/StatusBadge";
import { Labeled, ProgressBar, TextInput } from "@/components/common/form";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAction } from "@/hooks/useAction";
import { useDb } from "@/services/mock/store";
import { api } from "@/services/api";
import { formatBDT, toMinor, bn, pct } from "@/lib/money";
import { fmtDate } from "@/lib/format";
import { useAuth } from "@/features/auth/AuthContext";

export default function ProjectDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const projects = useDb((s) => s.projects);
  const agroProjects = useDb((s) => s.agroProjects ?? []);
  const p = useMemo(() => projects.find((x) => x.id === id), [projects, id]);
  const [amount, setAmount] = useState("10000");
  const valueMinor = toMinor(amount || 0);
  const verified = user.kyc.status === "VERIFIED";
  const [submit, pending] = useAction(async () => {
    await api.createInvestmentRequest(user.id, p.id, valueMinor);
    nav("/dashboard/requests");
  }, "Investment request submitted. Payment is available only after approval.");
  if (!p || p.id !== projects[0]?.id) return <p>This programme could not be found. <Link className="underline" to="/dashboard/marketplace">Return to the collective programme</Link></p>;
  const target = Number(p.targetAmount) || 0;
  const raised = Number(p.raisedAmount) || 0;
  const fundingProgress = target > 0 ? Math.min(100, raised / target * 100) : 0;
  let problem = null;
  if (!verified) problem = "Identity verification must be approved before submitting an investment request.";
  else if (!Number.isFinite(Number(amount)) || valueMinor < 100000 || valueMinor > 5000000000) problem = "Enter an amount between ৳1,000 and ৳50,000,000.";
  else if (Math.abs(Number(amount) * 100 - valueMinor) > 0.0001) problem = "Use no more than two decimal places.";
  else if (p.status !== "OPEN") problem = "The programme is not currently accepting requests.";
  return <>
    <PageHeader title={p.title} description={`${p.location} · One pooled programme covering the activities listed below.`} actions={<StatusBadge status={p.status} />} />
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Sprout className="h-4 w-4 text-primary" />Programme overview</CardTitle></CardHeader><CardContent className="space-y-4 text-sm"><p className="leading-6">{p.description}</p><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Current programme stage</dt><dd className="mt-1 font-medium">{p.stage}</dd></div><div><dt className="text-xs text-muted-foreground">Last updated</dt><dd className="mt-1 font-medium">{p.progressUpdatedAt ? fmtDate(p.progressUpdatedAt) : "Based on current programme plan"}</dd></div><div><dt className="text-xs text-muted-foreground">Operational progress</dt><dd className="mt-1 font-medium">{bn(p.progress ?? 0)}%</dd></div><div><dt className="text-xs text-muted-foreground">Indicative timeline</dt><dd className="mt-1 font-medium">{fmtDate(p.startDate)} — {fmtDate(p.harvestDate)}</dd></div></dl><ProgressBar value={p.progress ?? 0} /></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Underlying agro projects</CardTitle><p className="text-sm text-muted-foreground">These are operational units within the pooled programme. You invest in the main programme, not into each project separately.</p></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{agroProjects.filter((item) => item.status !== "ARCHIVED").map((item) => <div key={item.id} className="rounded-lg border p-3"><div className="flex items-start justify-between gap-2"><p className="font-semibold">{item.title}</p><StatusBadge status={item.status} /></div><p className="mt-1 text-sm leading-5 text-muted-foreground">{item.summary || item.description}</p><p className="mt-2 text-xs text-muted-foreground">{item.location} · {bn(item.progress ?? 0)}% · {item.stage || "Planning"}</p><Link className="mt-3 inline-flex items-center text-sm font-medium text-primary underline" to={`/dashboard/marketplace/project/${item.id}`}>View project detail <ArrowRight className="ml-1 h-4 w-4" /></Link></div>)}{!agroProjects.some((item) => item.status !== "ARCHIVED") && <p className="text-sm text-muted-foreground">Operational project details will appear here when published by Premium Agro.</p>}</CardContent></Card>
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20"><CardContent className="flex gap-3 p-4 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p>Returns are performance-based and are not guaranteed. You may receive less than your invested amount or lose capital. Investment requests are reviewed before any payment is due.</p></CardContent></Card>
      </div>
      <Card className="h-fit lg:sticky lg:top-20"><CardHeader><CardTitle className="text-base">Request an investment</CardTitle></CardHeader><CardContent className="space-y-4">
        <div><div className="mb-2 flex justify-between gap-2 text-xs text-muted-foreground"><span>Illustrative funding progress</span><span>{pct(Math.round(fundingProgress))}</span></div><ProgressBar value={fundingProgress} /><p className="mt-2 text-xs text-muted-foreground">{formatBDT(raised)} raised of {formatBDT(target)} target</p></div>
        {p.status !== "OPEN" ? <p className="text-sm text-muted-foreground">The programme is not currently accepting new requests.</p> : <>
          <Labeled label="Requested investment amount (BDT)" hint="Minimum ৳1,000. Enter the amount you are requesting, not an amount already transferred."><TextInput type="number" min="1000" max="50000000" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Labeled>
          <div className="rounded-lg bg-muted p-3 text-sm"><p className="flex justify-between gap-3"><span>Requested amount</span><b>{formatBDT(valueMinor)}</b></p><p className="mt-2 text-xs leading-5 text-muted-foreground">No fixed return is shown. Any distribution will depend on actual programme results and the approved distribution policy.</p></div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-xs leading-5 text-emerald-950"><p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />No payment at this stage</p><p className="mt-1">An administrator reviews your identity and request. If approved, you can complete payment through the verified Premium Agro organization bank account only.</p></div>
          {problem && <p role="alert" className="text-sm text-amber-700">{problem}{!verified && <> — <Link className="font-semibold underline" to="/dashboard/profile">Verify profile</Link></>}</p>}
          <ConfirmAction triggerLabel={pending ? "Submitting request…" : "Submit investment request"} triggerIcon={ArrowRight} triggerClassName="w-full" disabled={!!problem || pending} title="Submit this investment request?" description={`You are requesting ${formatBDT(valueMinor)} in the Premium Agro Collective Investment Program. No funds will be moved and no payment is due until the request is approved.`} confirmLabel="Submit request" onConfirm={submit} />
        </>}
        <div className="flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Identity verification is required before request approval. Pay only to the verified organization bank account shown in the approved request.</div>
        <Link className="inline-flex items-center text-sm font-medium text-primary underline" to="/support"><Banknote className="mr-2 h-4 w-4" />Need investment guidance?</Link>
      </CardContent></Card>
    </div>
  </>;
}
