import { useMemo, useState } from "react";
import { Check, LockKeyhole, ShieldCheck, Trash2, UserPlus, UserRoundCheck, UserRoundX } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import DataTable from "@/components/common/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import ConfirmAction from "@/components/ui/ConfirmAction";
import { Labeled, SelectInput, TextInput } from "@/components/common/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE } from "@/config/labels";
import { useAuth } from "@/features/auth/AuthContext";
import { useAction } from "@/hooks/useAction";
import { useDb } from "@/services/mock/store";
import { api } from "@/services/api";
import { balanceOf } from "@/services/ledger";

const createRoles = [{ value: "INVESTOR", label: ROLE.INVESTOR }, { value: "FIELD_MGR", label: ROLE.FIELD_MGR }];
const blank = { name: "", email: "", phone: "", role: "INVESTOR", password: "" };
const accountStatus = (u) => u.accountStatus ?? "ACTIVE";
const approvalStatus = (u) => u.approvalStatus ?? "APPROVED";

function RegistrationDecision({ target, actor, after }) {
  const [run, pending] = useAction((approve) => api.reviewAccountRegistration(actor.id, target.id, approve), "Registration decision saved");
  const finalAdminStage = target.role === "ADMIN" || (actor.role === "MAIN_ADMIN" && target.approval?.adminApprovedAt);
  const title = target.role === "ADMIN" ? "Administrator application" : "Account registration";
  const approve = async (ok) => { const result = await run(ok); if (result) after?.(); return result; };
  return <div className="flex flex-wrap gap-2">
    <ConfirmAction triggerLabel={finalAdminStage ? "Approve access" : "Approve first review"} triggerIcon={Check} disabled={pending} title={`Approve ${title.toLowerCase()}?`} description={target.role === "ADMIN" ? `Approve ${target.name} as an Administrator. This activates administrative access immediately. Review the applicant's details carefully first.` : finalAdminStage ? `Complete the final approval for ${target.name}. Their account becomes active and they can sign in.` : `Record the Administrator's first review for ${target.name}. The account stays locked until the SuperAdmin completes the final review.`} confirmLabel={finalAdminStage ? "Approve and activate" : "Approve first review"} onConfirm={() => approve(true)} />
    <ConfirmAction triggerLabel="Reject" triggerIcon={UserRoundX} triggerVariant="outline" destructive disabled={pending} title={`Reject ${title.toLowerCase()}?`} description={`Reject ${target.name}'s registration. They will not be able to sign in; they will need to contact support for guidance.`} confirmLabel="Reject application" onConfirm={() => approve(false)} />
  </div>;
}

