import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, Banknote, CheckCircle2, Clock3, FileCheck2, ShieldCheck, XCircle } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import StatusBadge from "@/components/common/StatusBadge";
import { Labeled, TextInput } from "@/components/common/form";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/features/auth/AuthContext";
import { useAction } from "@/hooks/useAction";
import { useDb } from "@/services/mock/store";
import { api } from "@/services/api";
import { formatBDT, toMinor, bn } from "@/lib/money";
import { fmtDateTime } from "@/lib/format";
import { imageToDataUrl } from "@/lib/image";

const STEPS = [
  { key: "request", title: "Request submitted", desc: "No payment due" },
  { key: "approved", title: "Approved", desc: "Bank payment unlocked" },
  { key: "payment", title: "Payment submitted", desc: "Awaiting verification" },
  { key: "active", title: "Investment active", desc: "Recorded in My investments" },
];
const STEP_INDEX = { PENDING_REVIEW: 1, REJECTED: 1, APPROVED_AWAITING_PAYMENT: 2, PAYMENT_REJECTED: 2, PAYMENT_PENDING: 3, PAID: 4 };
function Stepper({ status }) {
  const current = STEP_INDEX[status] ?? 0;
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{STEPS.map((step, i) => {
    const done = current > i + 1 || status === "PAID";
    const active = current === i + 1 && status !== "REJECTED";
    return <div key={step.key} className={`rounded-lg border p-3 ${done ? "border-emerald-200 bg-emerald-50/70" : active ? "border-emerald-400 bg-emerald-50" : "border-border bg-muted/30"}`}><div className="flex items-center gap-2">{done ? <CheckCircle2 className="h-4 w-4 text-emerald-700" /> : active ? <Clock3 className="h-4 w-4 text-emerald-700" /> : <span className="flex h-4 w-4 items-center justify-center rounded-full border text-[10px] text-muted-foreground">{i + 1}</span>}<span className="text-xs font-semibold">{step.title}</span></div><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{step.desc}</p></div>;
  })}</div>;
}

