// Domain API. The mock implementation preserves browser-demo behavior; when mock mode is off,
// the exported API uses remoteApi, which maps these existing UI signatures to the Express backend.
import { commit, getState } from "./mock/store-core.js";
import { env } from "../config/env.js";
import { remoteApi } from "./remote-api.js";
import { availableOf, balanceOf } from "./ledger.js";
import { contractHash } from "../lib/sha256.js";
import { bn, formatBDT, sum } from "../lib/money.js";

const now = () => new Date().toISOString();
const uid = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`;
const fail = (m) => { throw new Error(m); };
const actorOf = (s, id) => s.users.find((u) => u.id === id);
const isAccountActive = (user) => !!user && !["PENDING", "INACTIVE", "DEACTIVATED", "DELETED", "REJECTED"].includes(user.accountStatus ?? "ACTIVE")
  && (user.approvalStatus ?? "APPROVED") === "APPROVED";
const requireAdmin = (s, actorId) => {
  const actor = actorOf(s, actorId);
  if (!actor || !["ADMIN", "MAIN_ADMIN"].includes(actor.role)) fail("This action requires administrator access.");
  if (!isAccountActive(actor)) fail("Your administrator account is not active.");
  return actor;
};
const withAudit = (s, actorId, action, entity, detail) => ({
  ...s, audit: [{ id: uid("a"), actorId, actorName: actorOf(s, actorId)?.name ?? "System", action, entity, detail, date: now() }, ...s.audit],
});
const withNote = (s, userId, type, text) => ({ ...s, notifications: [{ id: uid("n"), userId, type, text, date: now(), read: false }, ...s.notifications] });
const notifyAdmins = (s, text) => s.users.filter((u) => ["ADMIN", "MAIN_ADMIN"].includes(u.role)).reduce((acc, a) => withNote(acc, a.id, "PAYMENT", text), s);
const patch = (arr, id, f) => arr.map((x) => (x.id === id ? { ...x, ...f(x) } : x));

const BD_PHONE = /^01[3-9]\d{8}$/;
export function validateKyc({ kyc, profile }) {
  const { address, nominee } = profile;
  if (!/^(\d{10}|\d{13}|\d{17})$/.test(kyc.nid)) fail("National ID must contain 10, 13, or 17 digits.");
  if (kyc.tin && !/^\d{12}$/.test(kyc.tin)) fail("TIN must contain 12 digits.");
  if (profile.fatherName.trim().length < 2) fail("Enter the investor's father name.");
  if (profile.motherName.trim().length < 2) fail("Enter the investor's mother name.");
  const dob = new Date(profile.dob);
  if (!profile.dob || Number.isNaN(dob.getTime())) fail("Enter a valid date of birth.");
  if ((Date.now() - dob.getTime()) / (365.25 * 864e5) < 18) fail("The investor must be at least 18 years old.");
  if (!profile.gender) fail("Select a gender.");
  if (address.present.trim().length < 10) fail("Enter the full current address.");
  if (!address.district.trim() || !address.division.trim()) fail("Enter the district and division.");
  if (nominee.name.trim().length < 2 || nominee.relation !== "Father") fail("The nominee must be the investor’s father. Enter the father’s name as nominee.");
  if (!nominee.dob) fail("Enter the nominee’s date of birth.");
  if (!/^\d{10,17}$/.test(nominee.nid)) fail("The nominee’s National ID or birth registration number is invalid.");
  if (!BD_PHONE.test(nominee.phone)) fail("Enter a valid nominee mobile number (e.g. 017XXXXXXXX).");
}

const mockApi = {
  invest: async () => fail("Direct investments are disabled. Submit an amount-based request for the single collective programme first."),

  // A request records an amount in the one collective programme. No money moves before approval.
  createInvestmentRequest: async (userId, projectId, amount) => commit((s) => {
    const user = actorOf(s, userId);
    if (!user || user.role !== "INVESTOR") fail("Only investor accounts can submit investment requests.");
    if (!isAccountActive(user)) fail("Your account must be approved and active before submitting an investment request.");
    if (user.kyc?.status !== "VERIFIED") fail("Identity verification must be approved before requesting an investment.");
    const p = s.projects.find((x) => x.id === projectId);
    if (!p || p.status !== "OPEN") fail("The collective investment programme is not currently accepting requests.");
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value < 100000 || value > 5000000000) fail("Enter an investment amount between ৳1,000 and ৳50,000,000, with no more than two decimal places.");
    const openStatuses = ["PENDING_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_PENDING", "PAYMENT_REJECTED"];
    const duplicated = (s.investmentRequests ?? []).some((r) => r.investorId === userId && r.projectId === projectId && r.amount === value && openStatuses.includes(r.status));
    if (duplicated) fail("You already have an open request for this amount in the collective programme.");
    const committed = sum((s.investments ?? []).filter((i) => i.projectId === projectId && i.status === "ACTIVE"), (i) => Number(i.amount) || 0)
      + sum((s.investmentRequests ?? []).filter((r) => r.projectId === projectId && openStatuses.includes(r.status)), (r) => Number(r.amount) || 0);
    if (p.targetAmount && committed + value > p.targetAmount) fail(`The request exceeds the programme's remaining target amount of ${formatBDT(Math.max(0, p.targetAmount - committed))}. Contact support for guidance.`);
    const request = { id: uid("ir"), investorId: userId, projectId, amount: value, status: "PENDING_REVIEW", createdAt: now(), updatedAt: now(), paymentAttempts: [] };
    let next = { ...s, investmentRequests: [request, ...(s.investmentRequests ?? [])] };
    next = notifyAdmins(next, `${user.name} submitted a collective investment request for ${formatBDT(request.amount)}.`);
    next = withNote(next, userId, "REQUEST", `Your collective investment request for ${formatBDT(value)} was submitted. Payment is disabled until an administrator approves the request.`);
    return withAudit(next, userId, "REQUEST_CREATE", request.id, `${p.title}; amount ${formatBDT(value)}`);
  }),

  reviewInvestmentRequest: async (actorId, requestId, approve) => commit((s) => {
    requireAdmin(s, actorId);
    const req = (s.investmentRequests ?? []).find((r) => r.id === requestId);
    if (!req || req.status !== "PENDING_REVIEW") fail("This investment request is no longer awaiting review.");
    const investor = actorOf(s, req.investorId);
    const p = s.projects.find((x) => x.id === req.projectId);
    if (approve) {
      if (!isAccountActive(investor)) fail("The investor account is not active. Activate it only after the required approvals are complete.");
      if (investor?.kyc.status !== "VERIFIED") fail("The investor's identity is not verified. Complete identity review first.");
      if (!p || p.status !== "OPEN") fail("The collective investment programme is not currently accepting requests.");
    }
    let next = { ...s };
    next.investmentRequests = patch(next.investmentRequests ?? [], requestId, () => ({ status: approve ? "APPROVED_AWAITING_PAYMENT" : "REJECTED", reviewedBy: actorId, reviewedAt: now(), updatedAt: now() }));
    next = withNote(next, req.investorId, "REQUEST", approve ? `${p.title}: your request for ${formatBDT(req.amount)} is approved. Transfer the exact amount to the verified organization bank account, then submit your bank reference.` : `${p?.title ?? "Your investment request"}: your request was declined. No payment is due.`);
    return withAudit(next, actorId, approve ? "REQUEST_APPROVE" : "REQUEST_REJECT", requestId, `${p?.title ?? req.projectId}; ${formatBDT(req.amount)}`);
  }),

  submitInvestmentPayment: async (userId, requestId, { channel = "BANK", trxId, proof = "" }) => commit((s) => {
    const req = (s.investmentRequests ?? []).find((r) => r.id === requestId);
    if (!req || req.investorId !== userId) fail("Investment request not found.");
    if (!["APPROVED_AWAITING_PAYMENT", "PAYMENT_REJECTED"].includes(req.status)) fail("Payment can only be submitted after the investment request is approved.");
    const investor = actorOf(s, userId);
    if (!investor || investor.role !== "INVESTOR") fail("Only investor accounts can submit programme payments.");
    if (!isAccountActive(investor)) fail("Your account must be active before submitting a project payment.");
    if (investor.kyc?.status !== "VERIFIED") fail("Your identity verification must remain approved before payment.");
    const project = s.projects.find((p) => p.id === req.projectId);
    if (!project) fail("The project for this request could not be found. Contact support before paying.");
    if (channel !== "BANK") fail("Only organization bank transfer is supported for investment payments.");
    const paymentDetail = project.payment?.bank;
    if (!project.payment?.bankVerified || !paymentDetail || /demo only|replace before launch|not configured/i.test(`${paymentDetail} ${project.payment?.bankAccountNumber ?? ""}`) || !(project.payment?.bankName && project.payment?.bankAccountName && project.payment?.bankAccountNumber)) fail("Verified organization bank details are not configured. Contact Premium Agro support. Do not transfer funds to placeholder demo details.");
    const ref = String(trxId ?? "").trim();
    if (ref.length < 5 || ref.length > 100) fail("Enter a valid bank transaction reference (5–100 characters).");
    const alreadyUsed = s.transactions.some((tx) => tx.trxId?.trim().toLowerCase() === ref.toLowerCase())
      || (s.investments ?? []).some((inv) => inv.payment?.trxId?.trim().toLowerCase() === ref.toLowerCase())
      || (s.investmentRequests ?? []).some((r) => (r.paymentAttempts ?? []).some((a) => a.trxId?.trim().toLowerCase() === ref.toLowerCase()));
    if (alreadyUsed) fail("This transaction reference has already been submitted. Check the reference or contact support.");
    const proofSize = typeof proof === "string" ? proof.length : proof?.dataUrl?.length ?? 0;
    if (proof && (typeof proof !== "object" || typeof proof.dataUrl !== "string" || !/^(data:image\/|data:application\/pdf;)/i.test(proof.dataUrl))) fail("Payment proof must be a receipt image or PDF.");
    if (proofSize > 7_000_000) fail("Payment proof is too large. Please use a file smaller than 5 MB.");
    const attempt = { id: uid("pay"), channel, trxId: ref, proof: proof ? { name: String(proof.name ?? "Receipt").slice(0, 160), type: String(proof.type ?? "").slice(0, 100), dataUrl: proof.dataUrl } : null, submittedAt: now(), status: "PENDING" };
    let next = { ...s, investmentRequests: patch(s.investmentRequests ?? [], requestId, (r) => ({ status: "PAYMENT_PENDING", payment: attempt, paymentAttempts: [...(r.paymentAttempts ?? []), attempt], updatedAt: now() })) };
    next = notifyAdmins(next, `${formatBDT(req.amount)} payment for ${s.projects.find((p) => p.id === req.projectId)?.title ?? req.projectId} is awaiting confirmation.`);
    next = withNote(next, userId, "PAYMENT", "Your payment information was submitted for review. Your investment becomes active after payment confirmation.");
    return withAudit(next, userId, "INVEST_DIRECT", requestId, `${channel} ${ref}`);
  }),

  reviewInvestmentPayment: async (actorId, requestId, approve) => commit((s) => {
    requireAdmin(s, actorId);
    const req = (s.investmentRequests ?? []).find((r) => r.id === requestId);
    if (!req || req.status !== "PAYMENT_PENDING" || !req.payment) fail("This payment is no longer awaiting review.");
    const investor = actorOf(s, req.investorId);
    const p = s.projects.find((x) => x.id === req.projectId);
    if (approve && (!isAccountActive(investor) || investor?.kyc.status !== "VERIFIED")) fail("Only an active, identity-verified investor can have a payment approved.");
    if (req.payment.channel !== "BANK") fail("Only verified organization bank transfers can activate an investment.");
    const reviewedAt = now();
    let next = { ...s };
    if (approve) {
      const base = { id: uid("inv"), investorId: req.investorId, projectId: req.projectId, amount: req.amount, status: "ACTIVE", createdAt: reviewedAt, payment: req.payment };
      const investment = { ...base, contractHash: contractHash(base) };
      next.investments = [investment, ...next.investments];
      next.projects = patch(next.projects, req.projectId, (program) => ({ raisedAmount: (Number(program.raisedAmount) || 0) + req.amount }));
      next.transactions = [...next.transactions,
        { id: uid("t"), userId: req.investorId, type: "DEPOSIT", amount: req.amount, date: reviewedAt, channel: req.payment.channel, trxId: req.payment.trxId, status: "COMPLETED", ref: req.projectId },
        { id: uid("t"), userId: req.investorId, type: "INVEST", amount: -req.amount, date: reviewedAt, channel: null, trxId: null, status: "COMPLETED", ref: req.projectId }];
      next.investmentRequests = patch(next.investmentRequests ?? [], requestId, (r) => ({
        status: "PAID", investmentId: investment.id, paidAt: reviewedAt, reviewedBy: actorId, reviewedAt, updatedAt: reviewedAt,
        payment: { ...r.payment, status: "APPROVED", reviewedBy: actorId, reviewedAt },
        paymentAttempts: (r.paymentAttempts ?? []).map((attempt) => attempt.id === r.payment.id ? { ...attempt, status: "APPROVED", reviewedBy: actorId, reviewedAt } : attempt),
      }));
      next = withNote(next, req.investorId, "PAYMENT", `Payment confirmed for ${p.title}. Your investment is active and your agreement is available in the portfolio.`);
    } else {
      const retryAllowed = isAccountActive(investor);
      next.investmentRequests = patch(next.investmentRequests ?? [], requestId, (r) => ({
        status: retryAllowed ? "PAYMENT_REJECTED" : "CANCELLED", reviewedBy: actorId, reviewedAt, updatedAt: reviewedAt,
        ...(retryAllowed ? {} : { cancelledAt: reviewedAt, cancelReason: "Investor account inactive during payment review" }),
        payment: { ...r.payment, status: "REJECTED", reviewedBy: actorId, reviewedAt },
        paymentAttempts: (r.paymentAttempts ?? []).map((attempt) => attempt.id === r.payment.id ? { ...attempt, status: "REJECTED", reviewedBy: actorId, reviewedAt } : attempt),
      }));
      next = withNote(next, req.investorId, "PAYMENT", retryAllowed
        ? `Payment for ${p.title} could not be confirmed. No investment has been activated. You may submit corrected bank details or cancel the request.`
        : `Payment for ${p.title} could not be confirmed. Because the account is inactive, the request was cancelled.`);
    }
    return withAudit(next, actorId, approve ? "PAYMENT_APPROVE" : "PAYMENT_REJECT", requestId, req.payment.trxId);
  }),

  cancelInvestmentRequest: async (userId, requestId) => commit((s) => {
    const req = (s.investmentRequests ?? []).find((r) => r.id === requestId);
    if (!req || req.investorId !== userId) fail("Investment request not found.");
    if (!["PENDING_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_REJECTED"].includes(req.status)) fail("This request cannot be cancelled in its current stage.");
    let next = { ...s };
    next.investmentRequests = patch(next.investmentRequests ?? [], requestId, () => ({ status: "CANCELLED", cancelledAt: now(), updatedAt: now() }));
    next = withNote(next, userId, "REQUEST", "Your investment request was cancelled. No payment is due for a cancelled request.");
    return withAudit(next, userId, "REQUEST_REJECT", requestId, "Cancelled by investor");
  }),

  investDirect: async () => fail("Direct investment payment is disabled. Submit an investment request, wait for approval, then use the verified bank details shown on that request."),

  reviewProjectPayment: async () => fail("Legacy direct-payment review is disabled. Use Payment Review for payments linked to approved investment requests."),

  requestDeposit: async () => fail("Direct wallet deposits are disabled. Submit an investment request and pay only after that request is approved."),

  requestWithdraw: async (userId, { amount, channel = "BANK" }) => commit((s) => {
    const investor = actorOf(s, userId);
    if (!investor || investor.role !== "INVESTOR") fail("Only investor accounts can request withdrawals.");
    if (!isAccountActive(investor)) fail("Your account must be approved and active before requesting wallet transactions.");
    if (!Number.isSafeInteger(amount) || amount <= 0) fail("Enter a valid withdrawal amount.");
    if (channel !== "BANK") fail("Only bank transfers are supported for withdrawals.");
    const bank = investor.bank ?? {};
    if (![bank.bankName, bank.accName, bank.accNum].every((value) => typeof value === "string" && value.trim().length >= 2)) fail("Save the receiving bank name, account holder and account number in your profile before requesting a withdrawal.");
    const destination = `${bank.bankName.trim()} — ${bank.accName.trim()} • ${bank.accNum.trim()}${bank.branch?.trim() ? ` • ${bank.branch.trim()} Branch` : ""}`;
    if (amount > availableOf(s.transactions, userId)) fail("Withdrawal amount exceeds the available balance.");
    return withAudit({ ...s, transactions: [...s.transactions, { id: uid("t"), userId, type: "WITHDRAW", amount: -amount, date: now(), channel, trxId: destination, status: "PENDING" }] }, userId, "WITHDRAW_REQUEST", userId, `${channel} ${formatBDT(amount)}`);
  }),

  reviewTx: async (actorId, txId, approve) => commit((s) => {
    requireAdmin(s, actorId);
    const t = s.transactions.find((x) => x.id === txId);
    if (!t || t.status !== "PENDING") fail("This transaction is not pending.");
    let next = { ...s, transactions: patch(s.transactions, txId, () => ({ status: approve ? "COMPLETED" : "REJECTED", reviewedBy: actorId })) };
    const label = t.type === "DEPOSIT" ? "Deposit" : "Withdrawal";
    next = withNote(next, t.userId, "PAYMENT", `Your ${label.toLowerCase()} of ${formatBDT(Math.abs(t.amount))} has been ${approve ? "approved." : "rejected."}`);
    return withAudit(next, actorId, approve ? "TX_APPROVE" : "TX_REJECT", txId, `${t.type} ${t.amount}`);
  }),

  submitKyc: async (userId, { kyc, profile }) => commit((s) => {
    const investor = actorOf(s, userId);
    if (!investor || investor.role !== "INVESTOR") fail("Only investor accounts can submit identity information.");
    if (!isAccountActive(investor)) fail("Your account must be approved and active before submitting identity information.");
    if (["PENDING", "VERIFIED"].includes(investor.kyc?.status)) fail("Your identity application is already under review or verified.");
    const normalizedProfile = { ...profile, nominee: { ...profile.nominee, name: profile.fatherName, relation: "Father" } };
    validateKyc({ kyc, profile: normalizedProfile });
    for (const key of ["nidFront", "nidBack", "photo"]) {
      const document = kyc?.docs?.[key];
      if (!document || typeof document !== "object" || typeof document.dataUrl !== "string") fail(`Upload the ${key === "nidFront" ? "front of the National ID" : key === "nidBack" ? "back of the National ID" : "recent profile photo"} before submitting identity verification.`);
      if (document.dataUrl.length > 700_000) fail("An identity document is too large for the local demo. Compress it or use an image scan.");
      if (key === "photo" ? !/^data:image\//i.test(document.dataUrl) : !/^(data:image\/|data:application\/pdf;)/i.test(document.dataUrl)) fail("Identity documents must be an image or PDF, and the recent photo must be an image.");
    }
    let next = { ...s, users: patch(s.users, userId, (u) => ({ profile: normalizedProfile, kyc: { ...u.kyc, ...kyc, status: "PENDING" } })) };
    next = notifyAdmins(next, `${investor.name} submitted identity information for verification.`);
    return withAudit(next, userId, "KYC_SUBMIT", userId, "Identity information submitted for review");
  }),
  reviewKyc: async (actorId, userId, approve) => commit((s) => {
    requireAdmin(s, actorId);
    const target = actorOf(s, userId);
    if (!target || target.role !== "INVESTOR") fail("Investor account not found.");
    if (target.kyc.status !== "PENDING") fail("This identity application is not awaiting review.");
    if (approve && !["nidFront", "nidBack", "photo"].every((key) => {
      const doc = target.kyc.docs?.[key];
      return doc && typeof doc === "object" && typeof doc.dataUrl === "string" && doc.dataUrl.length > 0;
    })) fail("The investor has not supplied all actual identity-document files. Ask them to resubmit the missing documents before verification.");
    let next = { ...s, users: patch(s.users, userId, (u) => ({ kyc: { ...u.kyc, status: approve ? "VERIFIED" : "REJECTED" } })) };
    next = withNote(next, userId, "KYC", approve ? "Your identity has been verified. You can now invest." : "Your KYC application was rejected. Edit the information and submit it again.");
    return withAudit(next, actorId, approve ? "KYC_APPROVE" : "KYC_REJECT", userId, "");
  }),
  updateProfile: async (userId, fields) => commit((s) => {
    const account = actorOf(s, userId);
    if (!account) fail("Account not found.");
    if (!isAccountActive(account)) fail("Your account must be active to update profile settings.");
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) fail("Invalid profile update.");
    const keys = Object.keys(fields);
    if (keys.some((key) => !new Set(["bank", "avatar", "autoReinvest"]).has(key))) fail("This profile update includes a protected or unsupported field.");
    if (Object.hasOwn(fields, "avatar") && fields.avatar !== "" && (typeof fields.avatar !== "string" || !fields.avatar.startsWith("data:image/") || fields.avatar.length > 500_000)) fail("Profile photo must be a compressed image under the demo storage limit.");
    if (Object.hasOwn(fields, "autoReinvest") && typeof fields.autoReinvest !== "boolean") fail("Automatic reinvestment must be enabled or disabled.");
    if (Object.hasOwn(fields, "bank")) {
      if (!fields.bank || typeof fields.bank !== "object" || Array.isArray(fields.bank) || Object.keys(fields.bank).some((key) => !new Set(["accName", "accNum", "bankName", "branch"]).has(key))) fail("Invalid bank details.");
      if (Object.values(fields.bank).some((value) => typeof value !== "string" || value.length > 160)) fail("Bank details must be valid text under 160 characters.");
    }
    const next = { ...s, users: patch(s.users, userId, (u) => ({ ...fields, bank: { ...u.bank, ...fields.bank } })) };
    return withAudit(next, userId, "PROFILE_UPDATE", userId, keys.join(", "));
  }),

  updateProgram: async (actorId, data) => commit((s) => {
    requireAdmin(s, actorId);
    if (!data || typeof data !== "object") fail("Enter the collective programme details.");
    const program = s.projects[0];
    if (!program || s.projects.length !== 1) fail("The data store must contain exactly one collective investment programme.");
    const title = String(data.title ?? program.title).trim();
    const location = String(data.location ?? program.location).trim();
    const description = String(data.description ?? program.description).trim();
    const bankName = String(data.bankName ?? program.payment?.bankName ?? "").trim();
    const bankAccountName = String(data.bankAccountName ?? program.payment?.bankAccountName ?? "").trim();
    const bankAccountNumber = String(data.bankAccountNumber ?? program.payment?.bankAccountNumber ?? "").trim();
    const bankBranch = String(data.bankBranch ?? program.payment?.bankBranch ?? "").trim();
    if (title.length < 3 || title.length > 120 || location.length < 2 || location.length > 160 || description.length < 20 || description.length > 6000) fail("Enter a valid programme title, location and description.");
    if (!bankName || !bankAccountName || bankAccountNumber.length < 5) fail("A bank name, account holder and account number are required before saving account details.");
    if (data.bankVerified !== undefined && typeof data.bankVerified !== "boolean") fail("Bank verification must be an explicit boolean confirmation.");
    const bankVerified = data.bankVerified === true;
    if (bankVerified && /demo|replace|placeholder|not configured/i.test(`${bankName} ${bankAccountName} ${bankAccountNumber}`)) fail("Demo or placeholder bank details cannot be marked as verified.");
    const next = { ...s, projects: patch(s.projects, program.id, () => ({ title, location, description, status: program.status === "OPEN" && !bankVerified ? "PAUSED" : program.status, payment: { ...program.payment,
      bankName, bankAccountName, bankAccountNumber, bankBranch, bankVerified,
      bank: `${bankName}${bankBranch ? ` — ${bankBranch} Branch` : ""}; Account holder: ${bankAccountName}; Account: ${bankAccountNumber}${bankVerified ? "" : " (not verified)"}`,
    } })) };
    return withAudit(next, actorId, "PROGRAM_UPDATE", program.id, `Collective programme settings saved; receiving bank ${bankVerified ? "verified" : "not verified"}`);
  }),

  createAgroProject: async (actorId, data) => commit((s) => {
    const actor = requireAdmin(s, actorId);
    const program = s.projects[0];
    if (!program || program.status === "LIQUIDATED") fail("The pooled programme is not available for new project setup.");
    const title = String(data?.title ?? "").trim();
    const category = String(data?.category ?? "OTHER").trim().toUpperCase();
    const location = String(data?.location ?? "").trim();
    const summary = String(data?.summary ?? "").trim().slice(0, 300);
    const description = String(data?.description ?? "").trim();
    if (title.length < 3 || title.length > 160 || location.length < 2 || location.length > 200 || description.length < 20 || description.length > 6000 || !new Set(["LIVESTOCK", "ORCHARD", "CROPS", "DAIRY", "AQUACULTURE", "OTHER"]).has(category)) fail("Enter a valid project name, supported category, location and description.");
    const dateValid = (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
    if (!dateValid(data.startDate) || !dateValid(data.expectedEndDate) || (data.startDate && data.expectedEndDate && data.expectedEndDate < data.startDate)) fail("Enter valid project dates; expected end date must be on or after start date.");
    if ((s.agroProjects ?? []).some((p) => p.programmeId === program.id && p.title.toLowerCase() === title.toLowerCase())) fail("An underlying project with this name already exists.");
    const project = { id: uid("agp"), programmeId: program.id, title, category, location, summary, description, status: "PLANNING", progress: 0, stage: "Planning and preparation", startDate: data.startDate ?? "", expectedEndDate: data.expectedEndDate ?? "", createdBy: actorId, updatedBy: actorId, createdAt: now(), updatedAt: now() };
    let next = { ...s, agroProjects: [...(s.agroProjects ?? []), project] };
    return withAudit(next, actorId, "AGRO_PROJECT_CREATE", project.id, `${title}; added under ${program.title}`);
  }),

  updateAgroProject: async (actorId, projectId, data) => commit((s) => {
    const actor = requireAdmin(s, actorId);
    const project = (s.agroProjects ?? []).find((p) => p.id === projectId);
    if (!project) fail("Underlying project not found.");
    if (["ARCHIVED", "COMPLETED"].includes(project.status)) fail("Archived or completed projects are read-only to preserve history.");
    const nextFields = { updatedBy: actorId, updatedAt: now() };
    for (const [key, label, min, max] of [["title", "Project name", 3, 160], ["category", "Project category", 2, 64], ["location", "Project location", 2, 200], ["description", "Project description", 20, 6000]]) {
      if (Object.hasOwn(data, key)) { const v = String(data[key] ?? "").trim(); if (v.length < min || v.length > max) fail(`${label} must be between ${min} and ${max} characters.`); nextFields[key] = key === "category" ? v.toUpperCase() : v; if (key === "category" && !new Set(["LIVESTOCK", "ORCHARD", "CROPS", "DAIRY", "AQUACULTURE", "OTHER"]).has(nextFields[key])) fail("Choose a supported underlying project category."); }
    }
    if (Object.hasOwn(data, "summary")) nextFields.summary = String(data.summary ?? "").trim().slice(0, 300);
    for (const key of ["startDate", "expectedEndDate"]) if (Object.hasOwn(data, key)) nextFields[key] = data[key] ?? "";
    const start = nextFields.startDate ?? project.startDate; const end = nextFields.expectedEndDate ?? project.expectedEndDate;
    if (start && end && end < start) fail("Expected end date must be on or after the start date.");
    if (nextFields.title && (s.agroProjects ?? []).some((p) => p.id !== projectId && p.programmeId === project.programmeId && p.title.toLowerCase() === nextFields.title.toLowerCase())) fail("Another active project already uses this name.");
    const agroProjects = patch(s.agroProjects, projectId, () => nextFields);
    return withAudit({ ...s, agroProjects }, actorId, "AGRO_PROJECT_UPDATE", projectId, Object.keys(nextFields).join(", "));
  }),

  setAgroProjectStatus: async (actorId, projectId, status) => commit((s) => {
    requireAdmin(s, actorId);
    const project = (s.agroProjects ?? []).find((p) => p.id === projectId);
    if (!project) fail("Underlying project not found.");
    const allowed = { PLANNING: ["ACTIVE", "PAUSED"], ACTIVE: ["PAUSED", "COMPLETED"], PAUSED: ["ACTIVE", "COMPLETED"], COMPLETED: [], ARCHIVED: [] };
    if (!(allowed[project.status] ?? []).includes(status)) fail(`Invalid project status transition from ${project.status} to ${status}.`);
    if (status === "ACTIVE") {
      const parent = s.projects.find((p) => p.id === project.programmeId);
      if (!parent || parent.status !== "IN_PROGRESS") fail("Start pooled programme operations before activating an underlying project.");
      const funding = (s.projectFundingAllocations ?? []).filter((a) => a.projectId === projectId && a.status === "APPROVED").reduce((n, a) => n + a.amount, 0);
      if (funding <= 0) fail("Approve a capital allocation for this project before activating it.");
    }
    if (status === "COMPLETED" && (s.fieldLogs ?? []).some((l) => l.projectId === projectId && l.status === "PENDING_REVIEW") || status === "COMPLETED" && (s.financialEntries ?? []).some((e) => e.projectId === projectId && e.status === "PENDING") || status === "COMPLETED" && (s.projectFundingAllocations ?? []).some((a) => a.projectId === projectId && a.status === "PENDING")) fail("Resolve pending field updates, financial entries and capital reviews before completing the project.");
    const next = { ...s, agroProjects: patch(s.agroProjects, projectId, () => ({ status, ...(status === "COMPLETED" ? { progress: 100, stage: "Completed" } : {}), updatedBy: actorId, updatedAt: now() })) };
    return withAudit(next, actorId, "AGRO_PROJECT_STATUS", projectId, `${project.status} → ${status}`);
  }),

  setAgroProjectProgress: async (actorId, projectId, { progress, stage }) => commit((s) => {
    requireAdmin(s, actorId);
    const project = (s.agroProjects ?? []).find((p) => p.id === projectId);
    if (!project) fail("Underlying project not found.");
    if (["COMPLETED", "ARCHIVED"].includes(project.status)) fail("Progress is locked for completed or archived projects.");
    const pct = Number(progress); const cleanStage = String(stage ?? "").trim();
    if (!Number.isInteger(pct) || pct < 0 || pct > 100 || cleanStage.length < 2 || cleanStage.length > 160) fail("Enter a whole-number progress percentage from 0 to 100 and a valid stage.");
    let next = { ...s, agroProjects: patch(s.agroProjects, projectId, () => ({ progress: pct, stage: cleanStage, updatedBy: actorId, updatedAt: now() })) };
    const holders = [...new Set(s.investments.filter((i) => i.projectId === project.programmeId && i.status === "ACTIVE").map((i) => i.investorId))];
    holders.forEach((id) => { next = withNote(next, id, "FIELD", `${project.title} progress updated to ${pct}% — ${cleanStage}.`); });
    return withAudit(next, actorId, "AGRO_PROJECT_PROGRESS", projectId, `${pct}% — ${cleanStage}`);
  }),

  deleteAgroProject: async (actorId, projectId) => commit((s) => {
    requireAdmin(s, actorId);
    const project = (s.agroProjects ?? []).find((p) => p.id === projectId);
    if (!project) fail("Underlying project not found.");
    if (project.status === "ACTIVE") fail("Pause an active project before attempting deletion.");
    const hasHistory = (s.fieldLogs ?? []).some((x) => x.projectId === projectId) || (s.financialEntries ?? []).some((x) => x.projectId === projectId) || (s.projectFundingAllocations ?? []).some((x) => x.projectId === projectId);
    if (hasHistory) fail("This project has operational or financial history. Archive it instead so reports and audit records remain intact.");
    const next = { ...s, agroProjects: s.agroProjects.filter((p) => p.id !== projectId) };
    return withAudit(next, actorId, "AGRO_PROJECT_DELETE", projectId, `${project.title}; deleted because it has no linked history`);
  }),

  archiveAgroProject: async (actorId, projectId) => commit((s) => {
    requireAdmin(s, actorId);
    const project = (s.agroProjects ?? []).find((p) => p.id === projectId);
    if (!project) fail("Underlying project not found.");
    if (project.status === "ARCHIVED") fail("This project is already archived.");
    if (project.status === "ACTIVE") fail("Pause or complete an active project before archiving it.");
    if ((s.projectFundingAllocations ?? []).some((a) => a.projectId === projectId && a.status === "PENDING")
      || (s.fieldLogs ?? []).some((l) => l.projectId === projectId && l.status === "PENDING_REVIEW")
      || (s.financialEntries ?? []).some((e) => e.projectId === projectId && e.status === "PENDING")) fail("Resolve pending field, financial and capital-allocation reviews before archiving the project.");
    const next = { ...s, agroProjects: patch(s.agroProjects, projectId, () => ({ status: "ARCHIVED", archivedAt: now(), archivedBy: actorId, updatedBy: actorId, updatedAt: now() })) };
    return withAudit(next, actorId, "AGRO_PROJECT_ARCHIVE", projectId, `${project.title}; history retained`);
  }),

  requestProjectFunding: async (actorId, projectId, amount, note = "") => commit((s) => {
    const actor = requireAdmin(s, actorId);
    const project = (s.agroProjects ?? []).find((p) => p.id === projectId);
    if (!project || ["ARCHIVED", "COMPLETED"].includes(project.status)) fail("Choose an available underlying project.");
    const program = s.projects.find((p) => p.id === project.programmeId);
    if (!program || program.status !== "IN_PROGRESS") fail("Project capital can only be allocated after programme operations start.");
    const value = Number(amount);
    if (!Number.isSafeInteger(value) || value < 100000) fail("Enter a capital allocation of at least ৳1,000, using no more than two decimal places.");
    const cleanNote = String(note ?? "").trim(); if (cleanNote.length > 1000) fail("Allocation note must be no longer than 1,000 characters.");
    const capital = sum(s.investments.filter((i) => i.projectId === program.id && i.status === "ACTIVE"), (i) => i.amount);
    const committed = sum((s.projectFundingAllocations ?? []).filter((a) => a.programmeId === program.id && ["PENDING", "APPROVED"].includes(a.status)), (a) => a.amount);
    if (committed + value > capital) fail(`Allocation exceeds unallocated active programme capital of ${formatBDT(Math.max(0, capital - committed))}.`);
    const allocation = { id: uid("pfa"), programmeId: program.id, projectId, amount: value, note: cleanNote, status: "PENDING", createdBy: actorId, createdAt: now() };
    let next = { ...s, projectFundingAllocations: [...(s.projectFundingAllocations ?? []), allocation] };
    next = notifyAdmins(next, `${actor.name} proposed ${formatBDT(value)} pooled capital allocation for ${project.title}; independent review is required.`);
    return withAudit(next, actorId, "PROJECT_FUNDING_REQUEST", allocation.id, `${project.title}; ${formatBDT(value)}; awaiting independent review`);
  }),

  reviewProjectFunding: async (actorId, allocationId, approve, reviewNote = "") => commit((s) => {
    requireAdmin(s, actorId);
    const allocation = (s.projectFundingAllocations ?? []).find((a) => a.id === allocationId && a.status === "PENDING");
    if (!allocation) fail("This capital allocation is no longer awaiting review.");
    if (allocation.createdBy === actorId) fail("A different administrator must review this allocation.");
    const note = String(reviewNote ?? "").trim().slice(0, 500); if (!approve && note.length < 5) fail("Provide a rejection reason of at least 5 characters.");
    const project = (s.agroProjects ?? []).find((p) => p.id === allocation.projectId);
    const program = s.projects.find((p) => p.id === allocation.programmeId);
    if (!project || ["ARCHIVED", "COMPLETED"].includes(project.status) || !program) fail("The project or parent programme is no longer available for a new allocation.");
    if (approve && program.status !== "IN_PROGRESS") fail("The pooled programme must be In Progress to approve project capital allocations.");
    if (approve) {
      const capital = sum(s.investments.filter((i) => i.projectId === program.id && i.status === "ACTIVE"), (i) => i.amount);
      const committed = sum((s.projectFundingAllocations ?? []).filter((a) => a.programmeId === program.id && a.id !== allocation.id && ["PENDING", "APPROVED"].includes(a.status)), (a) => a.amount);
      if (committed + allocation.amount > capital) fail("The programme's available capital changed. Submit a revised allocation proposal.");
    }
    const next = { ...s, projectFundingAllocations: patch(s.projectFundingAllocations ?? [], allocationId, () => ({ status: approve ? "APPROVED" : "REJECTED", reviewedBy: actorId, reviewedAt: now(), reviewNote: note })) };
    const notified = withNote(next, allocation.createdBy, "FINANCE", approve ? `Your pooled-capital allocation proposal for ${project.title} was approved.` : `Your capital-allocation proposal for ${project.title} was rejected: ${note}`);
    return withAudit(notified, actorId, approve ? "PROJECT_FUNDING_APPROVE" : "PROJECT_FUNDING_REJECT", allocationId, `${project.title}; ${formatBDT(allocation.amount)}; ${note || "Approved"}`);
  }),

  createProject: async (actorId) => {
    requireAdmin(getState(), actorId);
    fail("Create an underlying agro project under the single pooled programme using the project manager.");
  },
  setProgramStatus: async (actorId, projectId, status) => commit((s) => {
    requireAdmin(s, actorId);
    const program = s.projects.find((item) => item.id === projectId);
    if (!program || s.projects.length !== 1) fail("The collective programme is not configured correctly.");
    if (!["OPEN", "PAUSED", "IN_PROGRESS"].includes(status)) fail("Use the programme lifecycle controls to open requests, pause, start operations or resume operations.");
    const transitions = {
      PAUSED: program.operationsStartedAt ? ["IN_PROGRESS"] : ["OPEN"],
      OPEN: ["PAUSED", "IN_PROGRESS"],
      IN_PROGRESS: ["PAUSED"],
    };
    if (!(transitions[program.status] ?? []).includes(status)) fail(`Invalid programme transition from ${program.status} to ${status}.`);
    if (status === "OPEN" && !(program.payment?.bankVerified && program.payment?.bankName && program.payment?.bankAccountName && program.payment?.bankAccountNumber && !/demo|replace|placeholder/i.test(`${program.payment.bankName} ${program.payment.bankAccountName} ${program.payment.bankAccountNumber}`))) {
      fail("Verify and save the real Premium Agro organization bank details before opening investment requests.");
    }
    let operationsStartedAt = program.operationsStartedAt ?? null;
    if (status === "IN_PROGRESS") {
      const activePositions = s.investments.filter((investment) => investment.projectId === projectId && investment.status === "ACTIVE").length;
      if (!activePositions) fail("At least one confirmed active investment is required before starting programme operations.");
      const unsettledRequests = (s.investmentRequests ?? []).filter((request) => request.projectId === projectId && ["PENDING_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_PENDING", "PAYMENT_REJECTED"].includes(request.status));
      if (unsettledRequests.length) fail("Resolve all open investment requests and payment reviews before starting programme operations.");
      operationsStartedAt = operationsStartedAt ?? now();
    }
    const next = { ...s, projects: patch(s.projects, projectId, () => ({ status, operationsStartedAt })) };
    return withAudit(next, actorId, "PROGRAM_STATUS", projectId, `${program.status} → ${status}`);
  }),

  setProjectStatus: async (actorId, projectId, status) => commit((s) => {
    requireAdmin(s, actorId);
    const project = s.projects.find((x) => x.id === projectId);
    if (!project) fail("Project not found.");
    const allowedNext = { DRAFT: "UPCOMING", UPCOMING: "OPEN", FUNDED: "IN_PROGRESS" }[project.status];
    if (!allowedNext || status !== allowedNext) fail(`Invalid project transition from ${project.status} to ${status}.`);
    if (status === "IN_PROGRESS" && (s.investments.some((i) => i.projectId === projectId && i.status === "PENDING_PAYMENT") || (s.investmentRequests ?? []).some((r) => r.projectId === projectId && ["APPROVED_AWAITING_PAYMENT", "PAYMENT_PENDING", "PAYMENT_REJECTED"].includes(r.status)))) fail("Some programme payments are still awaiting verification.");
    if (status === "OPEN" && !(project.payment?.bankName && project.payment?.bankAccountName && project.payment?.bankAccountNumber)) fail("Configure and verify the receiving bank name, account holder, and account number before opening this project.");
    return withAudit({ ...s, projects: patch(s.projects, projectId, () => ({ status })) }, actorId, "PROJECT_STATUS", projectId, status);
  }),

  setProjectProgress: async (actorId, projectId, { progress, stage }) => commit((s) => {
    requireAdmin(s, actorId);
    const program = s.projects.find((p) => p.id === projectId);
    if (!program) fail("Programme not found.");
    if (program.status === "LIQUIDATED") fail("The completed programme is closed; progress cannot be changed after settlement.");
    const pct = Number(progress);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) fail("Project progress must be between 0 and 100%.");
    if (!String(stage ?? "").trim()) fail("Enter the current project stage.");
    const next = { ...s, projects: patch(s.projects, projectId, () => ({ progress: Math.round(pct), stage: String(stage).trim(), progressUpdatedAt: now() })) };
    return withAudit(next, actorId, "PROJECT_STATUS", projectId, `${Math.round(pct)}% — ${String(stage).trim()}`);
  }),

  addFieldLog: async (actorId, { projectId, type, tag, value, unit, note, media, notifyInvestors }) => commit((s) => {
    const actor = actorOf(s, actorId);
    if (!actor || actor.role !== "FIELD_MGR") fail("Only Field Managers can submit field updates.");
    if (!isAccountActive(actor)) fail("Your Field Manager account must be approved and active before submitting field updates.");
    if (!projectId) fail("Select a project.");
    const project = (s.agroProjects ?? []).find((p) => p.id === projectId);
    const program = s.projects.find((p) => p.id === project?.programmeId);
    if (!project || project.status !== "ACTIVE" || program?.status !== "IN_PROGRESS") fail("Choose an active underlying project while the pooled programme is in progress.");
    if (!new Set(["WEIGHT", "FEED", "HEALTH", "STAGE", "HARVEST"]).has(type)) fail("Choose a valid field update type.");
    const numberValue = value === "" || value == null ? null : Number(value);
    if (numberValue !== null && (!Number.isFinite(numberValue) || numberValue < 0)) fail("Measurement values must be zero or greater.");
    const cleanNote = String(note ?? "").trim();
    if (cleanNote.length > 2000) fail("Field notes must be no longer than 2,000 characters.");
    const images = Array.isArray(media) ? media : [];
    if (images.length > 3 || images.some((item) => !item || typeof item !== "object" || typeof item.dataUrl !== "string" || !item.dataUrl.startsWith("data:image/"))) fail("Attach no more than three valid image files.");
    if (images.some((item) => item.dataUrl.length > 500_000)) fail("A field photo is too large after compression.");
    const log = { id: uid("l"), projectId, type, tag: String(tag ?? "").trim().slice(0, 64) || null, value: numberValue, unit: unit || null, note: cleanNote, media: images, date: now(), loggedBy: actorId, status: "PENDING_REVIEW", notifyInvestors: Boolean(notifyInvestors) };
    return withAudit({ ...s, fieldLogs: [...s.fieldLogs, log] }, actorId, "FIELD_LOG", projectId, `${type}; submitted for approval`);
  }),

  reviewFieldLog: async (actorId, logId, approve) => commit((s) => {
    requireAdmin(s, actorId);
    const log = s.fieldLogs.find((x) => x.id === logId);
    if (!log || log.status !== "PENDING_REVIEW") fail("This field update is no longer awaiting review.");
    let next = { ...s, fieldLogs: patch(s.fieldLogs, logId, () => ({ status: approve ? "APPROVED" : "REJECTED", reviewedBy: actorId, reviewedAt: now() })) };
    if (approve && log.notifyInvestors) {
      const project = (s.agroProjects ?? []).find((p) => p.id === log.projectId);
      const programId = project?.programmeId ?? log.programmeId ?? log.projectId;
      const title = project?.title ?? s.projects.find((p) => p.id === programId)?.title;
      const holders = [...new Set(s.investments.filter((i) => i.projectId === programId && i.status === "ACTIVE").map((i) => i.investorId))];
      holders.forEach((holder) => { next = withNote(next, holder, "FIELD", `${title} — a new verified field update is available.`); });
    }
    return withAudit(next, actorId, approve ? "FIELD_APPROVE" : "FIELD_REJECT", logId, log.projectId);
  }),

  createUser: async (actorId, { name, email, phone = "", role = "INVESTOR", password }) => commit((s) => {
    const actor = requireAdmin(s, actorId);
    if (actor.role === "ADMIN" && !["INVESTOR", "FIELD_MGR"].includes(role)) fail("Administrators can create investor and field-manager accounts only.");
    if (!new Set(["INVESTOR", "FIELD_MGR"]).has(role)) fail("Administrator accounts must apply through the public registration page and be approved by the SuperAdmin.");
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    if (String(name ?? "").trim().length < 2 || String(name ?? "").trim().length > 100) fail("Enter a name between 2 and 100 characters.");
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail) || cleanEmail.length > 180) fail("Enter a valid email address.");
    if (String(phone ?? "").trim() && !/^\+?[0-9 ()-]{7,20}$/.test(String(phone).trim())) fail("Enter a valid phone number.");
    if (s.users.some((u) => u.email.toLowerCase() === cleanEmail && u.accountStatus !== "DELETED")) fail("An account with this email already exists.");
    if (String(password ?? "").length < 8 || String(password ?? "").length > 256) fail("Temporary password must be between 8 and 256 characters.");
    const user = { id: uid("u"), name: String(name).trim(), email: cleanEmail, phone: String(phone).trim(), role, avatar: "", autoReinvest: false,
      profile: { fatherName: "", motherName: "", dob: "", gender: "", occupation: "", nationality: "Bangladeshi", address: { present: "", permanent: "", district: "", division: "" }, nominee: { name: "", relation: "", dob: "", nid: "", phone: "", address: "" } },
      kyc: { status: "NONE", nid: "", tin: "", passport: "", docs: { nidFront: "", nidBack: "", photo: "" } },
      bank: { accName: String(name).trim(), accNum: "", bankName: "" }, accountCreatedBy: actorId, createdAt: now(),
      registrationFlow: true, accountStatus: "PENDING", approvalStatus: "PENDING_ADMIN",
      approval: { adminApprovedAt: null, adminApprovedBy: null, mainAdminApprovedAt: null, mainAdminApprovedBy: null } };
    if (typeof localStorage !== "undefined") {
      try { const key = "agrofund.mock.accounts"; const rows = JSON.parse(localStorage.getItem(key) || "{}"); rows[cleanEmail] = { password: String(password), userId: user.id }; localStorage.setItem(key, JSON.stringify(rows)); } catch { /* mock auth remains local to this browser */ }
    }
    let next = { ...s, users: [user, ...s.users] };
    next = notifyAdmins(next, `A manually created ${role.toLowerCase().replace("_", " ")} account for ${cleanEmail} needs identity/registration review.`);
    return withAudit(next, actorId, "ACCOUNT_CREATE", user.id, `Assisted account created as ${role}; pending dual approval`);
  }),

  registerAccount: async ({ name, email, phone = "", role = "INVESTOR", password }) => commit((s) => {
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    const cleanName = String(name ?? "").trim();
    const cleanPhone = String(phone ?? "").trim();
    if (cleanName.length < 2 || cleanName.length > 100) fail("Enter a name between 2 and 100 characters.");
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail) || cleanEmail.length > 180) fail("Enter a valid email address.");
    if (cleanPhone && !/^\+?[0-9 ()-]{7,20}$/.test(cleanPhone)) fail("Enter a valid phone number.");
    if (!new Set(["INVESTOR", "FIELD_MGR", "ADMIN"]).has(role)) fail("Choose Investor, Field Manager, or Administrator. SuperAdmin accounts are provisioned separately.");
    if (s.users.some((u) => u.email.toLowerCase() === cleanEmail && u.accountStatus !== "DELETED")) fail("An account with this email already exists.");
    if (String(password ?? "").length < 8) fail("Password must contain at least 8 characters.");
    const adminApplicant = role === "ADMIN";
    const user = {
      id: uid("u"), name: cleanName, email: cleanEmail, phone: cleanPhone, role, avatar: "", autoReinvest: false,
      profile: { fatherName: "", motherName: "", dob: "", gender: "", occupation: "", nationality: "Bangladeshi", address: { present: "", permanent: "", district: "", division: "" }, nominee: { name: "", relation: "", dob: "", nid: "", phone: "", address: "" } },
      kyc: { status: "NONE", nid: "", tin: "", passport: "", docs: { nidFront: "", nidBack: "", photo: "" } },
      bank: { accName: cleanName, accNum: "", bankName: "" }, createdAt: now(), registrationFlow: true,
      accountStatus: "PENDING", approvalStatus: adminApplicant ? "PENDING_MAIN_ADMIN" : "PENDING_ADMIN",
      approval: { adminApprovedAt: null, adminApprovedBy: null, mainAdminApprovedAt: null, mainAdminApprovedBy: null },
    };
    const passwordStore = typeof localStorage !== "undefined" ? (() => { try { return JSON.parse(localStorage.getItem("agrofund.mock.accounts") || "{}"); } catch { return {}; } })() : null;
    if (passwordStore) {
      passwordStore[cleanEmail] = { password: String(password), userId: user.id };
      try { localStorage.setItem("agrofund.mock.accounts", JSON.stringify(passwordStore)); } catch { fail("The browser cannot save this registration. Clear some demo uploads and try again."); }
    }
    let next = { ...s, users: [user, ...s.users] };
    next = notifyAdmins(next, adminApplicant ? `${cleanName} applied for an Administrator account. SuperAdmin approval is required.` : `${cleanName} registered as ${role === "FIELD_MGR" ? "Field Manager" : "Investor"}. Dual approval is required.`);
    if (adminApplicant) next = withNote(next, s.users.find((u) => u.role === "MAIN_ADMIN")?.id, "ACCOUNT", `${cleanName}'s Administrator application awaits your review.`);
    return withAudit(next, user.id, "ACCOUNT_REGISTER", user.id, `${role} registration submitted; status ${user.approvalStatus}`);
  }),

  reviewAccountRegistration: async (actorId, userId, approve) => commit((s) => {
    const actor = requireAdmin(s, actorId);
    const target = actorOf(s, userId);
    if (!target || !target.registrationFlow) fail("Registration application not found.");
    if (target.id === actorId) fail("You cannot review your own account.");
    if (target.accountStatus === "DELETED" || target.accountStatus === "INACTIVE" || target.accountStatus === "DEACTIVATED") fail("This account is not eligible for approval.");
    if (target.approvalStatus === "APPROVED" || target.approvalStatus === "REJECTED") fail("This registration has already been finalized.");
    const isAdminApplication = target.role === "ADMIN";
    let next = { ...s };
    if (isAdminApplication) {
      if (actor.role !== "MAIN_ADMIN") fail("Only the SuperAdmin can approve Administrator applications.");
      if (target.approvalStatus !== "PENDING_MAIN_ADMIN") fail("This Administrator application is not awaiting SuperAdmin review.");
      next.users = patch(next.users, userId, (u) => ({
        approvalStatus: approve ? "APPROVED" : "REJECTED",
        accountStatus: approve ? "ACTIVE" : "REJECTED",
        approval: { ...u.approval, mainAdminApprovedAt: now(), mainAdminApprovedBy: actorId, rejectedAt: approve ? null : now(), rejectedBy: approve ? null : actorId },
      }));
    } else if (actor.role === "ADMIN") {
      if (!["INVESTOR", "FIELD_MGR"].includes(target.role)) fail("Only investor and field-manager registrations are reviewed in this queue.");
      if (target.approvalStatus !== "PENDING_ADMIN") fail("This registration is not awaiting the administrator's first review.");
      next.users = patch(next.users, userId, (u) => ({
        approvalStatus: approve ? "PENDING_MAIN_ADMIN" : "REJECTED",
        accountStatus: approve ? "PENDING" : "REJECTED",
        approval: { ...u.approval, adminApprovedAt: approve ? now() : null, adminApprovedBy: approve ? actorId : null, rejectedAt: approve ? null : now(), rejectedBy: approve ? null : actorId },
      }));
    } else {
      if (!["INVESTOR", "FIELD_MGR"].includes(target.role)) fail("Administrator applications must use the SuperAdmin review path.");
      if (target.approvalStatus !== "PENDING_MAIN_ADMIN" || !target.approval?.adminApprovedAt) fail("The administrator must approve this registration first.");
      next.users = patch(next.users, userId, (u) => ({
        approvalStatus: approve ? "APPROVED" : "REJECTED",
        accountStatus: approve ? "ACTIVE" : "REJECTED",
        approval: { ...u.approval, mainAdminApprovedAt: now(), mainAdminApprovedBy: actorId, rejectedAt: approve ? null : now(), rejectedBy: approve ? null : actorId },
      }));
    }
    const updated = next.users.find((u) => u.id === userId);
    next = withNote(next, userId, "ACCOUNT", approve
      ? (updated.approvalStatus === "APPROVED" ? "Your AgroFund account has been approved and activated. You can now sign in." : "Your first registration review is complete. The SuperAdmin must complete the final review before you can sign in.")
      : "Your registration was not approved. Please contact AgroFund support for guidance.");
    return withAudit(next, actorId, approve ? "ACCOUNT_APPROVE" : "ACCOUNT_REJECT", userId, `${target.role}; ${updated.approvalStatus}`);
  }),

  setAccountStatus: async (actorId, userId, status) => commit((s) => {
    const actor = requireAdmin(s, actorId);
    const target = actorOf(s, userId);
    if (!target) fail("Account not found.");
    if (target.id === actorId) fail("You cannot deactivate or delete your own account from this screen.");
    if (target.role === "MAIN_ADMIN") fail("The SuperAdmin account is protected.");
    if (!new Set(["ACTIVE", "INACTIVE", "DELETED"]).has(status)) fail("Invalid account status.");
    if (target.role === "ADMIN" && actor.role !== "MAIN_ADMIN") fail("Only the SuperAdmin can manage Administrator accounts.");
    if (!["INVESTOR", "FIELD_MGR", "ADMIN"].includes(target.role)) fail("This account type cannot be managed here.");
    if (status === "ACTIVE" && target.registrationFlow && target.approvalStatus !== "APPROVED") fail("This registration must complete all required approval stages before activation.");
    if (status === "ACTIVE" && target.approvalStatus === "REJECTED") fail("A rejected registration cannot be activated. The user must submit a new application.");
    if (target.accountStatus === "DELETED") fail("Deleted accounts cannot be reactivated.");
    if (target.accountStatus === status) fail(`This account is already ${status.toLowerCase()}.`);
    const timestamp = now();
    let next = { ...s, users: patch(s.users, userId, (u) => ({ accountStatus: status, statusChangedAt: timestamp, statusChangedBy: actorId, ...(status === "DELETED" ? { deletedAt: timestamp, deletedBy: actorId } : {}) })) };
    if (target.role === "INVESTOR" && ["INACTIVE", "DELETED"].includes(status)) {
      const cancellable = (next.investmentRequests ?? []).filter((r) => r.investorId === userId && ["PENDING_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_REJECTED"].includes(r.status));
      for (const request of cancellable) {
        next.investmentRequests = patch(next.investmentRequests ?? [], request.id, () => ({ status: "CANCELLED", updatedAt: timestamp, cancelledAt: timestamp, cancelReason: `Investor account ${status.toLowerCase()}` }));
        next = withNote(next, userId, "REQUEST", `Request ${request.id} was cancelled because your account was ${status.toLowerCase()}. Any unpaid request has been cancelled.`);
      }
    }
    return withAudit(next, actorId, status === "DELETED" ? "ACCOUNT_DELETE" : status === "ACTIVE" ? "ACCOUNT_ACTIVATE" : "ACCOUNT_DEACTIVATE", userId, `${target.email}; ${target.accountStatus ?? "ACTIVE"} -> ${status}; soft delete preserves financial history${target.role === "INVESTOR" && ["INACTIVE", "DELETED"].includes(status) ? "; cancellable unpaid requests cancelled" : ""}`);
  }),

  setRole: async (actorId, userId, role) => commit((s) => {
    const actor = requireAdmin(s, actorId);
    const target = actorOf(s, userId);
    if (!target) fail("Account not found.");
    if (userId === actorId) fail("You cannot change your own role.");
    if (target.role === "MAIN_ADMIN" || role === "MAIN_ADMIN") fail("The SuperAdmin role is protected and cannot be reassigned.");
    if (!new Set(["INVESTOR", "FIELD_MGR", "ADMIN"]).has(role)) fail("Choose a valid role: Investor, Field Manager, or Administrator.");
    if (target.role === role) fail("This account already has that role.");
    if (["PENDING", "REJECTED", "DELETED", "INACTIVE", "DEACTIVATED"].includes(target.accountStatus ?? "ACTIVE")) fail("Complete account approval and activate the account before changing its role.");
    if ((target.approvalStatus ?? "APPROVED") !== "APPROVED") fail("This account must complete all registration approvals before its role can be changed.");
    if (actor.role === "ADMIN") {
      if (!new Set(["INVESTOR", "FIELD_MGR"]).has(target.role) || !new Set(["INVESTOR", "FIELD_MGR"]).has(role)) {
        fail("Administrators can only change roles between Investor and Field Manager. Only the SuperAdmin can assign or remove Administrator access.");
      }
    }
    if (target.role === "INVESTOR" && role !== "INVESTOR") {
      const hasActiveInvestments = s.investments.some((inv) => inv.investorId === userId && inv.status === "ACTIVE");
      const openRequests = (s.investmentRequests ?? []).some((req) => req.investorId === userId && ["PENDING_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_PENDING", "PAYMENT_REJECTED"].includes(req.status));
      const pendingWalletTransactions = s.transactions.some((tx) => tx.userId === userId && tx.status === "PENDING");
      const walletBalance = balanceOf(s.transactions, userId);
      if (hasActiveInvestments) fail("Active investment positions remain in this investor account. Settle or complete those positions before changing the role.");
      if (openRequests) fail("This investor has an open investment request or payment. Resolve it before changing their role.");
      if (pendingWalletTransactions) fail("This investor has pending wallet transactions. Resolve them before changing their role.");
      if (walletBalance !== 0) fail("This investor has a non-zero wallet balance. Settle the balance before changing their role.");
    }

    const timestamp = now();
    let next = { ...s, users: patch(s.users, userId, (u) => ({
      role,
      previousRole: u.role,
      roleChangedAt: timestamp,
      roleChangedBy: actorId,
    })) };
    next = withNote(next, userId, "ACCOUNT", `Your AgroFund access role was changed from ${target.role} to ${role}. Your existing financial and audit history has been retained.`);
    return withAudit(next, actorId, "ROLE_CHANGE", userId, `${target.email}; ${target.role} -> ${role}; financial history retained`);
  }),
  markRead: async (userId) => commit((s) => ({ ...s, notifications: s.notifications.map((n) => (n.userId === userId ? { ...n, read: true } : n)) })),

  sendSupportMessage: async (userId, text) => commit((s) => {
    const sender = actorOf(s, userId);
    if (!sender || !isAccountActive(sender)) fail("An active account is required to contact support.");
    const body = String(text ?? "").trim();
    if (body.length < 2 || body.length > 3000) fail("Support messages must contain 2 to 3,000 characters.");
    if (!["INVESTOR", "FIELD_MGR"].includes(sender.role)) fail("Only investor or field-manager accounts can open a support conversation. Administrators should reply from the Support Inbox.");
    const message = { id: uid("msg"), threadId: userId, senderId: userId, senderName: sender.name, senderRole: sender.role, text: body, createdAt: now(), readByAdmin: false };
    let next = { ...s, supportMessages: [...(s.supportMessages ?? []), message] };
    next = s.users.filter((u) => ["ADMIN", "MAIN_ADMIN"].includes(u.role) && isAccountActive(u)).reduce((acc, admin) => withNote(acc, admin.id, "SUPPORT", `New Help & Support message from ${sender.name}.`), next);
    return withAudit(next, userId, "SUPPORT_MESSAGE", message.id, `${sender.role} sent support message`);
  }),

  replySupportMessage: async (actorId, threadId, text) => commit((s) => {
    const admin = requireAdmin(s, actorId);
    const body = String(text ?? "").trim();
    if (body.length < 2 || body.length > 3000) fail("Support replies must contain 2 to 3,000 characters.");
    if (!s.users.some((u) => u.id === threadId && ["INVESTOR", "FIELD_MGR"].includes(u.role))) fail("Support conversation not found.");
    const message = { id: uid("msg"), threadId, senderId: admin.id, senderName: admin.name, senderRole: admin.role, text: body, createdAt: now(), readByAdmin: true };
    let next = { ...s, supportMessages: [...(s.supportMessages ?? []), message] };
    next = withNote(next, threadId, "SUPPORT", `Premium Agro support replied to your message: ${body.slice(0, 180)}${body.length > 180 ? "…" : ""}`);
    return withAudit(next, actorId, "SUPPORT_REPLY", message.id, `Replied to investor thread ${threadId}`);
  }),

  markSupportThreadRead: async (actorId, threadId) => commit((s) => {
    requireAdmin(s, actorId);
    return { ...s, supportMessages: (s.supportMessages ?? []).map((m) => m.threadId === threadId ? { ...m, readByAdmin: true } : m) };
  }),

  uploadLegalDocument: async (actorId, { title, category = "LEGAL", description = "", file }) => commit((s) => {
    const admin = requireAdmin(s, actorId);
    const cleanTitle = String(title ?? "").trim();
    const cleanDescription = String(description ?? "").trim().slice(0, 1000);
    if (cleanTitle.length < 3 || cleanTitle.length > 160) fail("Document title must be between 3 and 160 characters.");
    if (!file || typeof file.name !== "string" || typeof file.type !== "string" || typeof file.dataUrl !== "string") fail("Select a legal document file or photo to upload.");
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) && file.type !== "application/pdf") fail("Legal documents must be a PDF, JPG, PNG, or WebP file.");
    if (!file.dataUrl.startsWith("data:") || file.dataUrl.length > 2200000) fail("The file must be 1.5 MB or smaller in local demo mode. Use managed file storage in production.");
    const doc = { id: uid("doc"), title: cleanTitle, category: String(category).slice(0, 40), description: cleanDescription, name: file.name.slice(0, 180), type: file.type, dataUrl: file.dataUrl, uploadedBy: admin.id, uploadedByName: admin.name, uploadedAt: now() };
    let next = { ...s, legalDocuments: [doc, ...(s.legalDocuments ?? [])] };
    next = s.users.filter((u) => u.role === "INVESTOR" && isAccountActive(u)).reduce((acc, investor) => withNote(acc, investor.id, "DOCUMENT", `A new official document was published: ${cleanTitle}. Open Documents to view or download it.`), next);
    return withAudit(next, actorId, "LEGAL_DOCUMENT_UPLOAD", doc.id, `${cleanTitle}; ${file.name}`);
  }),

  deleteLegalDocument: async (actorId, documentId) => commit((s) => {
    const admin = requireAdmin(s, actorId);
    const doc = (s.legalDocuments ?? []).find((item) => item.id === documentId);
    if (!doc) fail("Legal document not found.");
    const next = { ...s, legalDocuments: s.legalDocuments.filter((item) => item.id !== documentId) };
    return withAudit(next, admin.id, "LEGAL_DOCUMENT_DELETE", documentId, doc.title);
  }),

  // Project financial entries use a maker-checker workflow: a different active admin must review.
  // Amounts are stored as integer paisa; corrections are immutable reversal records.
  createFinancialEntry: async (actorId, input) => commit((s) => {
    const actor = requireAdmin(s, actorId);
    if (!input || typeof input !== "object") fail("Enter the programme financial details.");
    const child = (s.agroProjects ?? []).find((p) => p.id === input.projectId);
    const program = child ? s.projects.find((p) => p.id === child.programmeId) : s.projects.find((p) => p.id === input.projectId);
    const project = child ?? program;
    if (!project || !program) fail("Choose a valid underlying project.");
    if (["DRAFT", "LIQUIDATED"].includes(program.status) || (s.projectAllocations ?? []).some((a) => a.projectId === program.id)) fail("Financial entries can only be added before the pooled programme is settled.");
    if (child && ["COMPLETED", "ARCHIVED"].includes(child.status)) fail("Financial entries are locked for completed or archived projects.");
    const kindInput = input.kind;
    const mode = input.mode === "REVERSAL" ? "REVERSAL" : "STANDARD";
    const amountInput = Number(input.amount);
    if (!Number.isSafeInteger(amountInput) || amountInput <= 0) fail("Amount must be a positive whole number of paisa (BDT supports up to 2 decimal places).");
    const rawDate = String(input.transactionDate ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) fail("Enter a valid transaction date.");
    const [yearPart, monthPart, dayPart] = rawDate.split("-").map(Number);
    const parsedDate = new Date(`${rawDate}T00:00:00Z`);
    const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const todayValues = Object.fromEntries(todayParts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const todayKey = `${todayValues.year}-${todayValues.month}-${todayValues.day}`;
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== rawDate || Number(monthPart) < 1 || Number(monthPart) > 12 || Number(dayPart) < 1 || Number(dayPart) > 31 || yearPart < 1900) fail("Enter a real calendar date.");
    if (rawDate > todayKey) fail("A financial transaction date cannot be in the future.");
    const description = String(input.description ?? "").trim();
    if (description.length < 5 || description.length > 500) fail("Description must be between 5 and 500 characters.");
    const externalRef = String(input.reference ?? "").trim().slice(0, 120);
    const allEntries = s.financialEntries ?? [];
    if (externalRef) {
      const normalized = externalRef.toLocaleLowerCase();
      if (allEntries.some((entry) => entry.projectId === project.id && entry.reference?.trim().toLocaleLowerCase() === normalized && entry.status !== "REJECTED")) {
        fail("That reference already exists for this project. Check for a duplicate invoice or bank record.");
      }
    }
    let kind = kindInput;
    let category = String(input.category ?? "");
    let amount = amountInput;
    let reversalOf = null;
    if (mode === "REVERSAL") {
      const original = allEntries.find((entry) => entry.id === input.reversalOf);
      if (!original || original.status !== "APPROVED" || original.reversalOf || original.projectId !== project.id) fail("Choose an approved, unreversed entry from the same project.");
      if ((s.projectAllocations ?? []).some((a) => a.projectId === program.id)) fail("This pooled programme has already been settled. Post-settlement corrections require a formal restatement workflow.");
      const reserved = sum(allEntries.filter((entry) => entry.reversalOf === original.id && entry.status !== "REJECTED"), (entry) => Math.abs(Number(entry.amount) || 0));
      const remaining = Number(original.amount) - reserved;
      if (!Number.isSafeInteger(remaining) || remaining <= 0 || amountInput > remaining) fail(`The reversal cannot exceed the unreversed balance of ${formatBDT(Math.max(remaining, 0))}.`);
      kind = original.kind;
      category = original.category;
      amount = -amountInput;
      reversalOf = original.id;
    } else {
      if (!new Set(["REVENUE", "EXPENSE"]).has(kind)) fail("Choose Revenue or Expense.");
      const categories = kind === "REVENUE"
        ? new Set(["PRODUCT_SALES", "BYPRODUCT_SALES", "SUBSIDY", "OTHER_REVENUE"])
        : new Set(["FEED", "SEEDS_PLANTS", "FERTILIZER", "VETERINARY", "LABOR", "TRANSPORT", "EQUIPMENT", "IRRIGATION", "UTILITIES", "RENT", "OTHER_EXPENSE"]);
      if (!categories.has(category)) fail("Choose a valid category for the selected entry type.");
    }
    if (!new Set(["REVENUE", "EXPENSE"]).has(kind)) fail("Financial entry type is invalid.");
    let evidence = null;
    if (input.evidence != null) {
      const doc = input.evidence;
      if (!doc || typeof doc.name !== "string" || typeof doc.type !== "string" || typeof doc.dataUrl !== "string") fail("The supporting document could not be read.");
      if (!/^image\/(png|jpeg|webp)$/.test(doc.type) && doc.type !== "application/pdf") fail("Supporting files must be PNG, JPEG, WebP, or PDF.");
      if (doc.dataUrl.length > 500000 || !doc.dataUrl.startsWith("data:")) fail("Supporting file is too large for demo storage (maximum about 350 KB). Attach a smaller file.");
      evidence = { name: doc.name.slice(0, 180), type: doc.type, dataUrl: doc.dataUrl };
    }
    const entry = {
      id: uid("fe"), programmeId: program.id, projectId: project.id, kind, category, amount, mode, reversalOf,
      transactionDate: rawDate, description, reference: externalRef, evidence,
      status: "PENDING", createdBy: actor.id, createdAt: now(), reviewedBy: null, reviewedAt: null, reviewNote: "",
    };
    let next = { ...s, financialEntries: [entry, ...allEntries] };
    next = notifyAdmins(next, `${actor.name} submitted a ${mode === "REVERSAL" ? "financial correction" : kind.toLowerCase()} entry for ${project.title}; it requires review by a different administrator.`);
    return withAudit(next, actorId, "FINANCIAL_ENTRY_CREATE", entry.id, `${project.title}; ${mode}; ${kind}; ${formatBDT(amount)}; ${category}; awaiting independent review`);
  }),

  reviewFinancialEntry: async (actorId, entryId, approve, reviewNote = "") => commit((s) => {
    requireAdmin(s, actorId);
    const entry = (s.financialEntries ?? []).find((item) => item.id === entryId);
    if (!entry || entry.status !== "PENDING") fail("This financial entry is no longer awaiting review.");
    if (entry.createdBy === actorId) fail("Maker-checker control: a different administrator must review your entry.");
    const note = String(reviewNote ?? "").trim().slice(0, 500);
    if (!approve && note.length < 5) fail("Provide a rejection reason of at least 5 characters.");
    const child = (s.agroProjects ?? []).find((p) => p.id === entry.projectId);
    const program = child ? s.projects.find((p) => p.id === child.programmeId) : s.projects.find((p) => p.id === entry.projectId);
    const project = child ?? program;
    if (!project || !program) fail("The project no longer exists. The entry cannot be approved.");
    if (approve && (["DRAFT", "LIQUIDATED"].includes(program.status) || (s.projectAllocations ?? []).some((a) => a.projectId === program.id))) fail("The pooled programme is closed to new financial approvals; review its settlement records instead.");
    if (approve && child && ["COMPLETED", "ARCHIVED"].includes(child.status)) fail("Financial entries for completed or archived projects cannot be newly approved.");
    if (approve && entry.reversalOf) {
      const original = (s.financialEntries ?? []).find((item) => item.id === entry.reversalOf);
      if (!original || original.status !== "APPROVED") fail("The original financial entry is no longer eligible for reversal.");
      if ((s.projectAllocations ?? []).some((a) => a.projectId === program.id)) fail("This pooled programme has already been settled. Post-settlement corrections require a formal restatement workflow.");
      const reserved = sum((s.financialEntries ?? []).filter((item) => item.reversalOf === original.id && item.id !== entry.id && item.status !== "REJECTED"), (item) => Math.abs(Number(item.amount) || 0));
      if (reserved + Math.abs(entry.amount) > Number(original.amount)) fail("Approved and pending reversals already use the original entry's full amount.");
    }
    const status = approve ? "APPROVED" : "REJECTED";
    let next = { ...s, financialEntries: patch(s.financialEntries ?? [], entryId, () => ({ status, reviewedBy: actorId, reviewedAt: now(), reviewNote: note })) };
    next = withNote(next, entry.createdBy, "FINANCE", approve ? `Your financial entry for ${project.title} was approved and is now included in management reports.` : `Your financial entry for ${project.title} was rejected. Reason: ${note}`);
    return withAudit(next, actorId, approve ? "FINANCIAL_ENTRY_APPROVE" : "FINANCIAL_ENTRY_REJECT", entryId, `${project.title}; ${status}; amount ${formatBDT(entry.amount)}; ${note || "No review note"}`);
  }),

  allocate: async (actorId, input) => commit((s) => {
    requireAdmin(s, actorId);
    if (!input || typeof input !== "object") fail("Enter the programme settlement figures.");
    if (!Number.isSafeInteger(Number(input.gross)) || Number(input.gross) < 0) fail("Gross sales must be a non-negative BDT amount.");
    if (!Number.isSafeInteger(Number(input.costs)) || Number(input.costs) < 0) fail("Project costs must be a non-negative BDT amount.");
    if (!Number.isFinite(Number(input.commissionPct)) || Number(input.commissionPct) < 0 || Number(input.commissionPct) > 100) fail("Commission must be between 0% and 100%.");
    const p = s.projects.find((x) => x.id === input.projectId);
    if (!p) fail("Project not found.");
    if (p.status !== "IN_PROGRESS") fail("Project proceeds can only be allocated to projects that are In Progress.");
    const childIds = new Set((s.agroProjects ?? []).filter((child) => child.programmeId === p.id).map((child) => child.id));
    const childProjects = (s.agroProjects ?? []).filter((child) => child.programmeId === p.id);
    if ((s.projectFundingAllocations ?? []).some((row) => row.programmeId === p.id && row.status === "PENDING")) fail("Resolve all pending internal project-capital allocation proposals before programme settlement.");
    const fundedProjectIds = new Set((s.projectFundingAllocations ?? []).filter((row) => row.programmeId === p.id && row.status === "APPROVED").map((row) => row.projectId));
    const openFundedProjects = childProjects.filter((child) => fundedProjectIds.has(child.id) && !["COMPLETED", "ARCHIVED"].includes(child.status));
    if (openFundedProjects.length) fail(`Complete or archive every funded underlying project before settling the pooled programme: ${openFundedProjects.map((child) => child.title).join(", ")}.`);
    const projectEntries = (s.financialEntries ?? []).filter((entry) => entry.projectId === p.id || childIds.has(entry.projectId));
    if (projectEntries.some((entry) => entry.status === "PENDING")) fail("This project still has financial entries awaiting independent review. Resolve them before close-out.");
    const approvedEntries = projectEntries.filter((entry) => entry.status === "APPROVED");
    if (!approvedEntries.length) fail("At least one financial entry must be approved before settlement. Record and independently review realized revenue/expenses first.");
    if (projectEntries.length) {
      const recordedGross = sum(approvedEntries.filter((entry) => entry.kind === "REVENUE"), (entry) => Number(entry.amount));
      const recordedCosts = sum(approvedEntries.filter((entry) => entry.kind === "EXPENSE"), (entry) => Number(entry.amount));
      if (recordedGross < 0 || recordedCosts < 0) fail("Approved financial corrections produce a negative revenue or expense total. Reconcile the entries before settlement.");
      if (Number(input.gross) !== recordedGross || Number(input.costs) !== recordedCosts) {
        fail(`Settlement must match approved financial entries: gross sales ${formatBDT(recordedGross)} and costs ${formatBDT(recordedCosts)}. Reconcile the entries before distributing proceeds.`);
      }
    }
    const prev = previewAllocation(s, input);
    if (!prev.rows.length || prev.totalCapital <= 0) fail("There are no active investor positions to settle for this programme.");
    if (prev.net < 0) fail("Costs and commission exceed gross sales.");
    const createdAt = now();
    const allocation = {
      id: uid("pa"), projectId: p.id, grossSales: Number(input.gross), operatingCosts: Number(input.costs),
      commissionPct: Number(input.commissionPct), platformCommission: prev.commission, netProceeds: prev.net,
      investedCapital: prev.invested, allocationBasis: "INVESTED_CAPITAL", totalCapital: prev.totalCapital, investorCount: new Set(prev.rows.map(({ inv }) => inv.investorId)).size, positionCount: prev.rows.length,
      realizedProfitLoss: prev.net - prev.invested, createdAt, createdBy: actorId,
      payouts: prev.rows.map(({ inv, payout }) => ({ investmentId: inv.id, investorId: inv.investorId, investedCapital: inv.amount, sharePct: prev.totalCapital ? (inv.amount / prev.totalCapital) * 100 : 0, payout, realizedProfitLoss: payout - inv.amount })),
    };
    let next = { ...s, projects: patch(s.projects, p.id, () => ({ status: "LIQUIDATED" })), projectAllocations: [...(s.projectAllocations ?? []), allocation] };
    for (const r of prev.rows) {
      next = {
        ...next,
        investments: patch(next.investments, r.inv.id, () => ({ status: "COMPLETED", payout: r.payout })),
        transactions: [...next.transactions, { id: uid("t"), userId: r.inv.investorId, type: "DIVIDEND", amount: r.payout, date: createdAt, channel: null, trxId: null, status: "COMPLETED", ref: p.id, allocationId: allocation.id }],
      };
      next = withNote(next, r.inv.investorId, "PAYMENT", `${formatBDT(r.payout)} in total project proceeds from ${p.title} has been credited to your wallet. This includes the proceeds available to return your investment capital; review your Reports & Statements for the realized gain or loss.`);
    }
    next = withAudit(next, actorId, "ALLOCATE", p.id, `Gross sales ${formatBDT(input.gross)}, Operating costs ${formatBDT(input.costs)}, Commission ${formatBDT(prev.commission)}, Net proceeds ${formatBDT(prev.net)}, Realized gain/loss ${formatBDT(prev.net - prev.invested)}`);
    // Payouts stay in each investor's wallet. Reinvestment requires a new, separately approved request.
    return next;
  }),
};

export const api = env.useMock ? mockApi : remoteApi;

// Actual distributions are based on each investor's approved capital contribution.
// Gross revenue already contains principal, so principal is NOT added again (see README).
export function previewAllocation(s, { projectId, gross, costs, commissionPct }) {
  const invs = s.investments.filter((i) => i.projectId === projectId && i.status === "ACTIVE");
  const totalCapital = sum(invs, (i) => Number(i.amount) || 0);
  const commission = Math.round(gross * (commissionPct / 100));
  const net = gross - costs - commission;
  const rows = invs.map((inv) => ({ inv, sharePct: totalCapital ? inv.amount / totalCapital * 100 : 0, payout: totalCapital && Number.isSafeInteger(net) && net >= 0 ? Number((BigInt(net) * BigInt(inv.amount)) / BigInt(totalCapital)) : 0 }));
  if (rows.length && net > 0) rows[0].payout += net - sum(rows, (r) => r.payout); // rounding remainder, so payouts sum exactly to net
  return { totalCapital, commission, net, rows, invested: totalCapital };
}
export const preview = (input) => previewAllocation(getState(), input);