function RoleAction({ target, actor, investments, transactions, requests }) {
  const isSuperAdmin = actor.role === "MAIN_ADMIN";
  const options = isSuperAdmin
    ? [{ value: "INVESTOR", label: ROLE.INVESTOR }, { value: "FIELD_MGR", label: ROLE.FIELD_MGR }, { value: "ADMIN", label: ROLE.ADMIN }]
    : [{ value: "INVESTOR", label: ROLE.INVESTOR }, { value: "FIELD_MGR", label: ROLE.FIELD_MGR }];
  // Preserve the accurate current label for protected roles not assignable by this actor.
  if (!options.some((option) => option.value === target.role)) options.unshift({ value: target.role, label: `${ROLE[target.role] ?? target.role} (restricted)` });
  const [selectedRole, setSelectedRole] = useState(target.role);
  const [changeRole, pending] = useAction(() => api.setRole(actor.id, target.id, selectedRole), "Account role updated and audit logged");
  const currentStatus = accountStatus(target);
  const targetIsActive = currentStatus === "ACTIVE" && approvalStatus(target) === "APPROVED";
  const roleChoicesAllowed = isSuperAdmin || (actor.role === "ADMIN" && ["INVESTOR", "FIELD_MGR"].includes(target.role));
  const leavingInvestor = target.role === "INVESTOR" && selectedRole !== "INVESTOR";
  const hasActiveInvestment = investments.some((inv) => inv.investorId === target.id && inv.status === "ACTIVE");
  const hasOpenRequest = requests.some((req) => req.investorId === target.id && ["PENDING_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_PENDING", "PAYMENT_REJECTED"].includes(req.status));
  const hasPendingTransaction = transactions.some((tx) => tx.userId === target.id && tx.status === "PENDING");
  const hasWalletBalance = balanceOf(transactions, target.id) !== 0;
  let accessBlockReason = "";
  if (target.id === actor.id) accessBlockReason = "Your own role is protected.";
  else if (target.role === "MAIN_ADMIN") accessBlockReason = "The SuperAdmin role is protected.";
  else if (!roleChoicesAllowed) accessBlockReason = "Only the SuperAdmin can change Administrator roles.";
  else if (!targetIsActive) accessBlockReason = "Complete account approval and activate this account before changing its role.";
  let financialBlockReason = "";
  if (!accessBlockReason && leavingInvestor && hasActiveInvestment) financialBlockReason = "Active investment positions must be completed before this investor can change roles.";
  else if (!accessBlockReason && leavingInvestor && hasOpenRequest) financialBlockReason = "Resolve open investment requests and payments before changing this investor's role.";
  else if (!accessBlockReason && leavingInvestor && hasPendingTransaction) financialBlockReason = "Resolve pending wallet transactions before changing this investor's role.";
  else if (!accessBlockReason && leavingInvestor && hasWalletBalance) financialBlockReason = "The investor's wallet must be settled to zero before changing roles.";
  const blockedReason = accessBlockReason || financialBlockReason;
  const canApply = !blockedReason && selectedRole !== target.role && !pending;
  return <div className="min-w-52 space-y-1.5">
    <div className="flex items-center gap-2">
      <SelectInput aria-label={`New role for ${target.name}`} value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} options={options} disabled={!!accessBlockReason || pending} className="min-w-36" />
      <ConfirmAction triggerLabel={pending ? "Saving…" : "Apply"} triggerSize="sm" disabled={!canApply} title="Confirm role change?" description={`Change ${target.name}'s role from ${ROLE[target.role] ?? target.role} to ${ROLE[selectedRole] ?? selectedRole}. ${selectedRole === "ADMIN" ? "This grants administrative access to platform and investor-management functions; verify the person's authorization before proceeding. " : target.role === "ADMIN" ? "This removes administrative permissions immediately. " : selectedRole === "INVESTOR" ? "The account will need approved identity verification before it can invest. " : "Field Manager access permits field-update submission, subject to programme assignment. "}Existing financial, programme, and audit records are retained. The action is recorded in the audit log.`} confirmLabel="Confirm role change" onConfirm={changeRole} />
    </div>
    {blockedReason && <p className="max-w-56 text-xs leading-4 text-muted-foreground">{blockedReason}</p>}
  </div>;
}

function AccountActions({ target, actor }) {
  const status = accountStatus(target);
  const allowed = target.id !== actor.id && target.role !== "MAIN_ADMIN" && (target.role !== "ADMIN" || actor.role === "MAIN_ADMIN");
  const [run, pending] = useAction(async (next) => { await api.setAccountStatus(actor.id, target.id, next); return next; }, (next) => next === "DELETED" ? "Account deleted (financial history retained)." : `Account ${next === "ACTIVE" ? "activated" : "deactivated"}.`);
  if (!allowed) return <span className="text-xs text-muted-foreground">Protected</span>;
  if (status === "DELETED") return <span className="text-xs text-muted-foreground">Deleted · retained for audit</span>;
  if (status === "REJECTED" || approvalStatus(target) === "REJECTED") return <ConfirmAction triggerLabel="Delete" triggerIcon={Trash2} triggerVariant="destructive" disabled={pending} title="Delete this rejected account?" description={`Soft-delete ${target.name} (${target.email}) to remove it from active account management. Financial and audit records are preserved.`} confirmLabel="Delete account" destructive onConfirm={() => run("DELETED")} />;
  if (status === "PENDING" || (target.registrationFlow && approvalStatus(target) !== "APPROVED")) return <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">Awaiting approval</span><ConfirmAction triggerLabel="Delete" triggerIcon={Trash2} triggerVariant="destructive" disabled={pending} title="Delete this pending account?" description={`Soft-delete ${target.name} (${target.email}). This removes the application from active review and permanently blocks sign-in, while preserving audit records.`} confirmLabel="Delete account" destructive onConfirm={() => run("DELETED")} /></div>;
  return <div className="flex flex-wrap gap-2">
    {status === "ACTIVE" ? <ConfirmAction triggerLabel="Deactivate" triggerIcon={LockKeyhole} disabled={pending} title="Deactivate this account?" description={`${target.name} will immediately lose access to AgroFund. Their investment records, ledger entries, and audit history will remain preserved.`} confirmLabel="Deactivate account" destructive onConfirm={() => run("INACTIVE")} /> : <ConfirmAction triggerLabel="Activate" triggerIcon={UserRoundCheck} disabled={pending} title="Activate this account?" description={`Restore sign-in access for ${target.name}. Make sure the account has completed all required approvals before proceeding.`} confirmLabel="Activate account" onConfirm={() => run("ACTIVE")} />}
    <ConfirmAction triggerLabel="Delete" triggerIcon={Trash2} triggerVariant="destructive" disabled={pending} title="Delete this account?" description={`Soft-delete ${target.name} (${target.email}). This permanently blocks sign-in, but financial records are retained to preserve the ledger and audit trail. This action cannot be undone from the interface.`} confirmLabel="Delete account" destructive onConfirm={() => run("DELETED")} />
  </div>;
}