function PaymentForm({ request, program }) {
  const [trxId, setTrxId] = useState("");
  const [proof, setProof] = useState(null);
  const [proofError, setProofError] = useState("");
  const bank = program?.payment ?? {};
  const bankReady = Boolean(bank.bankVerified && bank.bankName && bank.bankAccountName && bank.bankAccountNumber && !/demo|replace|placeholder/i.test(`${bank.bankName} ${bank.bankAccountName} ${bank.bankAccountNumber}`));
  const [pay, pending] = useAction(async () => {
    await api.submitInvestmentPayment(request.investorId, request.id, { channel: "BANK", trxId, proof });
    setTrxId(""); setProof(null); setProofError("");
  }, "Bank payment information submitted for administrator verification");
  const chooseProof = async (e) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    setProofError(""); setProof(null);
    if (!file) return;
    try {
      if (file.type.startsWith("image/")) {
        const compressed = await imageToDataUrl(file, { maxBytes: 180 * 1024, maxDimension: 1400 });
        setProof({ name: file.name, type: compressed.type, dataUrl: compressed.dataUrl });
      } else if (file.type === "application/pdf") {
        if (file.size > 350 * 1024) throw new Error("PDF receipts must be 350 KB or smaller in this local demo.");
        const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read this file.")); reader.readAsDataURL(file); });
        setProof({ name: file.name, type: file.type, dataUrl });
      } else throw new Error("Upload a payment receipt as an image or PDF.");
    } catch (error) { setProofError(error.message || "The selected receipt could not be processed."); input.value = ""; }
  };
  return <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
    <div className="mb-3 flex items-center gap-2"><Banknote className="h-4 w-4 text-emerald-800" /><h4 className="font-semibold text-emerald-950">Bank transfer payment</h4></div>
    {bankReady ? <div className="mb-4 rounded-lg border border-emerald-100 bg-white p-3 text-sm">
      <p className="flex justify-between gap-3"><span className="text-slate-500">Amount due</span><strong>{formatBDT(request.amount)}</strong></p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Bank</dt><dd className="font-medium text-slate-900">{bank.bankName}</dd></div><div><dt className="text-xs text-slate-500">Account holder</dt><dd className="font-medium text-slate-900">{bank.bankAccountName}</dd></div><div><dt className="text-xs text-slate-500">Account number</dt><dd className="break-all font-medium text-slate-900">{bank.bankAccountNumber}</dd></div>{bank.bankBranch && <div><dt className="text-xs text-slate-500">Branch</dt><dd className="font-medium text-slate-900">{bank.bankBranch}</dd></div>}</dl>
      <p className="mt-3 border-t pt-3 text-xs leading-5 text-slate-600">Transfer the exact amount only to the verified Premium Agro organization account. Never send money to a personal account. This screen does not initiate a bank transfer.</p>
    </div> : <div role="alert" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-semibold">Bank payment is not available yet</p><p className="mt-1">Premium Agro has not configured and verified its organization bank details. Do not transfer any funds. Contact support and wait for the verified details to appear here.</p><Link className="mt-2 inline-flex underline" to="/support">Open Help & Support</Link></div>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Labeled label="Bank transaction reference"><TextInput value={trxId} onChange={(e) => setTrxId(e.target.value)} placeholder="Reference from your bank receipt" maxLength={100} /></Labeled>
      <Labeled label="Transfer receipt (optional)" hint="Image or PDF receipt. A compressed file is stored in this local demo."><input type="file" accept="image/*,application/pdf" onChange={chooseProof} className="block w-full rounded-lg border bg-white px-3 py-2 text-sm" /></Labeled>
    </div>
    {proof && <p className="mt-1 text-xs text-emerald-800">Attached: {proof.name}</p>}{proofError && <p role="alert" className="mt-1 text-xs text-red-600">{proofError}</p>}
    <ConfirmAction triggerLabel={pending ? "Submitting…" : "Submit bank payment for review"} triggerIcon={ArrowRight} triggerSize="default" triggerClassName="mt-4 w-full sm:w-auto" disabled={!bankReady || pending || trxId.trim().length < 5 || !!proofError} title="Submit bank payment details?" description={`You are submitting bank reference ${trxId.trim()} for ${formatBDT(request.amount)}. This does not initiate a transfer or activate your investment. An administrator must independently verify the bank transaction.`} confirmLabel="Submit for payment review" onConfirm={pay} />
    <p className="mt-2 text-xs text-slate-500">Your investment becomes active only after the administrator confirms the actual bank credit.</p>
  </div>;
}

