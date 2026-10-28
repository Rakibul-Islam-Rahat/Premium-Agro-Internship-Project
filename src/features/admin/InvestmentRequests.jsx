import { useMemo, useState } from "react";
import { Check, Eye, X } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import ConfirmAction from "@/components/ui/ConfirmAction";
import IdentityProfileDialog from "@/features/admin/IdentityProfileDialog";
import { useAuth } from "@/features/auth/AuthContext";
import { useAction } from "@/hooks/useAction";
import { useDb } from "@/services/mock/store";
import { api } from "@/services/api";
import { bn, formatBDT } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";

function Review({ request, actorId }) {
  const [decide, pending] = useAction((approve) => api.reviewInvestmentRequest(actorId, request.id, approve), "Investment request decision saved");
  if (request.status !== "PENDING_REVIEW") return <StatusBadge status={request.status} />;
  return <div className="flex flex-wrap gap-2"><ConfirmAction triggerLabel="Approve" triggerIcon={Check} disabled={pending} title="Approve this investment request?" description={`Approve the request for ${formatBDT(request.amount)} in the one pooled programme. This does not confirm payment or activate the investment. Verify the investor identity and ensure the programme remains open.`} confirmLabel="Approve request" onConfirm={() => decide(true)} /><ConfirmAction triggerLabel="Decline" triggerIcon={X} triggerVariant="outline" destructive disabled={pending} title="Decline this investment request?" description="The request will be declined and no payment will be due. This decision will be recorded in the audit log." confirmLabel="Decline request" onConfirm={() => decide(false)} /></div>;
}

export default function AdminInvestmentRequests() {
  const { user } = useAuth();
  const requests = useDb((s) => s.investmentRequests ?? []);
  const users = useDb((s) => s.users);
  const projects = useDb((s) => s.projects);
  const [identityId, setIdentityId] = useState(null);
  const rows = useMemo(() => [...requests].sort((a, b) => {
    const ap = a.status === "PENDING_REVIEW" ? 0 : 1;
    const bp = b.status === "PENDING_REVIEW" ? 0 : 1;
    return ap - bp || new Date(b.createdAt) - new Date(a.createdAt);
  }), [requests]);
  const investor = (id) => users.find((x) => x.id === id);
  const project = (id) => projects.find((x) => x.id === id);
  return <>
    <PageHeader title="Investment Request Review" description="Review amount-based requests for the single pooled programme. Approval does not collect money; payment is a later bank-transfer step." />
    <div className="mb-5 grid gap-3 sm:grid-cols-3">{[
      { label: "Awaiting request review", value: requests.filter((r) => r.status === "PENDING_REVIEW").length },
      { label: "Approved, awaiting payment", value: requests.filter((r) => ["APPROVED_AWAITING_PAYMENT", "PAYMENT_REJECTED"].includes(r.status)).length },
      { label: "Payment awaiting confirmation", value: requests.filter((r) => r.status === "PAYMENT_PENDING").length },
    ].map((x) => <div className="rounded-xl border bg-background p-4" key={x.label}><p className="text-xs text-muted-foreground">{x.label}</p><p className="mt-1 text-2xl font-semibold">{bn(x.value)}</p></div>)}</div>
    <DataTable rows={rows} empty="No investment requests have been submitted." columns={[
      { key: "date", header: "Submitted", render: (r) => fmtDateTime(r.createdAt) },
      { key: "investor", header: "Investor", render: (r) => { const u = investor(r.investorId); return <><b>{u?.name ?? "Unknown investor"}</b><span className="block text-xs text-muted-foreground">{u?.email ?? ""}</span><span className={`mt-1 inline-block text-xs ${u?.kyc?.status === "VERIFIED" ? "text-emerald-700" : "text-amber-700"}`}>Identity: {u?.kyc?.status ?? "Unknown"}</span><Button className="mt-1 h-7 px-2 text-xs" size="sm" variant="outline" onClick={() => u && setIdentityId(u.id)}><Eye className="mr-1 h-3 w-3" />View identity</Button></>; } },
      { key: "programme", header: "Investment programme", render: (r) => project(r.projectId)?.title ?? "Collective programme" },
      { key: "amount", header: "Requested amount", render: (r) => <b>{formatBDT(r.amount)}</b> },
      { key: "status", header: "Current stage", render: (r) => <StatusBadge status={r.status} /> },
      { key: "decision", header: "Decision", render: (r) => <Review request={r} actorId={user.id} /> },
    ]} />
    <IdentityProfileDialog user={users.find((u) => u.id === identityId)} open={!!identityId} onOpenChange={(open) => !open && setIdentityId(null)} />
    <p className="mt-3 text-xs leading-5 text-muted-foreground">Before approval, confirm the investor identity is verified and the request complies with the programme rules. The View identity shortcut opens submitted KYC details. After approval the investor may submit bank-transfer evidence; an administrator must separately verify the actual bank credit before the investment becomes active.</p>
  </>;
}