function ApprovalQueue({ actor, users }) {
  const pending = useMemo(() => users.filter((u) => {
    if (!u.registrationFlow || accountStatus(u) !== "PENDING") return false;
    if (actor.role === "ADMIN") return ["INVESTOR", "FIELD_MGR"].includes(u.role) && approvalStatus(u) === "PENDING_ADMIN";
    return approvalStatus(u) === "PENDING_MAIN_ADMIN" && (u.role === "ADMIN" || !!u.approval?.adminApprovedAt);
  }).sort((a, b) => new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0)), [actor.role, users]);
  const countOther = users.filter((u) => u.registrationFlow && accountStatus(u) === "PENDING").length;
  if (!pending.length) return <Card className="mb-6"><CardContent className="flex items-start gap-3 p-5"><div className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div><div><h2 className="font-semibold">No registrations waiting for your review</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">{countOther ? `${countOther} registration(s) are waiting at another approval stage.` : "New registrations will appear here when they are submitted."}</p></div></CardContent></Card>;
  return <Card className="mb-6"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />{actor.role === "MAIN_ADMIN" ? "SuperAdmin · Final Approval Queue" : "Administration · First Review Queue"}</CardTitle><p className="text-sm text-muted-foreground">{actor.role === "MAIN_ADMIN" ? "Approve Administrator applications directly. Investor and Field Manager registrations require a completed first review by an Administrator." : "Review investor and Field Manager registrations. Your approval does not activate their account; the SuperAdmin must complete the final review."}</p></CardHeader><CardContent><DataTable rows={pending} empty="Nothing to review." columns={[
    { key: "who", header: "Applicant", render: (u) => <><b>{u.name}</b><span className="block text-xs text-muted-foreground">{u.email}</span><span className="mt-1 block text-xs text-muted-foreground">Submitted {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "date unavailable"}</span></> },
    { key: "role", header: "Requested access", render: (u) => <StatusBadge status={u.role} /> },
    { key: "status", header: "Approval stage", render: (u) => <StatusBadge status={approvalStatus(u)} /> },
    { key: "decide", header: "Review", render: (u) => <RegistrationDecision target={u} actor={actor} /> },
  ]} /></CardContent></Card>;
}

