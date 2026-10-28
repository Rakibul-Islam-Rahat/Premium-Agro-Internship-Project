import { useMemo, useState } from "react";
import { Banknote, Wallet as WalletIcon } from "lucide-react";
import { Link } from "react-router-dom";
import PageHeader from "@/components/common/PageHeader";
import StatCard from "@/components/common/StatCard";
import DataTable from "@/components/common/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import { Labeled, SelectInput, TextInput } from "@/components/common/form";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TX_TYPE, CHANNEL } from "@/config/labels";
import { useAction } from "@/hooks/useAction";
import { api } from "@/services/api";
import { formatBDT, toMinor, sum } from "@/lib/money";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { usePortfolio } from "./hooks";

const TYPES = [{ value: "ALL", label: "All Types" }, ...Object.entries(TX_TYPE).map(([value, label]) => ({ value, label }))];
export default function Wallet() {
  const { user, myTx, mine, balance, available, projectOf } = usePortfolio();
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [type, setType] = useState("ALL");
  const bank = user.bank ?? {};
  const bankReady = Boolean(bank.bankName?.trim() && bank.accName?.trim() && bank.accNum?.trim());
  const destination = bankReady ? `${bank.bankName} — ${bank.accName} · ${bank.accNum}${bank.branch ? ` · ${bank.branch} Branch` : ""}` : "Bank details are not complete";
  const [withdraw, withdrawPending] = useAction(async () => {
    await api.requestWithdraw(user.id, { amount: toMinor(withdrawAmount), channel: "BANK" });
    setWithdrawAmount("");
  }, "Bank withdrawal request submitted for review");
  const rows = useMemo(() => myTx.filter((t) => type === "ALL" || t.type === type).sort((a, b) => new Date(b.date) - new Date(a.date)), [myTx, type]);
  const pendingOut = sum(myTx.filter((t) => t.status === "PENDING" && t.type === "WITHDRAW"), (t) => Math.abs(t.amount));
  const profitByProgramme = useMemo(() => {
    const investedByProgram = new Map();
    mine.filter((i) => i.status === "ACTIVE" || i.status === "COMPLETED").forEach((inv) => {
      const p = projectOf(inv.projectId); const id = inv.projectId;
      const row = investedByProgram.get(id) ?? { id, title: p?.title ?? "Premium Agro Collective Investment Program", invested: 0, recordedPayout: 0, paidPositions: 0, positions: 0 };
      row.invested += inv.amount; row.positions += 1;
      if (inv.status === "COMPLETED" && Number.isFinite(inv.payout)) { row.recordedPayout += inv.payout; row.paidPositions += 1; }
      investedByProgram.set(id, row);
    });
    const dividends = new Map();
    myTx.filter((t) => t.type === "DIVIDEND" && t.status === "COMPLETED").forEach((t) => dividends.set(t.ref ?? "p1", (dividends.get(t.ref ?? "p1") ?? 0) + t.amount));
    return [...investedByProgram.values()].map((r) => {
      const ledgerPayout = dividends.get(r.id) ?? 0;
      const hasCompletePositionPayouts = r.positions > 0 && r.paidPositions === r.positions;
      const payout = hasCompletePositionPayouts ? r.recordedPayout : ledgerPayout;
      const known = hasCompletePositionPayouts || ledgerPayout > 0;
      return { ...r, payout, profit: known ? payout - r.invested : null };
    });
  }, [myTx, mine, projectOf]);
  const amountMinor = toMinor(withdrawAmount || 0);
  const validAmount = Number.isFinite(Number(withdrawAmount)) && amountMinor > 0 && Math.abs(Number(withdrawAmount) * 100 - amountMinor) < 0.0001 && amountMinor <= available;

  return <>
    <PageHeader title="Wallet & Profit" description="Review realized programme payouts, available wallet balance and transaction history. Investment payments are made only after an approved request; profit is credited here when distributed." />
    <div className="grid gap-4 sm:grid-cols-3"><StatCard label="Wallet Ledger Balance" value={formatBDT(balance)} icon={WalletIcon} /><StatCard label="Available Balance" value={formatBDT(available)} hint="After pending withdrawals" icon={Banknote} /><StatCard label="Withdrawals Awaiting Review" value={formatBDT(pendingOut)} /></div>
    <section className="mt-5"><div className="mb-3"><h2 className="text-lg font-semibold">Programme Profit Wallet</h2><p className="text-sm text-muted-foreground">Actual payout and gain/loss are displayed only when recorded. No future return is assumed.</p></div>
      {profitByProgramme.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{profitByProgramme.map((x) => <Card key={x.id}><CardContent className="p-4"><p className="text-sm font-semibold">{x.title}</p><p className={`mt-2 text-2xl font-bold ${x.profit == null ? "text-muted-foreground" : x.profit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{x.profit == null ? "Not yet recorded" : formatBDT(x.profit)}</p><p className="mt-1 text-xs text-muted-foreground">Realized gain / loss</p><div className="mt-3 space-y-1 border-t pt-2 text-xs"><div className="flex justify-between gap-2"><span className="text-muted-foreground">Recorded invested capital</span><span>{formatBDT(x.invested)}</span></div><div className="flex justify-between gap-2"><span className="text-muted-foreground">Payout credited</span><span>{formatBDT(x.payout)}</span></div></div></CardContent></Card>)}</div> : <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Your programme result will appear here after the financial close-out is reviewed and a payout is credited.</div>}
    </section>
    <Card className="mt-6"><CardHeader><CardTitle className="text-base">Request a bank withdrawal</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 rounded-lg border bg-muted/30 p-3"><p className="text-sm font-semibold">Saved bank account for receiving profit</p><p className="mt-1 text-sm">{bankReady ? destination : "Add the receiving bank name, account holder and account number in your profile."}</p>{!bankReady && <Link to="../profile" className="mt-2 inline-block text-sm font-medium underline">Update bank details</Link>}<p className="mt-2 text-xs text-muted-foreground">Only a bank transfer is supported. The request will be sent to an administrator for review; this form does not execute a transfer.</p></div>
      <Labeled label="Withdrawal amount (BDT)" hint={`Available: ${formatBDT(available)}`}><TextInput inputMode="decimal" type="number" min="0.01" max={available / 100} step="0.01" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} /></Labeled>
      <div className="flex flex-col justify-end gap-2"><p className="text-sm">Transfer method: <b>Bank transfer only</b></p><ConfirmAction triggerLabel={withdrawPending ? "Submitting…" : "Submit withdrawal request"} triggerSize="default" disabled={withdrawPending || !bankReady || !validAmount} title="Submit this bank withdrawal?" description={`Request a bank transfer of ${formatBDT(amountMinor)} to the receiving bank account saved on your profile. An administrator must review the request before a transfer is arranged.`} confirmLabel="Submit withdrawal" onConfirm={() => withdraw()} /></div>
      {!bankReady && <p className="text-xs text-amber-700 sm:col-span-2">Complete bank details before requesting a withdrawal. The branch is optional.</p>}
    </CardContent></Card>
    <div className="mb-3 mt-6 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Transaction history</h2><div className="w-44"><SelectInput aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} options={TYPES} /></div></div>
    <DataTable rows={rows} empty="No transactions found" columns={[
      { key: "d", header: "Date", render: (t) => fmtDateTime(t.date) },
      { key: "t", header: "Category", render: (t) => TX_TYPE[t.type] ?? t.type },
      { key: "c", header: "Channel / Reference", render: (t) => t.type === "WITHDRAW" ? <code className="break-all text-xs">{t.trxId}</code> : CHANNEL[t.channel] ?? (t.ref ? "Collective programme" : "—") },
      { key: "a", header: "Amount", className: "text-right tabular-nums", render: (t) => <span className={t.amount < 0 ? "text-red-600" : "text-emerald-600"}>{t.amount > 0 && "+"}{formatBDT(t.amount)}</span> },
      { key: "s", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
    ]} />
  </>;
}
