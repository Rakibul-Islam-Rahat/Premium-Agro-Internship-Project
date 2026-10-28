import { useMemo, useState } from "react";
import { Bell, BookOpenCheck, CircleDollarSign, FileText, Headset, ShieldCheck, Sprout, UserRound, ClipboardCheck } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import EmptyState from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthContext";
import { useDb } from "@/services/mock/store";
import { api } from "@/services/api";
import { fmtDateTime } from "@/lib/format";
import { useLanguage } from "@/context/LanguageContext";

const FILTERS = [
  { id: "ALL", label: "All" }, { id: "FINANCE", label: "Finance" }, { id: "REQUEST", label: "Requests" },
  { id: "SUPPORT", label: "Support" }, { id: "DOCUMENT", label: "Documents" }, { id: "ACCOUNT", label: "Identity & account" }, { id: "PROGRAMME", label: "Programme updates" },
];
const categoryFor = (type) => ({ PAYMENT: "FINANCE", FINANCE: "FINANCE", REQUEST: "REQUEST", SUPPORT: "SUPPORT", DOCUMENT: "DOCUMENT", KYC: "ACCOUNT", ACCOUNT: "ACCOUNT", FIELD: "PROGRAMME", PROJECT: "PROGRAMME", FINANCIAL_ENTRY: "FINANCE" })[type] ?? "PROGRAMME";
const visual = {
  FINANCE: { Icon: CircleDollarSign, tone: "bg-emerald-100 text-emerald-800", label: "Finance" }, REQUEST: { Icon: ClipboardCheck, tone: "bg-blue-100 text-blue-800", label: "Requests" },
  SUPPORT: { Icon: Headset, tone: "bg-violet-100 text-violet-800", label: "Support" }, DOCUMENT: { Icon: FileText, tone: "bg-amber-100 text-amber-800", label: "Documents" },
  ACCOUNT: { Icon: ShieldCheck, tone: "bg-cyan-100 text-cyan-800", label: "Identity & account" }, PROGRAMME: { Icon: Sprout, tone: "bg-lime-100 text-lime-900", label: "Programme updates" },
};
export default function Notifications() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const all = useDb((s) => s.notifications);
  const [filter, setFilter] = useState("ALL");
  const mine = useMemo(() => all.filter((n) => n.userId === user.id).sort((a, b) => new Date(b.date) - new Date(a.date)), [all, user.id]);
  const unread = mine.filter((n) => !n.read).length;
  const visible = mine.filter((n) => filter === "ALL" || categoryFor(n.type) === filter);
  return <>
    <PageHeader title="Notifications" description={`${unread} unread notification(s). Messages are grouped by operational category.`} actions={<Button variant="outline" disabled={!unread} onClick={() => api.markRead(user.id)}>{t("Mark All as Read")}</Button>} />
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Notification categories">{FILTERS.map((item) => { const count = item.id === "ALL" ? mine.length : mine.filter((n) => categoryFor(n.type) === item.id).length; return <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)} className={`shrink-0 rounded-full border px-3 py-2 text-sm ${filter === item.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>{t(item.label)} <span className="ml-1 opacity-75">{count}</span></button>; })}</div>
    {visible.length ? <div className="space-y-3">{visible.map((n) => { const cat = visual[categoryFor(n.type)]; const Icon = cat?.Icon ?? Bell; return <Card key={n.id} className={n.read ? "" : "border-primary/50 bg-primary/5"}><CardContent className="flex gap-3 p-4"><div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cat?.tone ?? "bg-muted"}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border px-2 py-0.5 text-[11px] font-medium">{t(cat?.label ?? "Programme updates")}</span>{!n.read && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{t("New")}</span>}<time className="ml-auto text-xs text-muted-foreground">{fmtDateTime(n.date)}</time></div><p className="mt-2 text-sm leading-6">{n.text}</p></div></CardContent></Card>; })}</div> : <EmptyState title={t("No notifications in this category")} description={t("When there is an update, it will appear here with a category and timestamp.")} />}
  </>;
}
