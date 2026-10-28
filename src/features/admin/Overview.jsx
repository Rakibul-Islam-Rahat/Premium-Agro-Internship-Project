import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownToLine, Banknote, FileCheck2, Landmark, ShieldCheck, TrendingUp, Users, Wallet } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import StatCard from "@/components/common/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDb } from "@/services/mock/store";
import { raisedOf } from "@/services/ledger";
import { bn, formatBDT, sum } from "@/lib/money";

const lakh = (v) => `${bn(v / 100000)} lakh`;

export default function AdminOverview() {
  const projects = useDb((s) => s.projects);
  const users = useDb((s) => s.users);
  const txs = useDb((s) => s.transactions);
  const investments = useDb((s) => s.investments);
  const investmentRequests = useDb((s) => s.investmentRequests ?? []);
  const live = useMemo(() => projects.filter((p) => p.status !== "DRAFT"), [projects]);
  const chart = useMemo(() => live.map((p) => ({ name: p.title.split("—")[0].trim().slice(0, 16), raised: raisedOf(p) / 100, target: (p.targetAmount ?? 0) / 100 })), [live]);
  const m = useMemo(() => {
    const done = txs.filter((t) => t.status === "COMPLETED");
    return {
      pendingDeposits: txs.filter((t) => t.status === "PENDING" && t.type === "DEPOSIT").length + investments.filter((i) => i.status === "PENDING_PAYMENT").length + investmentRequests.filter((r) => r.status === "PAYMENT_PENDING").length,
      requestReview: investmentRequests.filter((r) => r.status === "PENDING_REVIEW").length,
      pendingWd: txs.filter((t) => t.status === "PENDING" && t.type === "WITHDRAW").length,
      liability: sum(done, (t) => t.amount), dividends: sum(done.filter((t) => t.type === "DIVIDEND"), (t) => t.amount),
    };
  }, [txs, investments, investmentRequests]);
  return (
    <>
      <PageHeader title="Platform Dashboard" description="Overview of the collective investment programme, payments, requests and identity verification." actions={<Button asChild><Link to="allocation">Profit Allocation</Link></Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Capital Raised" value={formatBDT(sum(live, raisedOf))} icon={TrendingUp} />
        <StatCard label="Investor" value={bn(users.filter((u) => u.role === "INVESTOR").length)} icon={Users} />
        <StatCard label="KYC Pending" value={bn(users.filter((u) => u.kyc.status === "PENDING").length)} icon={ShieldCheck} />
        <StatCard label="Investment Requests" value={bn(m.requestReview)} hint="Awaiting admin approval" icon={FileCheck2} />
        <StatCard label="Payments Awaiting Review" value={bn(m.pendingDeposits)} icon={ArrowDownToLine} />
        <StatCard label="Withdrawal Requests" value={bn(m.pendingWd)} icon={Banknote} />
        <StatCard label="Investor Wallet Liability" value={formatBDT(m.liability)} hint="Sum of all completed ledger entries" icon={Wallet} />
        <StatCard label="Programme Proceeds Distributed" value={formatBDT(m.dividends)} icon={Landmark} />
      </div>
      <Card className="mt-4"><CardHeader><CardTitle className="text-base">Capital Raised by Collective Programme (BDT)</CardTitle></CardHeader>
        <CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="name" fontSize={11} /><YAxis fontSize={12} tickFormatter={lakh} width={70} /><Tooltip formatter={(v) => formatBDT(v * 100)} /><Legend />
          <Bar dataKey="target" fill="#94a3b8" name="Target" radius={[4, 4, 0, 0]} /><Bar dataKey="raised" fill="#15803d" name="Raised" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>
    </>
  );
}
