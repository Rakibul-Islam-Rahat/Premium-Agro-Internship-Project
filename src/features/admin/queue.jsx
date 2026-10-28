import { useMemo } from "react";
import { Check, X } from "lucide-react";
import DataTable from "@/components/common/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { CHANNEL } from "@/config/labels";
import { useAuth } from "@/features/auth/AuthContext";
import { useAction } from "@/hooks/useAction";
import { useDb } from "@/services/mock/store";
import { api } from "@/services/api";
import { bn, formatBDT } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";

export function Decision({ status, onDecide, approveLabel = "Approve" }) {
  const [run, pending] = useAction(onDecide, "Decision saved");
  if (status !== "PENDING" && status !== "PENDING_PAYMENT") return <StatusBadge status={status} />;
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmAction triggerLabel={approveLabel} triggerIcon={Check} disabled={pending} title={`${approveLabel} this request?`} description="Confirm that you have reviewed the submitted details. This decision will be recorded in the audit log and may change the account or financial workflow." confirmLabel={approveLabel} onConfirm={() => run(true)} />
      <ConfirmAction triggerLabel="Reject" triggerIcon={X} triggerVariant="outline" destructive disabled={pending} title="Reject this request?" description="Confirm rejection. The requester will be notified and the decision will be recorded in the audit log." confirmLabel="Reject" onConfirm={() => run(false)} />
    </div>
  );
}
const pendingFirst = (get) => (a, b) => (get(a) === "PENDING" || get(a) === "PENDING_PAYMENT" ? -1 : 1) - (get(b) === "PENDING" || get(b) === "PENDING_PAYMENT" ? -1 : 1);

// Wallet deposits or withdrawals awaiting review.
export function TxQueue({ type }) {
  const { user } = useAuth();
  const txs = useDb((s) => s.transactions);
  const users = useDb((s) => s.users);
  const rows = useMemo(() => txs.filter((t) => t.type === type && !t.ref).sort((a, b) => pendingFirst((x) => x.status)(a, b) || new Date(b.date) - new Date(a.date)), [txs, type]);
  const name = (id) => users.find((u) => u.id === id)?.name;
  return (
    <DataTable rows={rows} empty="No requests found" columns={[
      { key: "d", header: "Submitted At", render: (t) => fmtDateTime(t.date) },
      { key: "u", header: "Investor", render: (t) => name(t.userId) },
      { key: "a", header: "Amount", render: (t) => formatBDT(Math.abs(t.amount)) },
      { key: "c", header: "Channel", render: (t) => CHANNEL[t.channel] },
      { key: "r", header: type === "DEPOSIT" ? "Transaction ID" : "Destination", render: (t) => <code className="text-xs">{t.trxId}</code> },
      { key: "s", header: "Decision", render: (t) => <Decision status={t.status} onDecide={(ok) => api.reviewTx(user.id, t.id, ok)} /> },
    ]} />
  );
}

// Payments for the staged investment-request workflow.
export function ProjectPaymentQueue() {
  const { user } = useAuth();
  const requests = useDb((s) => s.investmentRequests ?? []);
  const projects = useDb((s) => s.projects);
  const users = useDb((s) => s.users);
  const rows = useMemo(() => requests.filter((r) => r.status === "PAYMENT_PENDING").sort((a, b) => new Date(b.payment?.submittedAt ?? b.updatedAt) - new Date(a.payment?.submittedAt ?? a.updatedAt)), [requests]);
  return (
    <DataTable rows={rows} empty="No investment payments are awaiting confirmation." columns={[
      { key: "d", header: "Submitted At", render: (r) => fmtDateTime(r.payment?.submittedAt ?? r.updatedAt) },
      { key: "u", header: "Investor", render: (r) => <><b>{users.find((u) => u.id === r.investorId)?.name ?? "Unknown investor"}</b><span className="block text-xs text-muted-foreground">{users.find((u) => u.id === r.investorId)?.email ?? ""}</span></> },
      { key: "p", header: "Investment programme", render: (r) => projects.find((p) => p.id === r.projectId)?.title ?? "Collective programme" },
            { key: "a", header: "Amount", render: (r) => formatBDT(r.amount) },
      { key: "c", header: "Method & Reference", render: (r) => <>{CHANNEL[r.payment?.channel] ?? r.payment?.channel}<span className="block text-xs"><code>{r.payment?.trxId}</code></span></> },
      { key: "proof", header: "Proof", render: (r) => r.payment?.proof?.dataUrl ? <a className="text-sm font-medium text-primary underline" target="_blank" rel="noreferrer" href={r.payment.proof.dataUrl}>View receipt</a> : <span className="text-xs text-muted-foreground">No receipt</span> },
      { key: "s", header: "Decision", render: (r) => <Decision status={r.status} approveLabel="Confirm payment" onDecide={(ok) => api.reviewInvestmentPayment(user.id, r.id, ok)} /> },
    ]} />
  );
}

