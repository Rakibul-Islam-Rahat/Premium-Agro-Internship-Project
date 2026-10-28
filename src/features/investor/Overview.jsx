import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, Briefcase, Coins, TrendingUp, Wallet } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import StatCard from "@/components/common/StatCard";
import EmptyState from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bn, formatBDT } from "@/lib/money";
import { fmtMonth } from "@/lib/format";
import { usePortfolio } from "./hooks";
import { useDb } from "@/services/mock/store";

const lakh = (v) => `${bn(v / 100000)} lakh`;

export default function Overview() {
  const p = usePortfolio();
  const requests = useDb((s) => s.investmentRequests ?? []);
  const agroProjects = useDb((s) => s.agroProjects ?? []);
  const projectFunding = useDb((s) => s.projectFundingAllocations ?? []);
  const openRequests = requests.filter((r) => r.investorId === p.user.id && ["PENDING_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_PENDING", "PAYMENT_REJECTED"].includes(r.status)).length;
  const program = p.projects[0];
  const timeline = useMemo(() => {
    const months = {};
    [...p.myTx].filter((t) => t.status === "COMPLETED" && (t.type === "INVEST" || t.type === "DIVIDEND"))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach((t) => {
        const k = fmtMonth(t.date);
        months[k] ??= { month: k, invested: 0, payouts: 0 };
        if (t.type === "INVEST") months[k].invested += -t.amount / 100; else months[k].payouts += t.amount / 100;
      });
    let ci = 0, cd = 0;
    return Object.values(months).map((m) => ({ month: m.month, invested: (ci += m.invested), payouts: (cd += m.payouts) }));
  }, [p.myTx]);

  return (
    <>
      <PageHeader title={`Welcome, ${p.user.name}`} description="A summary of your investment portfolio"
        actions={<><Button asChild variant="outline"><Link to="wallet">View Profit Wallet</Link></Button><Button asChild><Link to="marketplace">View Programme</Link></Button></>} />
      {openRequests > 0 && <Link to="requests" className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><AlertCircle className="h-4 w-4 shrink-0" />You have {bn(openRequests)} investment request(s) in progress. Review the next step in Investment Requests.</Link>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Invested Capital" value={formatBDT(p.invested)} hint="Pooled programme capital" icon={Briefcase} />
        <StatCard label="Expected Total Return" value="Variable" hint="Not guaranteed; depends on programme results" icon={TrendingUp} />
        <StatCard label="Programme Realized Gain / Loss" value={formatBDT(p.realizedProfit)} icon={Coins} />
        <StatCard label="Wallet Balance" value={formatBDT(p.available)} hint={p.available !== p.balance ? "excluding pending withdrawals" : undefined} icon={Wallet} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Cumulative Investment and Programme Payouts (BDT)</CardTitle></CardHeader>
          <CardContent className="h-72">
            {timeline.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="month" fontSize={12} /><YAxis fontSize={12} tickFormatter={lakh} width={70} />
                  <Tooltip formatter={(v) => formatBDT(v * 100)} /><Legend />
                  <Area type="monotone" dataKey="invested" stroke="#15803d" fill="#15803d33" name="Investment" />
                  <Area type="monotone" dataKey="payouts" stroke="#d97706" fill="#d9770633" name="Programme payout" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyState title="No activity yet" />}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">One pooled programme</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">You invest in one pooled programme, then follow each underlying agro project. The project view shows approved allocations, field updates and approved operating entries; project-level amounts are indicative management information rather than separate investments.</p>
            <div className="mt-4 space-y-3">{agroProjects.filter((item) => item.status !== "ARCHIVED").slice(0, 4).map((item) => {
              const allocated = projectFunding.filter((a) => a.projectId === item.id && a.status === "APPROVED").reduce((n, a) => n + Number(a.amount || 0), 0);
              return <Link key={item.id} to={`/dashboard/marketplace/project/${item.id}`} className="block rounded-lg border p-3 transition-colors hover:bg-muted/50"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold">{item.title}</p><span className="text-xs text-muted-foreground">{bn(item.progress ?? 0)}%</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.stage || "Planning"} · Approved allocation: {formatBDT(allocated)}</p></Link>;
            })}</div>
            {agroProjects.filter((item) => item.status !== "ARCHIVED").length > 4 && <Button asChild variant="outline" className="mt-3 w-full"><Link to="marketplace">View all underlying projects</Link></Button>}
            {!agroProjects.some((item) => item.status !== "ARCHIVED") && <p className="mt-3 text-sm text-muted-foreground">Underlying project profiles will appear here when published by Premium Agro.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
