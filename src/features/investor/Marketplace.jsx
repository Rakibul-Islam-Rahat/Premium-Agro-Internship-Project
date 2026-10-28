import { Link } from "react-router-dom";
import { ArrowRight, Activity, MapPin, ShieldCheck, Sprout, TrendingUp } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import StatusBadge from "@/components/common/StatusBadge";
import { ProgressBar } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDb } from "@/services/mock/store";
import { useAuth } from "@/features/auth/AuthContext";
import { bn, formatBDT, pct } from "@/lib/money";

const taka = (paisa) => Number(paisa || 0) / 100;

function ProjectCard({ project, funding, entries, investedShare, isSettled }) {
  const allocated = funding.filter((x) => x.projectId === project.id && x.status === "APPROVED").reduce((n, x) => n + Number(x.amount || 0), 0);
  const approved = entries.filter((x) => x.projectId === project.id && x.status === "APPROVED");
  const revenue = approved.filter((x) => x.kind === "REVENUE").reduce((n, x) => n + Number(x.amount || 0), 0);
  const expenses = approved.filter((x) => x.kind === "EXPENSE").reduce((n, x) => n + Number(x.amount || 0), 0);
  return <Card className="overflow-hidden">
    <CardContent className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-800"><Sprout className="h-5 w-5" /></span>
          <div className="min-w-0"><h3 className="font-semibold leading-5">{project.title}</h3><p className="mt-1 text-xs text-muted-foreground">{project.category?.replaceAll("_", " ")} · {project.location || "Location not provided"}</p></div>
        </div>
        <StatusBadge status={project.status} />
      </div>
      <p className="mt-3 text-sm leading-5 text-muted-foreground">{project.summary || project.description || "Project details will be updated by the Premium Agro team."}</p>
      <div className="mt-4"><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="font-medium">{project.stage || "Planning"}</span><span>{bn(project.progress ?? 0)}%</span></div><ProgressBar value={project.progress ?? 0} /><p className="mt-1.5 text-xs text-muted-foreground">Last updated {project.updatedAt ? new Date(project.updatedAt).toLocaleString() : "not recorded"}</p></div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Allocated capital</p><p className="mt-1 text-sm font-semibold">{formatBDT(allocated)}</p></div>
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Revenue</p><p className="mt-1 text-sm font-semibold">{formatBDT(revenue)}</p></div>
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Expenses</p><p className="mt-1 text-sm font-semibold">{formatBDT(expenses)}</p></div>
        <div className="rounded-lg bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Indicative share</p><p className="mt-1 text-sm font-semibold">{formatBDT(Math.round(allocated * investedShare))}</p></div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">Indicative share is calculated proportionally from your pooled programme position{isSettled ? " at settlement" : ""}. It is an informational estimate, not a separate project investment or segregated ownership claim.</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"><span className="text-xs text-muted-foreground">{bn(approved.length)} approved financial record(s)</span><Button asChild size="sm" variant="outline"><Link to={`/dashboard/marketplace/project/${project.id}`}>View project details <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div>
    </CardContent>
  </Card>;
}