export default function Users() {
  const { user: actor } = useAuth();
  const users = useDb((s) => s.users);
  const investments = useDb((s) => s.investments);
  const transactions = useDb((s) => s.transactions);
  const requests = useDb((s) => s.investmentRequests);
  const [form, setForm] = useState(blank);
  const [created, setCreated] = useState(null);
  const [create, pending] = useAction(async () => {
    if (form.password.length < 8) throw new Error("Temporary password must contain at least 8 characters.");
    await api.createUser(actor.id, form);
    setCreated({ name: form.name, email: form.email, role: form.role, password: form.password });
    setForm(blank);
  }, "Account created and sent to registration review");
  const set = (key) => (e) => setForm((old) => ({ ...old, [key]: e.target.value }));
  const invalid = form.name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(form.email.trim()) || form.password.length < 8;
  const isMain = actor.role === "MAIN_ADMIN";
  const visibleUsers = useMemo(() => [...users].sort((a, b) => {
    const aDeleted = accountStatus(a) === "DELETED" ? 1 : 0;
    const bDeleted = accountStatus(b) === "DELETED" ? 1 : 0;
    return aDeleted - bDeleted || a.name.localeCompare(b.name);
  }), [users]);

  return <>
    <PageHeader title={isMain ? "SuperAdmin & Access Control" : "Investor, Field & Role Management"} description={isMain ? "Review access applications and manage administrator profiles. Administrator access can only be assigned, activated, deactivated, or deleted by the SuperAdmin." : "Review registrations, manage investor and field-manager access, and change eligible roles. Account deletions are soft-deletes so financial history remains intact."} />
    <ApprovalQueue actor={actor} users={users} />
    <Card className="mb-6"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserPlus className="h-4 w-4" />Create an account for an assisted applicant</CardTitle><p className="text-sm text-muted-foreground">New investor and field-manager accounts remain locked until an Administrator and then the SuperAdmin complete approval. Use the public registration page for Administrator applications.</p></CardHeader><CardContent>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Labeled label="Full name"><TextInput value={form.name} onChange={set("name")} placeholder="Applicant's full name" maxLength={100} /></Labeled>
        <Labeled label="Email address"><TextInput value={form.email} onChange={set("email")} placeholder="applicant@example.com" type="email" maxLength={180} /></Labeled>
        <Labeled label="Mobile number"><TextInput value={form.phone} onChange={set("phone")} placeholder="+880 1XXXXXXXXX" type="tel" /></Labeled>
        <Labeled label="Account role"><SelectInput value={form.role} onChange={set("role")} options={createRoles} /></Labeled>
        <Labeled label="Temporary password"><TextInput value={form.password} onChange={set("password")} type="password" autoComplete="new-password" placeholder="At least 8 characters" /></Labeled>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><ConfirmAction triggerLabel={pending ? "Creating…" : "Create pending account"} triggerSize="default" disabled={invalid || pending} title="Create this pending account?" description={`Create a ${ROLE[form.role]} account for ${form.name.trim()} (${form.email.trim().toLowerCase()}). The account will remain locked until the approval workflow is complete.`} confirmLabel="Create pending account" onConfirm={create} /><p className="text-xs leading-5 text-muted-foreground">The account is not active immediately. Share credentials through a secure channel only after approval; in production, use a secure invitation/reset link.</p></div>
      {created && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><p className="font-semibold">Account request created for {created.name}</p><p className="mt-1">{created.email} · {ROLE[created.role]}</p><p className="mt-2">Temporary password: <code className="rounded bg-white px-2 py-1">{created.password}</code></p><p className="mt-2 text-xs">Share this temporary password privately. The account remains locked until Administrator review followed by SuperAdmin approval. Production should use a secure invitation link.</p></div>}
    </CardContent></Card>
    <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Registered accounts</h2><p className="mt-1 text-xs text-muted-foreground">SuperAdmin can manage administrator profiles. Administrators can manage investor/field-manager accounts.</p></div><span className="text-xs text-muted-foreground">{visibleUsers.length} accounts · {visibleUsers.filter((u) => accountStatus(u) === "ACTIVE").length} active</span></div>
    <DataTable rows={visibleUsers} empty="No accounts found." columns={[
      { key: "n", header: "Account holder", render: (u) => <div className="flex min-w-44 items-center gap-2.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-800">{u.name?.slice(0, 1)?.toUpperCase() ?? "?"}</div><div className="min-w-0"><b className="block truncate">{u.name}</b><span className="block truncate text-xs text-muted-foreground">{u.email}</span></div></div> },
      { key: "p", header: "Mobile", render: (u) => u.phone || "—" },
      { key: "role", header: "Role", render: (u) => <StatusBadge status={u.role} /> },
      { key: "approval", header: "Registration", render: (u) => <div className="space-y-1"><StatusBadge status={approvalStatus(u)} />{u.registrationFlow && u.approval?.adminApprovedAt && <span className="block text-xs text-muted-foreground">First review complete</span>}</div> },
      { key: "status", header: "Account status", render: (u) => <StatusBadge status={accountStatus(u)} /> },
      { key: "kyc", header: "Identity", render: (u) => u.role === "INVESTOR" ? <StatusBadge status={u.kyc?.status ?? "NONE"} /> : <span className="text-xs text-muted-foreground">Not applicable</span> },
      { key: "by", header: "Created by", render: (u) => u.accountCreatedBy ? users.find((x) => x.id === u.accountCreatedBy)?.name ?? "Administrator" : "Seeded demo" },
      { key: "roleChange", header: "Role management", className: "min-w-64", render: (u) => <RoleAction key={`${u.id}-${u.role}-${u.accountStatus ?? "ACTIVE"}`} target={u} actor={actor} investments={investments} transactions={transactions} requests={requests ?? []} /> },
      { key: "actions", header: "Account actions", className: "min-w-64", render: (u) => <AccountActions target={u} actor={actor} /> },
    ]} />
    <div className="mt-4 flex items-start gap-2 rounded-xl border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><p><strong className="text-foreground">Access-control safeguards:</strong> role changes are confirmed and audit logged. Administrators can switch eligible active accounts between Investor and Field Manager; only the SuperAdmin can assign or remove Administrator access. The SuperAdmin account is protected. Investor accounts cannot leave the Investor role while active investments, open requests, pending wallet transactions, or a non-zero wallet balance remain. Deletion is a soft-delete so financial and audit history is retained.</p></div>
  </>;
}