export default function InvestmentRequests() {
  const { user } = useAuth();
  const projects = useDb((s) => s.projects);
  const allRequests = useDb((s) => s.investmentRequests);
  const program = projects[0];
  const myRequests = useMemo(() => allRequests.filter((r) => r.investorId === user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [allRequests, user.id]);
  const [amount, setAmount] = useState("10000");
  const amountMinor = toMinor(amount || 0);
  const [create, creating] = useAction(async () => { await api.createInvestmentRequest(user.id, program.id, amountMinor); setAmount("10000"); }, "Investment request submitted for administrator review");
  const [cancel, cancelling] = useAction((id) => api.cancelInvestmentRequest(user.id, id), "Investment request cancelled");
  const validAmount = Number.isFinite(Number(amount)) && amountMinor >= 100000 && amountMinor <= 5000000000 && Math.abs(Number(amount) * 100 - amountMinor) < 0.0001;
  const canSubmit = user.kyc.status === "VERIFIED" && program?.status === "OPEN" && validAmount;
  return <>
    <PageHeader title="Investment Requests" description="Request participation in the one Premium Agro collective investment programme. Payment is a separate, later step." />
    <div className="mb-6 grid gap-3 lg:grid-cols-3">{[
      { title: "1. Verify identity", copy: "Complete your profile and wait for administrator approval of your identity.", icon: ShieldCheck },
      { title: "2. Request & review", copy: "Enter a BDT amount. Premium Agro reviews your identity and request; no funds move here.", icon: FileCheck2 },
      { title: "3. Bank transfer", copy: "After approval, transfer to the verified organization account and submit the bank reference.", icon: Banknote },
    ].map(({ title, copy, icon: Icon }) => <Card key={title}><CardContent className="flex gap-3 p-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800"><Icon className="h-4 w-4" /></div><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{copy}</p></div></CardContent></Card>)}</div>
    {user.kyc.status !== "VERIFIED" ? <Card className="mb-6 border-amber-200"><CardContent className="flex items-start gap-3 p-5"><AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" /><div><p className="font-semibold">Identity verification required</p><p className="mt-1 text-sm text-muted-foreground">You can review the programme, but must have verified identity before submitting an investment request. Payment is not due before approval.</p><Link className="mt-3 inline-block font-medium underline" to="/dashboard/profile">Complete profile verification</Link></div></CardContent></Card> : <Card className="mb-6"><CardHeader><CardTitle className="text-base">Create an investment request</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div className="space-y-3"><div><p className="font-semibold">{program?.title ?? "Programme not configured"}</p><p className="mt-1 text-sm text-muted-foreground">One pooled investment programme. Your requested amount is reviewed before payment is permitted.</p></div><Labeled label="Requested amount (BDT)" hint="Minimum ৳1,000, maximum ৳50,000,000. No fixed return is promised."><TextInput type="number" min="1000" max="50000000" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Labeled><p className="text-sm">Requested amount: <b>{formatBDT(amountMinor)}</b></p></div>
      <ConfirmAction triggerLabel={creating ? "Submitting…" : "Submit request"} triggerSize="default" disabled={!canSubmit || creating} title="Submit this investment request?" description={`Request ${formatBDT(amountMinor)} in the Premium Agro Collective Investment Program. No money is taken and payment is not due until an administrator approves your request.`} confirmLabel="Submit investment request" onConfirm={create} />
      {!validAmount && <p role="alert" className="text-xs text-amber-700 md:col-span-2">Enter a valid amount from ৳1,000 to ৳50,000,000 with no more than two decimal places.</p>}
      {program?.status !== "OPEN" && <p role="alert" className="text-xs text-amber-700 md:col-span-2">The programme is not accepting new investment requests right now.</p>}
    </CardContent></Card>}
    <div className="space-y-4">{myRequests.length ? myRequests.map((r) => {
      const p = projects.find((x) => x.id === r.projectId) ?? program;
      const canCancel = ["PENDING_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_REJECTED"].includes(r.status);
      return <Card key={r.id}><CardContent className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">Request {r.id.toUpperCase()} · {fmtDateTime(r.createdAt)}</p><h3 className="mt-1 text-base font-semibold">{p?.title ?? "Collective investment programme"}</h3><p className="mt-1 text-sm text-muted-foreground">Requested amount: {formatBDT(r.amount)}</p></div><StatusBadge status={r.status} /></div><div className="mt-4"><Stepper status={r.status} /></div>
        {r.status === "PENDING_REVIEW" && <p className="mt-3 text-sm text-muted-foreground">Your request is awaiting administrator review. Do not transfer funds yet.</p>}
        {r.status === "APPROVED_AWAITING_PAYMENT" && <PaymentForm request={r} program={p} />}
        {r.status === "PAYMENT_REJECTED" && <div className="mt-3"><p role="alert" className="text-sm text-red-700">Payment could not be confirmed. Review the payment reference with your bank before resubmitting.</p><PaymentForm request={r} program={p} /></div>}
        {r.status === "PAYMENT_PENDING" && <p className="mt-3 flex items-center gap-2 text-sm text-amber-800"><Clock3 className="h-4 w-4" />Bank payment submitted. Your investment will become active after independent administrator verification.</p>}
        {r.status === "PAID" && <p className="mt-3 flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />Payment verified. Your investment is now listed in <Link className="underline" to="/dashboard/portfolio">My investments</Link>.</p>}
        {r.status === "REJECTED" && <p className="mt-3 text-sm text-red-700">The administrator declined this request. No payment is due.</p>}
        {canCancel && <div className="mt-4 flex justify-end"><ConfirmAction triggerLabel="Cancel request" triggerVariant="outline" disabled={cancelling} title="Cancel this investment request?" description="The request will be cancelled. No payment is due and any target amount reserved by this request will no longer count against the programme." confirmLabel="Cancel request" destructive onConfirm={() => cancel(r.id)} /></div>}
      </CardContent></Card>;
    }) : <Card><CardContent className="p-8 text-center"><XCircle className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-semibold">No investment requests yet</p><p className="mt-1 text-sm text-muted-foreground">You can submit a request after your identity is verified.</p></CardContent></Card>}</div>
  </>;
}