export default function Marketplace() {
  const { user } = useAuth();
  const programs = useDb((s) => s.projects);
  const agroProjects = useDb((s) => s.agroProjects ?? []);
  const investments = useDb((s) => s.investments ?? []);
  const funding = useDb((s) => s.projectFundingAllocations ?? []);
  const entries = useDb((s) => s.financialEntries ?? []);
  const program = programs[0];
  const isSettled = program?.status === "LIQUIDATED";
  const shareStatuses = isSettled ? ["ACTIVE", "COMPLETED"] : ["ACTIVE"];
  const eligiblePositions = investments.filter((x) => x.projectId === program?.id && shareStatuses.includes(x.status));
  const activePosition = eligiblePositions.filter((x) => x.investorId === user.id).reduce((n, x) => n + Number(x.amount || 0), 0);
  const capitalFromPositions = eligiblePositions.reduce((n, x) => n + Number(x.amount || 0), 0);
  const totalCapital = isSettled ? capitalFromPositions : (Number(program?.raisedAmount) || capitalFromPositions);
  const investedShare = totalCapital > 0 ? Math.min(1, activePosition / totalCapital) : 0;
  const target = Number(program?.targetAmount) || 0;
  const raised = totalCapital;
  const fundingProgress = target > 0 ? Math.min(100, raised / target * 100) : 0;
  const visibleProjects = [...agroProjects].filter((project) => project.status !== "ARCHIVED").sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0) - new Date(a.updatedAt ?? a.createdAt ?? 0));
  if (!program) return <p className="text-sm text-muted-foreground">The collective investment programme has not been configured yet. Please contact Premium Agro support.</p>;
  return <>
    <PageHeader title="Collective Investment Programme" description="You request investment in one pooled programme. Explore the underlying agro projects to view their progress, approved field evidence, capital allocations and operating reports." />
    <Card className="mb-7 overflow-hidden">
      <div className="bg-gradient-to-br from-emerald-950 via-emerald-800 to-lime-700 p-6 text-white md:p-9">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-3xl"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold"><Sprout className="h-4 w-4" /> Premium Agro · One pooled programme</div><h2 className="text-2xl font-bold tracking-tight md:text-3xl">{program.title}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50">{program.description}</p></div><StatusBadge status={program.status} /></div>
        <div className="mt-7 grid gap-4 sm:grid-cols-3"><div className="rounded-xl border border-white/20 bg-white/10 p-4"><p className="text-xs text-emerald-100">{isSettled ? "Programme capital at settlement" : "Active programme capital"}</p><p className="mt-1 text-xl font-bold">{formatBDT(raised)}</p></div><div className="rounded-xl border border-white/20 bg-white/10 p-4"><p className="text-xs text-emerald-100">Programme progress</p><p className="mt-1 text-xl font-bold">{bn(program.progress ?? 0)}%</p><p className="mt-1 text-xs text-emerald-100">{program.stage}</p></div><div className="rounded-xl border border-white/20 bg-white/10 p-4"><p className="text-xs text-emerald-100">{isSettled ? "Your pooled position" : "Your active position"}</p><p className="mt-1 text-xl font-bold">{formatBDT(activePosition)}</p><p className="mt-1 text-xs text-emerald-100">{totalCapital > 0 ? pct(investedShare * 100) : "No active investment"} of {isSettled ? "capital at settlement" : "active capital"}</p></div></div>
        <div className="mt-5"><div className="mb-2 flex justify-between gap-4 text-xs text-emerald-100"><span>Illustrative funding target progress</span><span>{pct(Math.round(fundingProgress))}</span></div><ProgressBar value={fundingProgress} /></div>
        <div className="mt-6 flex flex-wrap gap-3"><Button asChild className="bg-white text-emerald-950 hover:bg-emerald-50"><Link to={`/dashboard/marketplace/${program.id}`}>View programme and request investment <ArrowRight className="ml-2 h-4 w-4" /></Link></Button><Button asChild variant="outline" className="border-white/50 bg-transparent text-white hover:bg-white/10"><Link to="/dashboard/tracker"><TrendingUp className="mr-2 h-4 w-4" />Project activity tracker</Link></Button></div>
      </div>
      <CardContent className="flex items-start gap-3 p-5 text-sm md:p-6"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div><p className="font-semibold">One investment, multiple operating projects</p><p className="mt-1 leading-5 text-muted-foreground">You invest in the pooled Premium Agro programme only. Management may allocate approved programme capital among the projects below. The indicative share shown per project is a transparent management view—not a separate investment, guaranteed return or legally segregated holding.</p><p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><MapPin className="h-4 w-4" />{program.location}</p></div></CardContent>
    </Card>
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">Underlying agro projects</h2><p className="mt-1 text-sm text-muted-foreground">Project-level details, approved field updates and financial performance.</p></div><div className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs text-muted-foreground"><Activity className="h-4 w-4" />Live updates · 10-second fallback</div></div>
    {visibleProjects.length ? <div className="grid gap-4 xl:grid-cols-2">{visibleProjects.map((project) => <ProjectCard key={project.id} project={project} funding={funding} entries={entries} investedShare={investedShare} isSettled={isSettled} />)}</div> : <Card><CardContent className="p-8 text-center"><Sprout className="mx-auto h-8 w-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">Project details are being prepared</h3><p className="mt-1 text-sm text-muted-foreground">Premium Agro has not published underlying project records yet. Please check back later.</p></CardContent></Card>}
  </>;
}
