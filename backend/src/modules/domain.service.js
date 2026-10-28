import mongoose from "mongoose";
import {
  User, Programme, AgroProject, ProjectFundingAllocation, InvestmentRequest, Investment, Transaction, FieldLog,
  Notification, AuditLog, Allocation, FinancialEntry, LegalDocument, SupportMessage,
} from "../models/index.js";
import { AppError, badRequest, conflict, forbidden, notFound } from "../utils/errors.js";
import { newId } from "../utils/security.js";
import { authHelpers } from "./auth.service.js";

const now = () => new Date().toISOString();
const ACTIVE_ACCOUNT = { accountStatus: "ACTIVE", approvalStatus: "APPROVED" };
const ACTIVE_REQUESTS = ["PENDING_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_PENDING", "PAYMENT_REJECTED"];
const adminRole = (user) => ["ADMIN", "MAIN_ADMIN"].includes(user?.role);
const superAdminRole = (user) => user?.role === "MAIN_ADMIN";
const assertAdmin = (user) => { if (!adminRole(user)) throw forbidden("This action requires administrator access."); };
const assertSuperAdmin = (user) => { if (!superAdminRole(user)) throw forbidden("Only the SuperAdmin can perform this action."); };
const assertActive = (user) => { if (!user || user.accountStatus !== "ACTIVE" || user.approvalStatus !== "APPROVED" || user.deletedAt) throw forbidden("An approved, active account is required."); };
const publicUser = (u) => authHelpers.userDto(u);
const getProgram = async (id) => {
  if (id) return Programme.findOne({ id });
  return Programme.findOne({ singletonKey: "premium-agro-collective" });
};
const getProgramLean = async (id) => id ? Programme.findOne({ id }).lean() : Programme.findOne({ singletonKey: "premium-agro-collective" }).lean();
const getProjectContext = async (projectId) => {
  const child = await AgroProject.findOne({ id: projectId }).lean();
  if (child) {
    const programme = await getProgram(child.programmeId);
    if (!programme) throw notFound("The parent investment programme no longer exists.");
    return { programme, project: child };
  }
  const programme = await getProgram(projectId);
  if (programme) return { programme, project: null }; // legacy programme-level records remain readable
  throw notFound("The underlying agro project was not found.");
};
const stripInternal = (doc) => { const copy = { ...doc }; delete copy._id; delete copy.__v; return copy; };
const safeName = (value, label, min = 2, max = 160) => {
  const clean = String(value ?? "").trim();
  if (clean.length < min || clean.length > max) throw badRequest(`${label} must be between ${min} and ${max} characters.`);
  return clean;
};
const dateOrEmpty = (value, label) => {
  if (value == null || value === "") return "";
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00Z`).getTime()) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text) throw badRequest(`${label} must be a valid YYYY-MM-DD date.`);
  return text;
};
const todayInDhaka = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const fmtBDT = (paisa) => `৳${(Number(paisa || 0) / 100).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const total = (rows, fn) => rows.reduce((n, row) => n + Number(fn(row) || 0), 0);
const cleanObject = (x) => x && typeof x === "object" && !Array.isArray(x);
const asDoc = (doc) => { if (!doc) return null; const obj = typeof doc.toObject === "function" ? doc.toObject() : { ...doc }; delete obj._id; delete obj.__v; return obj; };

async function audit(actor, action, entity, detail, session) {
  const doc = new AuditLog({ id: newId("audit"), actorId: actor.id, actorName: actor.name, action, entity, detail: String(detail ?? "").slice(0, 2000), date: now() });
  await doc.save(session ? { session } : undefined);
  return doc;
}
async function notify(userId, type, text, session) {
  if (!userId) return;
  const doc = new Notification({ id: newId("n"), userId, type, text: String(text).slice(0, 2000), date: now(), read: false });
  await doc.save(session ? { session } : undefined);
}
async function notifyAdmins(type, text, session) {
  let query = User.find({ role: { $in: ["ADMIN", "MAIN_ADMIN"] }, ...ACTIVE_ACCOUNT }).select("id");
  if (session) query = query.session(session);
  const admins = await query.lean();
  for (const admin of admins) await notify(admin.id, type, text, session);
}
async function updateProgramRaised(programId, session) {
  const rows = await Investment.find({ projectId: programId, status: "ACTIVE" }).session(session || null).lean();
  const raisedAmount = total(rows, (x) => x.amount);
  await Programme.updateOne({ id: programId }, { $set: { raisedAmount } }, session ? { session } : {});
}
function requestOpenAmount(existing, projectId, amount) {
  return existing.some((r) => r.projectId === projectId && r.amount === amount && ACTIVE_REQUESTS.includes(r.status));
}
function verifyBankDetails(payment) {
  const bankName = String(payment?.bankName ?? "").trim();
  const accountName = String(payment?.bankAccountName ?? "").trim();
  const accountNumber = String(payment?.bankAccountNumber ?? "").trim();
  const all = `${bankName} ${accountName} ${accountNumber}`;
  if (!payment?.bankVerified || !bankName || !accountName || accountNumber.length < 5 || /demo|replace|placeholder|not configured/i.test(all)) {
    throw new AppError(409, "Verified Premium Agro receiving bank details are not configured. Do not transfer money to placeholder details.", "BANK_DETAILS_NOT_READY");
  }
}
function validDataFile(file, { maxLength = 2_200_000, allowPdf = true, imageOnly = false } = {}) {
  if (!cleanObject(file) || typeof file.name !== "string" || typeof file.type !== "string" || typeof file.dataUrl !== "string") throw badRequest("The uploaded file could not be read.");
  if (file.dataUrl.length > maxLength) throw new AppError(413, "The uploaded file is too large. Compress it and try again.", "FILE_TOO_LARGE");
  const isImage = /^data:image\/(png|jpeg|webp);base64,/i.test(file.dataUrl) && ["image/png", "image/jpeg", "image/webp"].includes(file.type);
  const isPdf = /^data:application\/pdf;base64,/i.test(file.dataUrl) && file.type === "application/pdf";
  if (!(isImage || (!imageOnly && allowPdf && isPdf))) throw badRequest(imageOnly ? "Upload a JPG, PNG or WebP image." : "Use a PNG, JPEG, WebP image or PDF file.");
  return { name: file.name.slice(0, 180), type: file.type, dataUrl: file.dataUrl };
}
function validKyc({ kyc, profile }) {
  if (!/^\d{10}$|^\d{13}$|^\d{17}$/.test(String(kyc?.nid ?? ""))) throw badRequest("National ID must contain 10, 13, or 17 digits.");
  if (kyc?.tin && !/^\d{12}$/.test(String(kyc.tin))) throw badRequest("TIN must contain 12 digits.");
  if (String(profile?.fatherName ?? "").trim().length < 2) throw badRequest("Enter the investor's father name.");
  if (String(profile?.motherName ?? "").trim().length < 2) throw badRequest("Enter the investor's mother name.");
  const dob = new Date(profile?.dob);
  if (!profile?.dob || Number.isNaN(dob.getTime()) || (Date.now() - dob.getTime()) / (365.25 * 864e5) < 18) throw badRequest("The investor must be at least 18 and provide a valid date of birth.");
  if (!profile?.gender) throw badRequest("Select a gender.");
  const address = profile?.address ?? {};
  if (String(address.present ?? "").trim().length < 10 || !String(address.district ?? "").trim() || !String(address.division ?? "").trim()) throw badRequest("Enter the full current address, district and division.");
  const nominee = profile?.nominee ?? {};
  if (String(nominee.name ?? "").trim().length < 2 || nominee.relation !== "Father") throw badRequest("The nominee must be the investor's father.");
  if (!nominee.dob || !/^\d{10,17}$/.test(String(nominee.nid ?? "")) || !/^01[3-9]\d{8}$/.test(String(nominee.phone ?? ""))) throw badRequest("Enter valid nominee date of birth, ID and Bangladesh mobile number.");
  const docs = kyc?.docs ?? {};
  for (const key of ["nidFront", "nidBack", "photo"]) {
    const file = docs[key];
    if (!cleanObject(file) || typeof file.dataUrl !== "string") throw badRequest(`Upload ${key === "nidFront" ? "the front of the National ID" : key === "nidBack" ? "the back of the National ID" : "the recent passport-size photo"}.`);
    validDataFile(file, { maxLength: 700_000, imageOnly: key === "photo" });
  }
}

export async function getSnapshot(user) {
  const isAdmin = adminRole(user);
  const isInvestor = user.role === "INVESTOR";
  const selfId = user.id;
  const [users, projects, agroProjects, fundingAllocations, investments, investmentRequests, transactions, fieldLogs, notifications, auditRows, allocations, entries, documents, messages] = await Promise.all([
    User.find(isAdmin ? {} : { id: selfId }).lean(),
    Programme.find({}).sort({ createdAt: 1 }).lean(),
    AgroProject.find(isAdmin ? {} : { status: { $ne: "ARCHIVED" } }).sort({ createdAt: 1 }).lean(),
    ProjectFundingAllocation.find(isAdmin ? {} : { status: "APPROVED" }).sort({ createdAt: -1 }).lean(),
    Investment.find(isAdmin ? {} : { investorId: selfId }).lean(),
    InvestmentRequest.find(isAdmin ? {} : { investorId: selfId }).sort({ createdAt: -1 }).lean(),
    Transaction.find(isAdmin ? {} : { userId: selfId }).sort({ date: -1 }).lean(),
    FieldLog.find(isAdmin ? {} : isInvestor ? { status: "APPROVED" } : { $or: [{ loggedBy: selfId }, { status: "APPROVED" }] }).sort({ date: -1 }).lean(),
    Notification.find({ userId: selfId }).sort({ date: -1 }).lean(),
    isAdmin ? AuditLog.find({}).sort({ date: -1 }).limit(1000).lean() : Promise.resolve([]),
    Allocation.find({}).sort({ createdAt: -1 }).lean(),
    FinancialEntry.find(isAdmin ? {} : { status: "APPROVED" }).sort({ createdAt: -1 }).lean(),
    LegalDocument.find(isAdmin ? {} : { isPublished: true }).sort({ uploadedAt: -1 }).lean(),
    SupportMessage.find(isAdmin ? {} : { threadId: selfId }).sort({ createdAt: 1 }).lean(),
  ]);
  const safeUsers = users.map((u) => { const copy = { ...u }; delete copy.passwordHash; delete copy._id; delete copy.__v; return copy; });
  const safeEntries = entries.map((entry) => {
    const copy = { ...entry }; delete copy._id; delete copy.__v;
    if (!isAdmin) delete copy.evidence;
    return copy;
  });
  const safeAllocations = allocations.map((allocation) => {
    const copy = { ...allocation }; delete copy._id; delete copy.__v;
    if (!isAdmin) copy.payouts = (copy.payouts ?? []).filter((p) => p.investorId === selfId);
    return copy;
  });
  return {
    users: safeUsers,
    projects: projects.map((p) => { const copy = { ...p }; delete copy._id; delete copy.__v; return copy; }),
    agroProjects: agroProjects.map((p) => { const copy = { ...p }; delete copy._id; delete copy.__v; return copy; }),
    projectFundingAllocations: fundingAllocations.map((x) => { const copy = { ...x }; delete copy._id; delete copy.__v; return copy; }),
    investments: investments.map((x) => { const copy = { ...x }; delete copy._id; delete copy.__v; return copy; }),
    investmentRequests: investmentRequests.map((x) => { const copy = { ...x }; delete copy._id; delete copy.__v; return copy; }),
    transactions: transactions.map((x) => { const copy = { ...x }; delete copy._id; delete copy.__v; return copy; }),
    fieldLogs: fieldLogs.map((x) => { const copy = { ...x }; delete copy._id; delete copy.__v; return copy; }),
    notifications: notifications.map((x) => { const copy = { ...x }; delete copy._id; delete copy.__v; return copy; }),
    audit: auditRows.map((x) => { const copy = { ...x }; delete copy._id; delete copy.__v; return copy; }),
    projectAllocations: safeAllocations,
    financialEntries: safeEntries,
    legalDocuments: documents.map((x) => { const copy = { ...x }; delete copy._id; delete copy.__v; return copy; }),
    supportMessages: messages.map((x) => { const copy = { ...x }; delete copy._id; delete copy.__v; return copy; }),
  };
}

export async function createAgroProject(actor, input) {
  assertAdmin(actor); assertActive(actor);
  if (!cleanObject(input)) throw badRequest("Enter the underlying project details.");
  const programme = await getProgram();
  if (!programme || programme.status === "LIQUIDATED") throw conflict("The pooled programme is not available for new project setup.");
  const title = safeName(input.title, "Project name", 3, 160);
  const category = safeName(input.category, "Project category", 2, 64).toUpperCase();
  if (!["LIVESTOCK", "ORCHARD", "CROPS", "DAIRY", "AQUACULTURE", "OTHER"].includes(category)) throw badRequest("Choose a supported underlying project category.");
  const location = safeName(input.location, "Project location", 2, 200);
  const summary = String(input.summary ?? "").trim().slice(0, 300);
  const description = safeName(input.description, "Project description", 20, 6000);
  const startDate = dateOrEmpty(input.startDate, "Start date");
  const expectedEndDate = dateOrEmpty(input.expectedEndDate, "Expected end date");
  if (startDate && expectedEndDate && expectedEndDate < startDate) throw badRequest("Expected end date must be on or after the start date.");
  if (await AgroProject.exists({ programmeId: programme.id, title: new RegExp(`^${escapeRegex(title)}$`, "i") })) throw conflict("An underlying project with this name already exists in this programme, including archived history. Choose a different name to preserve unambiguous reports.");
  const project = await AgroProject.create({
    id: newId("agp"), programmeId: programme.id, title, category, location, summary, description,
    status: "PLANNING", progress: 0, stage: "Planning and preparation", startDate, expectedEndDate,
    createdBy: actor.id, updatedBy: actor.id, createdAt: now(), updatedAt: now(),
  });
  await audit(actor, "AGRO_PROJECT_CREATE", project.id, `${title}; added under ${programme.title}`);
  return asDoc(project);
}

export async function updateAgroProject(actor, projectId, input) {
  assertAdmin(actor); assertActive(actor);
  if (!cleanObject(input)) throw badRequest("Enter valid underlying project details.");
  const project = await AgroProject.findOne({ id: projectId });
  if (!project) throw notFound("Underlying project not found.");
  if (project.status === "ARCHIVED" || project.status === "COMPLETED") throw conflict("Archived or completed projects are read-only to preserve their history.");
  const editable = {};
  if (Object.hasOwn(input, "title")) editable.title = safeName(input.title, "Project name", 3, 160);
  if (Object.hasOwn(input, "category")) {
    editable.category = safeName(input.category, "Project category", 2, 64).toUpperCase();
    if (!["LIVESTOCK", "ORCHARD", "CROPS", "DAIRY", "AQUACULTURE", "OTHER"].includes(editable.category)) throw badRequest("Choose a supported underlying project category.");
  }
  if (Object.hasOwn(input, "location")) editable.location = safeName(input.location, "Project location", 2, 200);
  if (Object.hasOwn(input, "summary")) editable.summary = String(input.summary ?? "").trim().slice(0, 300);
  if (Object.hasOwn(input, "description")) editable.description = safeName(input.description, "Project description", 20, 6000);
  if (Object.hasOwn(input, "startDate")) editable.startDate = dateOrEmpty(input.startDate, "Start date");
  if (Object.hasOwn(input, "expectedEndDate")) editable.expectedEndDate = dateOrEmpty(input.expectedEndDate, "Expected end date");
  if (editable.startDate && (editable.expectedEndDate ?? project.expectedEndDate) && (editable.expectedEndDate ?? project.expectedEndDate) < editable.startDate) throw badRequest("Expected end date must be on or after the start date.");
  if (editable.expectedEndDate && (editable.startDate ?? project.startDate) && editable.expectedEndDate < (editable.startDate ?? project.startDate)) throw badRequest("Expected end date must be on or after the start date.");
  if (editable.title && await AgroProject.exists({ programmeId: project.programmeId, title: new RegExp(`^${escapeRegex(editable.title)}$`, "i"), id: { $ne: project.id } })) throw conflict("Another project, including archived history, already uses this name. Choose a different name to keep reports unambiguous.");
  Object.assign(project, editable, { updatedBy: actor.id, updatedAt: now() });
  await project.save();
  await audit(actor, "AGRO_PROJECT_UPDATE", project.id, Object.keys(editable).join(", ") || "Project details opened and saved");
  return asDoc(project);
}

export async function setAgroProjectStatus(actor, projectId, status) {
  assertAdmin(actor); assertActive(actor);
  const project = await AgroProject.findOne({ id: projectId });
  if (!project) throw notFound("Underlying project not found.");
  const allowed = {
    PLANNING: ["ACTIVE", "PAUSED"],
    ACTIVE: ["PAUSED", "COMPLETED"],
    PAUSED: ["ACTIVE", "COMPLETED"],
    COMPLETED: [],
    ARCHIVED: [],
  };
  if (!(allowed[project.status] ?? []).includes(status)) throw conflict(`Invalid project status transition from ${project.status} to ${status}.`);
  const programme = await getProgram(project.programmeId);
  if (status === "ACTIVE") {
    if (!programme || programme.status !== "IN_PROGRESS") throw conflict("Start the pooled programme's operations before activating an underlying project.");
    const approvedFunding = await ProjectFundingAllocation.find({ projectId, status: "APPROVED" }).select("amount").lean();
    if (total(approvedFunding, (x) => x.amount) <= 0) throw conflict("Approve a capital allocation for this project before activating it.");
  }
  if (status === "COMPLETED") {
    const [pendingLogs, pendingEntries, pendingFunding] = await Promise.all([
      FieldLog.exists({ projectId, status: "PENDING_REVIEW" }),
      FinancialEntry.exists({ projectId, status: "PENDING" }),
      ProjectFundingAllocation.exists({ projectId, status: "PENDING" }),
    ]);
    if (pendingLogs || pendingEntries || pendingFunding) throw conflict("Resolve pending field updates, financial entries and capital-allocation reviews before completing the project.");
  }
  const previous = project.status;
  project.status = status;
  if (status === "COMPLETED") { project.progress = 100; project.stage = "Completed"; }
  project.updatedBy = actor.id; project.updatedAt = now();
  await project.save();
  await audit(actor, "AGRO_PROJECT_STATUS", project.id, `${previous} → ${status}`);
  return asDoc(project);
}

export async function setAgroProjectProgress(actor, projectId, { progress, stage }) {
  assertAdmin(actor); assertActive(actor);
  const project = await AgroProject.findOne({ id: projectId });
  if (!project) throw notFound("Underlying project not found.");
  if (["COMPLETED", "ARCHIVED"].includes(project.status)) throw conflict("Progress is locked for completed or archived projects.");
  const pct = Number(progress); const cleanStage = safeName(stage, "Current project stage", 2, 160);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) throw badRequest("Progress must be a whole-number percentage between 0 and 100.");
  project.progress = pct; project.stage = cleanStage; project.updatedBy = actor.id; project.updatedAt = now();
  await project.save();
  await audit(actor, "AGRO_PROJECT_PROGRESS", project.id, `${pct}% — ${cleanStage}`);
  const programmeInvestors = await Investment.distinct("investorId", { projectId: project.programmeId, status: "ACTIVE" });
  for (const id of programmeInvestors) await notify(id, "FIELD", `${project.title} progress updated to ${pct}% — ${cleanStage}.`);
  return asDoc(project);
}

export async function deleteAgroProject(actor, projectId) {
  assertAdmin(actor); assertActive(actor);
  const project = await AgroProject.findOne({ id: projectId });
  if (!project) throw notFound("Underlying project not found.");
  if (project.status === "ACTIVE") throw conflict("Pause an active project before attempting deletion.");
  const [hasFieldLogs, hasFinancialEntries, hasFunding] = await Promise.all([
    FieldLog.exists({ projectId }), FinancialEntry.exists({ projectId }), ProjectFundingAllocation.exists({ projectId }),
  ]);
  if (hasFieldLogs || hasFinancialEntries || hasFunding) throw conflict("This project has operational or financial history. Archive it instead so reports and audit records remain intact.");
  await project.deleteOne();
  await audit(actor, "AGRO_PROJECT_DELETE", projectId, `${project.title}; deleted because it has no linked history`);
  return { ok: true, id: projectId };
}

export async function archiveAgroProject(actor, projectId) {
  assertAdmin(actor); assertActive(actor);
  const project = await AgroProject.findOne({ id: projectId });
  if (!project) throw notFound("Underlying project not found.");
  if (project.status === "ARCHIVED") throw conflict("This project is already archived.");
  if (project.status === "ACTIVE") throw conflict("Pause or complete an active project before archiving it.");
  const [pendingFunding, pendingLogs, pendingEntries] = await Promise.all([
    ProjectFundingAllocation.exists({ projectId, status: "PENDING" }),
    FieldLog.exists({ projectId, status: "PENDING_REVIEW" }),
    FinancialEntry.exists({ projectId, status: "PENDING" }),
  ]);
  if (pendingFunding || pendingLogs || pendingEntries) throw conflict("Resolve pending field, financial and capital-allocation reviews before archiving the project.");
  project.status = "ARCHIVED"; project.archivedAt = now(); project.archivedBy = actor.id; project.updatedBy = actor.id; project.updatedAt = now();
  await project.save();
  await audit(actor, "AGRO_PROJECT_ARCHIVE", projectId, `${project.title}; history retained`);
  return asDoc(project);
}

export async function requestProjectFunding(actor, input) {
  assertAdmin(actor); assertActive(actor);
  if (!cleanObject(input)) throw badRequest("Enter the capital allocation details.");
  const { projectId, amount, note = "" } = input;
  const amountPaisa = Number(amount);
  if (typeof projectId !== "string" || !projectId.trim()) throw badRequest("Choose an underlying project.");
  if (!Number.isSafeInteger(amountPaisa) || amountPaisa < 100000) throw badRequest("Enter a capital allocation of at least ৳1,000, using no more than two decimal places.");
  const cleanNote = String(note ?? "").trim();
  if (cleanNote.length > 1000) throw badRequest("Allocation note must be no longer than 1,000 characters.");

  const session = await mongoose.startSession();
  let allocation;
  try {
    await session.withTransaction(async () => {
      const project = await AgroProject.findOne({ id: projectId }).session(session);
      if (!project || ["ARCHIVED", "COMPLETED"].includes(project.status)) throw notFound("Choose an available underlying project.");
      const programme = await Programme.findOne({ id: project.programmeId }).session(session);
      if (!programme || programme.status !== "IN_PROGRESS") throw conflict("Project capital can only be allocated after programme operations start.");

      // Serialize capital reservation attempts by writing to the one parent programme
      // document. Concurrent proposals retry and re-check the current reserved balance.
      await Programme.updateOne({ id: programme.id }, { $inc: { fundingRevision: 1 } }, { session });
      const [investments, existing] = await Promise.all([
        Investment.find({ projectId: programme.id, status: "ACTIVE" }).select("amount").session(session).lean(),
        ProjectFundingAllocation.find({ programmeId: programme.id, status: { $in: ["PENDING", "APPROVED"] } }).select("amount").session(session).lean(),
      ]);
      const capital = total(investments, (x) => x.amount);
      const committed = total(existing, (x) => x.amount);
      if (committed + amountPaisa > capital) throw conflict(`Allocation exceeds unallocated active programme capital of ${fmtBDT(Math.max(0, capital - committed))}.`);

      allocation = new ProjectFundingAllocation({
        id: newId("pfa"), programmeId: programme.id, projectId, amount: amountPaisa,
        note: cleanNote, status: "PENDING", createdBy: actor.id, createdAt: now(),
      });
      await allocation.save({ session });
      await notifyAdmins("FINANCE", `${actor.name} proposed ${fmtBDT(amountPaisa)} pooled capital allocation for ${project.title}; independent review is required.`, session);
      await audit(actor, "PROJECT_FUNDING_REQUEST", allocation.id, `${project.title}; ${fmtBDT(amountPaisa)}; awaiting independent review`, session);
    });
  } finally {
    await session.endSession();
  }
  return asDoc(allocation);
}

export async function reviewProjectFunding(actor, allocationId, approve, reviewNote = "") {
  assertAdmin(actor); assertActive(actor);
  if (typeof approve !== "boolean") throw badRequest("Approval decision must be a boolean.");
  const initial = await ProjectFundingAllocation.findOne({ id: allocationId, status: "PENDING" }).lean();
  if (!initial) throw conflict("This capital allocation is no longer awaiting review.");
  if (initial.createdBy === actor.id) throw forbidden("Maker-checker control: another administrator must review this allocation.");
  const note = String(reviewNote ?? "").trim().slice(0, 500);
  if (!approve && note.length < 5) throw badRequest("Provide a rejection reason of at least 5 characters.");

  const session = await mongoose.startSession();
  let updated;
  try {
    await session.withTransaction(async () => {
      const allocation = await ProjectFundingAllocation.findOne({ id: allocationId, status: "PENDING" }).session(session);
      if (!allocation) throw conflict("This capital allocation is no longer awaiting review.");
      if (allocation.createdBy === actor.id) throw forbidden("Maker-checker control: another administrator must review this allocation.");
      const project = await AgroProject.findOne({ id: allocation.projectId }).session(session);
      const programme = await Programme.findOne({ id: allocation.programmeId }).session(session);
      if (!project || ["ARCHIVED", "COMPLETED"].includes(project.status) || !programme) throw conflict("The project or parent programme is no longer available for a new allocation.");
      if (approve && programme.status !== "IN_PROGRESS") throw conflict("The pooled programme must be In Progress to approve project capital allocations.");

      // Serialize approvals with proposals so the approved plus pending total cannot
      // exceed active pooled capital due to two simultaneous reviewers.
      await Programme.updateOne({ id: programme.id }, { $inc: { fundingRevision: 1 } }, { session });
      if (approve) {
        const [investments, committed] = await Promise.all([
          Investment.find({ projectId: programme.id, status: "ACTIVE" }).select("amount").session(session).lean(),
          ProjectFundingAllocation.find({ programmeId: programme.id, status: { $in: ["PENDING", "APPROVED"] }, id: { $ne: allocation.id } }).select("amount").session(session).lean(),
        ]);
        const capital = total(investments, (x) => x.amount);
        if (total(committed, (x) => x.amount) + allocation.amount > capital) throw conflict("The programme's available capital changed. Reduce or reject this allocation and submit a revised proposal.");
      }

      updated = await ProjectFundingAllocation.findOneAndUpdate(
        { id: allocationId, status: "PENDING", createdBy: { $ne: actor.id } },
        { $set: { status: approve ? "APPROVED" : "REJECTED", reviewedBy: actor.id, reviewedAt: now(), reviewNote: note } },
        { new: true, session },
      );
      if (!updated) throw conflict("This allocation was reviewed by another request.");
      await notify(allocation.createdBy, "FINANCE", approve ? `Your pooled-capital allocation proposal for ${project.title} was approved.` : `Your capital-allocation proposal for ${project.title} was rejected: ${note}`, session);
      await audit(actor, approve ? "PROJECT_FUNDING_APPROVE" : "PROJECT_FUNDING_REJECT", allocationId, `${project.title}; ${fmtBDT(allocation.amount)}; ${note || "Approved"}`, session);
    });
  } finally {
    await session.endSession();
  }
  return asDoc(updated);
}

export async function createInvestmentRequest(user, { projectId, amount }) {
  if (user.role !== "INVESTOR") throw forbidden("Only investor accounts can submit investment requests.");
  assertActive(user);
  const investor = await User.findOne({ id: user.id });
  if (investor?.kyc?.status !== "VERIFIED") throw forbidden("Identity verification must be approved before requesting an investment.");
  const program = await getProgram(projectId);
  if (!program || program.status !== "OPEN") throw conflict("The collective investment programme is not currently accepting requests.");
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value < 100000 || value > 5_000_000_000) throw badRequest("Enter an investment amount between ৳1,000 and ৳50,000,000, with no more than two decimal places.");
  const existingRequests = await InvestmentRequest.find({ projectId }).lean();
  if (requestOpenAmount(existingRequests.filter((r) => r.investorId === user.id), projectId, value)) throw conflict("You already have an open request for this amount in the collective programme.");
  const positions = await Investment.find({ projectId, status: "ACTIVE" }).lean();
  const committed = total(positions, (i) => i.amount) + total(existingRequests.filter((r) => ACTIVE_REQUESTS.includes(r.status)), (r) => r.amount);
  if (program.targetAmount && committed + value > program.targetAmount) throw badRequest(`The request exceeds the programme's remaining target amount of ${fmtBDT(Math.max(0, program.targetAmount - committed))}. Contact support for guidance.`);
  const request = await InvestmentRequest.create({ id: newId("ir"), investorId: user.id, projectId: program.id, amount: value, status: "PENDING_REVIEW", createdAt: now(), updatedAt: now(), paymentAttempts: [] });
  await notifyAdmins("REQUEST", `${user.name} submitted a collective investment request for ${fmtBDT(value)}.`);
  await notify(user.id, "REQUEST", `Your collective investment request for ${fmtBDT(value)} was submitted. Payment is disabled until an administrator approves the request.`);
  await audit(user, "REQUEST_CREATE", request.id, `${program.title}; amount ${fmtBDT(value)}`);
  return asDoc(request);
}

export async function reviewInvestmentRequest(actor, requestId, approve) {
  assertAdmin(actor);
  const req = await InvestmentRequest.findOne({ id: requestId });
  if (!req || req.status !== "PENDING_REVIEW") throw conflict("This investment request is no longer awaiting review.");
  const investor = await User.findOne({ id: req.investorId }).lean();
  const p = await getProgram(req.projectId);
  if (approve) {
    if (!investor || investor.accountStatus !== "ACTIVE" || investor.approvalStatus !== "APPROVED") throw forbidden("The investor account is not active.");
    if (investor.kyc?.status !== "VERIFIED") throw forbidden("The investor's identity is not verified. Complete identity review first.");
    if (!p || p.status !== "OPEN") throw conflict("The collective investment programme is not currently accepting requests.");
  }
  req.status = approve ? "APPROVED_AWAITING_PAYMENT" : "REJECTED";
  req.reviewedBy = actor.id; req.reviewedAt = now(); req.updatedAt = now(); await req.save();
  await notify(req.investorId, "REQUEST", approve ? `${p?.title ?? "Premium Agro"}: your request for ${fmtBDT(req.amount)} is approved. Transfer the exact amount to the verified organization bank account, then submit your bank reference.` : `${p?.title ?? "Your investment request"}: your request was declined. No payment is due.`);
  await audit(actor, approve ? "REQUEST_APPROVE" : "REQUEST_REJECT", requestId, `${p?.title ?? req.projectId}; ${fmtBDT(req.amount)}`);
  return asDoc(req);
}

export async function submitInvestmentPayment(user, requestId, { channel = "BANK", trxId, proof = "" }) {
  const req = await InvestmentRequest.findOne({ id: requestId, investorId: user.id });
  if (!req) throw notFound("Investment request not found.");
  if (!["APPROVED_AWAITING_PAYMENT", "PAYMENT_REJECTED"].includes(req.status)) throw conflict("Payment can only be submitted after the investment request is approved.");
  if (user.role !== "INVESTOR") throw forbidden("Only investors can submit programme payments.");
  assertActive(user);
  const investor = await User.findOne({ id: user.id }).lean();
  if (investor?.kyc?.status !== "VERIFIED") throw forbidden("Your identity verification must remain approved before payment.");
  const project = await getProgram(req.projectId);
  if (!project) throw notFound("The programme for this request could not be found.");
  if (channel !== "BANK") throw badRequest("Only organization bank transfer is supported for investment payments.");
  verifyBankDetails(project.payment);
  const ref = String(trxId ?? "").trim();
  if (ref.length < 5 || ref.length > 100) throw badRequest("Enter a valid bank transaction reference (5–100 characters).");
  const [duplicateTx, duplicateInvestment, allRequests] = await Promise.all([
    Transaction.exists({ trxId: new RegExp(`^${escapeRegex(ref)}$`, "i") }),
    Investment.exists({ "payment.trxId": new RegExp(`^${escapeRegex(ref)}$`, "i") }),
    InvestmentRequest.find({}).select("paymentAttempts payment").lean(),
  ]);
  const duplicateRequestRef = allRequests.some((r) => [r.payment, ...(r.paymentAttempts ?? [])].some((p) => p?.trxId && p.trxId.toLowerCase() === ref.toLowerCase()));
  if (duplicateTx || duplicateInvestment || duplicateRequestRef) throw conflict("This transaction reference has already been submitted. Check the reference or contact support.");
  const safeProof = proof ? validDataFile(proof, { maxLength: 7_000_000 }) : null;
  const attempt = { id: newId("pay"), channel: "BANK", trxId: ref, proof: safeProof, status: "PENDING", submittedAt: now(), submittedBy: user.id };
  req.paymentAttempts = [...(req.paymentAttempts ?? []), attempt];
  req.payment = attempt; req.status = "PAYMENT_PENDING"; req.updatedAt = now(); await req.save();
  await notifyAdmins("PAYMENT", `${user.name} submitted bank-transfer evidence for investment request ${req.id}; independent payment review is required.`);
  await notify(user.id, "PAYMENT", "Your bank-transfer details were submitted for administrator verification. Your investment is not active until payment is approved.");
  await audit(user, "PAYMENT_SUBMIT", requestId, `BANK; ref ${ref}; pending manual bank confirmation`);
  return asDoc(req);
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export async function reviewInvestmentPayment(actor, requestId, approve) {
  assertAdmin(actor);
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const req = await InvestmentRequest.findOne({ id: requestId }).session(session);
      if (!req || req.status !== "PAYMENT_PENDING" || !req.payment) throw conflict("This payment is no longer awaiting review.");
      const investor = await User.findOne({ id: req.investorId }).session(session).lean();
      const program = await getProgram(req.projectId);
      if (!program) throw notFound("Programme not found.");
      if (approve && (investor?.accountStatus !== "ACTIVE" || investor?.approvalStatus !== "APPROVED" || investor?.kyc?.status !== "VERIFIED")) throw forbidden("Only an active, identity-verified investor may receive an investment activation.");
      if (req.payment.channel !== "BANK") throw badRequest("Only verified organization bank transfers can activate an investment.");
      const timestamp = now();
      req.payment.status = approve ? "APPROVED" : "REJECTED";
      req.payment.reviewedBy = actor.id; req.payment.reviewedAt = timestamp;
      req.paymentAttempts = (req.paymentAttempts ?? []).map((a) => a.id === req.payment.id ? { ...a, status: approve ? "APPROVED" : "REJECTED", reviewedBy: actor.id, reviewedAt: timestamp } : a);
      if (approve) {
        if (await Investment.exists({ "payment.trxId": req.payment.trxId }).session(session)) throw conflict("This transaction reference has already activated an investment.");
        const inv = await Investment.create([{ id: newId("i"), investorId: req.investorId, projectId: req.projectId, amount: req.amount, status: "ACTIVE", createdAt: timestamp, payment: req.payment }], { session });
        await Transaction.create([
          { id: newId("t"), userId: req.investorId, type: "DEPOSIT", amount: req.amount, date: timestamp, channel: "BANK", trxId: req.payment.trxId, status: "COMPLETED", ref: req.projectId },
          { id: newId("t"), userId: req.investorId, type: "INVEST", amount: -req.amount, date: timestamp, status: "COMPLETED", ref: req.projectId },
        ], { session });
        req.status = "PAID";
        await updateProgramRaised(req.projectId, session);
        await notify(req.investorId, "PAYMENT", `Your bank payment of ${fmtBDT(req.amount)} was confirmed and the investment is now active.`, session);
        result = asDoc(inv[0]);
      } else {
        req.status = "PAYMENT_REJECTED";
        await notify(req.investorId, "PAYMENT", `Your bank payment for ${fmtBDT(req.amount)} was not approved. Review the proof/reference and contact support before resubmitting.`, session);
      }
      req.reviewedBy = actor.id; req.reviewedAt = timestamp; req.updatedAt = timestamp; await req.save({ session });
      await audit(actor, approve ? "PAYMENT_APPROVE" : "PAYMENT_REJECT", requestId, `${program.title}; ${fmtBDT(req.amount)}; ${approve ? "BANK PAYMENT CONFIRMED" : "PAYMENT REJECTED"}`, session);
    });
  } finally { await session.endSession(); }
  return result ?? { ok: true, status: "PAYMENT_REJECTED" };
}

export async function cancelInvestmentRequest(user, requestId) {
  const req = await InvestmentRequest.findOne({ id: requestId, investorId: user.id });
  if (!req) throw notFound("Investment request not found.");
  if (!["PENDING_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_REJECTED"].includes(req.status)) throw conflict("This request cannot be cancelled at its current stage.");
  req.status = "CANCELLED"; req.cancelledAt = now(); req.updatedAt = now(); req.cancelReason = "Cancelled by investor"; await req.save();
  await audit(user, "REQUEST_CANCEL", req.id, "Investor cancelled unpaid request");
  return asDoc(req);
}

export async function requestWithdrawal(user, { amount, channel = "BANK" }) {
  if (user.role !== "INVESTOR") throw forbidden("Only investors can request withdrawals.");
  assertActive(user);
  if (!Number.isSafeInteger(Number(amount)) || Number(amount) <= 0) throw badRequest("Enter a valid withdrawal amount.");
  if (channel !== "BANK") throw badRequest("Only bank transfers are supported for withdrawals.");
  const investor = await User.findOne({ id: user.id }).lean();
  const bank = investor?.bank ?? {};
  if (![bank.bankName, bank.accName, bank.accNum].every((v) => typeof v === "string" && v.trim().length >= 2)) throw badRequest("Save the receiving bank name, account holder and account number in your profile before requesting a withdrawal.");
  const txs = await Transaction.find({ userId: user.id }).lean();
  const balance = total(txs.filter((t) => t.status === "COMPLETED"), (t) => t.amount);
  const reserved = total(txs.filter((t) => t.status === "PENDING" && t.amount < 0), (t) => t.amount);
  if (amount > balance + reserved) throw badRequest("Withdrawal amount exceeds the available balance.");
  const destination = `${bank.bankName.trim()} — ${bank.accName.trim()} • ${bank.accNum.trim()}${bank.branch?.trim() ? ` • ${bank.branch.trim()} Branch` : ""}`;
  const tx = await Transaction.create({ id: newId("t"), userId: user.id, type: "WITHDRAW", amount: -Number(amount), date: now(), channel: "BANK", trxId: destination, status: "PENDING" });
  await audit(user, "WITHDRAW_REQUEST", user.id, `BANK withdrawal ${fmtBDT(amount)}`);
  await notifyAdmins("PAYMENT", `${user.name} submitted a bank withdrawal request for ${fmtBDT(amount)}.`);
  return asDoc(tx);
}

export async function reviewTransaction(actor, txId, approve) {
  assertAdmin(actor);
  const tx = await Transaction.findOne({ id: txId });
  if (!tx || tx.status !== "PENDING") throw conflict("This transaction is not pending.");
  tx.status = approve ? "COMPLETED" : "REJECTED"; tx.reviewedBy = actor.id; tx.reviewedAt = now(); await tx.save();
  await notify(tx.userId, "PAYMENT", `${tx.type === "DEPOSIT" ? "Deposit" : "Withdrawal"} of ${fmtBDT(Math.abs(tx.amount))} has been ${approve ? "approved." : "rejected."}`);
  await audit(actor, approve ? "TX_APPROVE" : "TX_REJECT", txId, `${tx.type} ${tx.amount}`);
  return asDoc(tx);
}

export async function submitKyc(user, { kyc, profile }) {
  if (user.role !== "INVESTOR") throw forbidden("Only investor accounts can submit identity information.");
  assertActive(user);
  const account = await User.findOne({ id: user.id });
  if (["PENDING", "VERIFIED"].includes(account.kyc?.status)) throw conflict("Your identity application is already under review or verified.");
  if (!cleanObject(kyc) || !cleanObject(profile)) throw badRequest("Submit valid identity and profile information.");
  const normalizedProfile = { ...profile, nominee: { ...(profile.nominee ?? {}), name: String(profile.fatherName ?? ""), relation: "Father" } };
  validKyc({ kyc, profile: normalizedProfile });
  account.profile = normalizedProfile;
  account.kyc = { ...(account.kyc ?? {}), nid: String(kyc.nid), tin: String(kyc.tin ?? ""), passport: String(kyc.passport ?? ""), docs: Object.fromEntries(["nidFront", "nidBack", "photo"].map((key) => [key, validDataFile(kyc.docs[key], { maxLength: 700_000, imageOnly: key === "photo" })])), status: "PENDING", submittedAt: now(), reviewedAt: null, reviewedBy: null };
  await account.save();
  await notifyAdmins("KYC", `${account.name} submitted identity information for verification.`);
  await audit(user, "KYC_SUBMIT", user.id, "Identity information submitted for review");
  return { ok: true };
}

export async function reviewKyc(actor, userId, approve) {
  assertAdmin(actor);
  const target = await User.findOne({ id: userId });
  if (!target || target.role !== "INVESTOR") throw notFound("Investor account not found.");
  if (target.kyc?.status !== "PENDING") throw conflict("This identity application is not awaiting review.");
  if (approve && !["nidFront", "nidBack", "photo"].every((key) => target.kyc?.docs?.[key]?.dataUrl)) throw conflict("The investor must provide all required identity files first.");
  target.kyc.status = approve ? "VERIFIED" : "REJECTED"; target.kyc.reviewedAt = now(); target.kyc.reviewedBy = actor.id; await target.save();
  await notify(target.id, "KYC", approve ? "Your identity verification was approved." : "Your identity verification was not approved. Review the information and contact support before resubmitting.");
  await audit(actor, approve ? "KYC_APPROVE" : "KYC_REJECT", userId, `Identity verification ${approve ? "approved" : "rejected"}`);
  return { ok: true, status: target.kyc.status };
}

export async function updateProfile(user, fields) {
  assertActive(user);
  if (!cleanObject(fields)) throw badRequest("Invalid profile update.");
  const allowed = new Set(["bank", "avatar", "autoReinvest"]);
  if (Object.keys(fields).some((key) => !allowed.has(key))) throw forbidden("This profile update includes a protected field.");
  const target = await User.findOne({ id: user.id });
  if (!target) throw notFound("Account not found.");
  if (Object.hasOwn(fields, "bank")) {
    if (!cleanObject(fields.bank) || Object.keys(fields.bank).some((key) => !["accName", "accNum", "bankName", "branch"].includes(key)) || Object.values(fields.bank).some((value) => typeof value !== "string" || value.length > 160)) throw badRequest("Bank details are invalid.");
    target.bank = { ...(target.bank ?? {}), ...fields.bank };
  }
  if (Object.hasOwn(fields, "avatar")) {
    if (fields.avatar !== "" && (typeof fields.avatar !== "string" || !/^data:image\/(png|jpeg|webp);base64,/i.test(fields.avatar) || fields.avatar.length > 700_000)) throw badRequest("Profile image is invalid or too large.");
    target.avatar = fields.avatar;
  }
  if (Object.hasOwn(fields, "autoReinvest")) {
    if (typeof fields.autoReinvest !== "boolean") throw badRequest("Automatic reinvestment must be a boolean.");
    target.autoReinvest = fields.autoReinvest;
  }
  await target.save(); await audit(user, "PROFILE_UPDATE", user.id, Object.keys(fields).join(", "));
  return { ok: true };
}

export async function updateProgramme(actor, data) {
  assertAdmin(actor);
  if (!cleanObject(data)) throw badRequest("Enter the collective programme details.");
  const program = await getProgram();
  if (!program) throw notFound("The collective investment programme is not seeded. Run npm run seed:programme.");
  const title = String(data.title ?? program.title).trim();
  const location = String(data.location ?? program.location ?? "").trim();
  const description = String(data.description ?? program.description ?? "").trim();
  const bankName = String(data.bankName ?? program.payment?.bankName ?? "").trim();
  const bankAccountName = String(data.bankAccountName ?? program.payment?.bankAccountName ?? "").trim();
  const bankAccountNumber = String(data.bankAccountNumber ?? program.payment?.bankAccountNumber ?? "").trim();
  const bankBranch = String(data.bankBranch ?? program.payment?.bankBranch ?? "").trim();
  if (title.length < 3 || title.length > 120 || location.length < 2 || location.length > 160 || description.length < 20 || description.length > 6000) throw badRequest("Enter a valid programme title, location and description.");
  if (!bankName || !bankAccountName || bankAccountNumber.length < 5) throw badRequest("A bank name, account holder and account number are required before saving account details.");
  if (data.bankVerified !== undefined && typeof data.bankVerified !== "boolean") throw badRequest("Bank verification must be an explicit boolean confirmation.");
  const bankVerified = data.bankVerified === true;
  if (bankVerified && /demo|replace|placeholder|not configured/i.test(`${bankName} ${bankAccountName} ${bankAccountNumber}`)) throw badRequest("Demo or placeholder bank details cannot be marked as verified.");
  // An open programme must never continue accepting requests while its bank
  // confirmation is unchecked, regardless of which individual field changed.
  if (program.status === "OPEN" && !bankVerified) program.status = "PAUSED";
  program.title = title; program.location = location; program.description = description;
  program.payment = {
    ...(program.payment ?? {}), bankName, bankAccountName, bankAccountNumber, bankBranch, bankVerified,
    bank: `${bankName}${bankBranch ? ` — ${bankBranch} Branch` : ""}; Account holder: ${bankAccountName}; Account: ${bankAccountNumber}${bankVerified ? "" : " (not verified)"}`,
    bankVerifiedAt: bankVerified ? now() : null, bankVerifiedBy: bankVerified ? actor.id : null,
  };
  await program.save(); await audit(actor, "PROGRAM_UPDATE", program.id, `Programme settings saved; receiving bank internally attested ${bankVerified ? "verified" : "not verified"}`);
  return asDoc(program);
}

export async function setProgrammeStatus(actor, projectId, status) {
  assertAdmin(actor);
  const program = await getProgram(projectId);
  if (!program) throw notFound("The collective investment programme was not found.");
  if (!["OPEN", "PAUSED", "IN_PROGRESS"].includes(status)) throw badRequest("Use the programme lifecycle controls to open requests, pause or start operations.");
  const transitions = { PAUSED: program.operationsStartedAt ? ["IN_PROGRESS"] : ["OPEN"], OPEN: ["PAUSED", "IN_PROGRESS"], IN_PROGRESS: ["PAUSED"] };
  if (!(transitions[program.status] ?? []).includes(status)) throw conflict(`Invalid programme transition from ${program.status} to ${status}.`);
  if (status === "OPEN") verifyBankDetails(program.payment);
  let operationsStartedAt = program.operationsStartedAt ?? null;
  if (status === "IN_PROGRESS") {
    const activePositions = await Investment.countDocuments({ projectId: program.id, status: "ACTIVE" });
    const unsettled = await InvestmentRequest.countDocuments({ projectId: program.id, status: { $in: ACTIVE_REQUESTS } });
    if (!activePositions) throw conflict("At least one confirmed active investment is required before starting programme operations.");
    if (unsettled) throw conflict("Resolve all open investment requests and payment reviews before starting programme operations.");
    operationsStartedAt = operationsStartedAt ?? now();
  }
  const previous = program.status; program.status = status; program.operationsStartedAt = operationsStartedAt; await program.save();
  await audit(actor, "PROGRAM_STATUS", program.id, `${previous} → ${status}`);
  return asDoc(program);
}

export async function setProgrammeProgress(actor, projectId, { progress, stage }) {
  assertAdmin(actor);
  const program = await getProgram(projectId);
  if (!program) throw notFound("Programme not found.");
  if (program.status === "LIQUIDATED") throw conflict("The completed programme is closed; progress cannot be changed after settlement.");
  const pct = Number(progress); const cleanStage = String(stage ?? "").trim();
  if (!Number.isInteger(pct) || pct < 0 || pct > 100 || !cleanStage || cleanStage.length > 160) throw badRequest("Enter a whole-number progress percentage from 0 to 100 and a stage of up to 160 characters.");
  program.progress = pct; program.stage = cleanStage; program.progressUpdatedAt = now(); await program.save();
  await audit(actor, "PROJECT_STATUS", projectId, `${pct}% — ${cleanStage}`);
  return asDoc(program);
}

export async function addFieldLog(actor, input) {
  if (actor.role !== "FIELD_MGR") throw forbidden("Only Field Managers can submit field updates.");
  assertActive(actor);
  if (!cleanObject(input)) throw badRequest("Enter field update information.");
  if (input.notifyInvestors !== undefined && typeof input.notifyInvestors !== "boolean") throw badRequest("notifyInvestors must be a boolean.");
  const project = await AgroProject.findOne({ id: input.projectId });
  if (!project || project.status !== "ACTIVE") throw conflict("Choose an active underlying agro project for this field update.");
  const programme = await getProgram(project.programmeId);
  if (!programme || programme.status !== "IN_PROGRESS") throw conflict("Field updates can only be submitted while the pooled programme is in progress.");
  if (!["WEIGHT", "FEED", "HEALTH", "STAGE", "HARVEST"].includes(input.type)) throw badRequest("Choose a valid field update type.");
  const numberValue = input.value === "" || input.value == null ? null : Number(input.value);
  if (numberValue !== null && (!Number.isFinite(numberValue) || numberValue < 0)) throw badRequest("Measurement values must be zero or greater.");
  const note = String(input.note ?? "").trim(); if (note.length > 2000) throw badRequest("Field notes must be no longer than 2,000 characters.");
  if (numberValue === null && !note && !(Array.isArray(input.media) && input.media.length)) throw badRequest("Add a measurement, note or photo before submitting a field update.");
  const media = Array.isArray(input.media) ? input.media : [];
  if (media.length > 3) throw badRequest("Attach no more than three field images.");
  const safeMedia = media.map((file) => validDataFile(file, { maxLength: 500_000, allowPdf: false, imageOnly: true }));
  const log = await FieldLog.create({ id: newId("l"), programmeId: programme.id, projectId: project.id, type: input.type, tag: String(input.tag ?? "").trim().slice(0, 64) || null, value: numberValue, unit: String(input.unit ?? "").slice(0, 64), note, media: safeMedia, date: now(), loggedBy: actor.id, status: "PENDING_REVIEW", notifyInvestors: Boolean(input.notifyInvestors) });
  await notifyAdmins("FIELD", `${actor.name} submitted a field update for ${project.title}; it requires review.`);
  await audit(actor, "FIELD_LOG", project.id, `${project.title}; ${input.type}; submitted for approval`);
  return asDoc(log);
}

export async function reviewFieldLog(actor, logId, approve) {
  assertAdmin(actor);
  const log = await FieldLog.findOne({ id: logId }); if (!log || log.status !== "PENDING_REVIEW") throw conflict("This field update is no longer awaiting review.");
  const context = await getProjectContext(log.projectId);
  log.status = approve ? "APPROVED" : "REJECTED"; log.reviewedBy = actor.id; log.reviewedAt = now(); await log.save();
  if (approve && log.notifyInvestors) {
    const holders = await Investment.distinct("investorId", { projectId: context.programme.id, status: "ACTIVE" });
    const projectTitle = context.project?.title ?? context.programme.title;
    for (const id of holders) await notify(id, "FIELD", `A new verified field update is available for ${projectTitle}.`);
  }
  await audit(actor, approve ? "FIELD_APPROVE" : "FIELD_REJECT", logId, `${context.project?.title ?? context.programme.title}; ${log.projectId}`);
  return asDoc(log);
}

export async function createUser(actor, input) {
  assertAdmin(actor); assertActive(actor);
  const name = String(input.name ?? "").trim(); const email = String(input.email ?? "").trim().toLowerCase(); const phone = String(input.phone ?? "").trim(); const role = input.role ?? "INVESTOR"; const password = String(input.password ?? "");
  if (actor.role === "ADMIN" && !["INVESTOR", "FIELD_MGR"].includes(role)) throw forbidden("Administrators can create investor and field-manager accounts only.");
  if (!["INVESTOR", "FIELD_MGR"].includes(role)) throw badRequest("Administrator accounts must apply through public registration and be approved by the SuperAdmin.");
  if (name.length < 2 || name.length > 100 || !/^\S+@\S+\.\S+$/.test(email) || email.length > 180) throw badRequest("Enter a valid name and email address.");
  if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) throw badRequest("Enter a valid phone number.");
  if (password.length < 8 || password.length > 256) throw badRequest("Temporary password must be between 8 and 256 characters.");
  if (await User.exists({ email })) throw conflict("An account with this email already exists.");
  const bcrypt = (await import("bcryptjs")).default;
  const user = await User.create({ id: newId("u"), name, email, phone, passwordHash: await bcrypt.hash(password, 12), role, avatar: "", autoReinvest: false,
    profile: { fatherName: "", motherName: "", dob: "", gender: "", occupation: "", nationality: "Bangladeshi", address: { present: "", permanent: "", district: "", division: "" }, nominee: { name: "", relation: "Father", dob: "", nid: "", phone: "", address: "" } },
    kyc: { status: "NONE", nid: "", tin: "", passport: "", docs: { nidFront: "", nidBack: "", photo: "" } }, bank: { accName: name, accNum: "", bankName: "", branch: "" }, accountCreatedBy: actor.id, createdAt: now(), registrationFlow: true, accountStatus: "PENDING", approvalStatus: "PENDING_ADMIN", approval: {} });
  await notifyAdmins("ACCOUNT", `A manually created ${role.toLowerCase().replace("_", " ")} account for ${email} needs review.`);
  await audit(actor, "ACCOUNT_CREATE", user.id, `Assisted account created as ${role}; pending dual approval`);
  return publicUser(user);
}

export async function reviewRegistration(actor, targetId, approve) {
  assertAdmin(actor);
  const target = await User.findOne({ id: targetId });
  if (!target || !target.registrationFlow) throw notFound("Registration application not found.");
  if (target.id === actor.id) throw forbidden("You cannot review your own account.");
  if (["DELETED", "INACTIVE", "DEACTIVATED"].includes(target.accountStatus)) throw conflict("This account is not eligible for approval.");
  if (["APPROVED", "REJECTED"].includes(target.approvalStatus)) throw conflict("This registration has already been finalized.");
  const adminApplicant = target.role === "ADMIN";
  if (adminApplicant) {
    assertSuperAdmin(actor);
    if (target.approvalStatus !== "PENDING_MAIN_ADMIN") throw conflict("This Administrator application is not awaiting SuperAdmin review.");
    target.approvalStatus = approve ? "APPROVED" : "REJECTED"; target.accountStatus = approve ? "ACTIVE" : "REJECTED";
    target.approval = { ...(target.approval ?? {}), mainAdminApprovedAt: now(), mainAdminApprovedBy: actor.id, rejectedAt: approve ? null : now(), rejectedBy: approve ? null : actor.id };
  } else if (actor.role === "ADMIN") {
    if (!["INVESTOR", "FIELD_MGR"].includes(target.role)) throw forbidden("Only investor and field-manager registrations are reviewed in this queue.");
    if (target.approvalStatus !== "PENDING_ADMIN") throw conflict("This registration is not awaiting the administrator's first review.");
    target.approvalStatus = approve ? "PENDING_MAIN_ADMIN" : "REJECTED"; target.accountStatus = approve ? "PENDING" : "REJECTED";
    target.approval = { ...(target.approval ?? {}), adminApprovedAt: approve ? now() : null, adminApprovedBy: approve ? actor.id : null, rejectedAt: approve ? null : now(), rejectedBy: approve ? null : actor.id };
  } else {
    if (!["INVESTOR", "FIELD_MGR"].includes(target.role) || target.approvalStatus !== "PENDING_MAIN_ADMIN" || !target.approval?.adminApprovedAt) throw conflict("The administrator must approve this registration first.");
    target.approvalStatus = approve ? "APPROVED" : "REJECTED"; target.accountStatus = approve ? "ACTIVE" : "REJECTED";
    target.approval = { ...(target.approval ?? {}), mainAdminApprovedAt: now(), mainAdminApprovedBy: actor.id, rejectedAt: approve ? null : now(), rejectedBy: approve ? null : actor.id };
  }
  await target.save();
  await notify(target.id, "ACCOUNT", approve ? (target.approvalStatus === "APPROVED" ? "Your Premium Agro account has been approved and activated. You can now sign in." : "Your first registration review is complete. The SuperAdmin must complete the final review before you can sign in.") : "Your registration was not approved. Please contact support.");
  await audit(actor, approve ? "ACCOUNT_APPROVE" : "ACCOUNT_REJECT", targetId, `${target.role}; ${target.approvalStatus}`);
  return publicUser(target);
}

export async function setAccountStatus(actor, targetId, status) {
  assertAdmin(actor); const target = await User.findOne({ id: targetId });
  if (!target) throw notFound("Account not found.");
  if (target.id === actor.id) throw forbidden("You cannot deactivate or delete your own account.");
  if (target.role === "MAIN_ADMIN") throw forbidden("The SuperAdmin account is protected.");
  if (!["ACTIVE", "INACTIVE", "DELETED"].includes(status)) throw badRequest("Invalid account status.");
  if (target.role === "ADMIN" && actor.role !== "MAIN_ADMIN") throw forbidden("Only the SuperAdmin can manage Administrator accounts.");
  if (!["INVESTOR", "FIELD_MGR", "ADMIN"].includes(target.role)) throw forbidden("This account type cannot be managed here.");
  if (status === "ACTIVE" && target.registrationFlow && target.approvalStatus !== "APPROVED") throw conflict("The registration must complete all required approvals before activation.");
  if (status === "ACTIVE" && target.approvalStatus === "REJECTED") throw conflict("A rejected registration cannot be activated.");
  if (target.accountStatus === "DELETED") throw conflict("Deleted accounts cannot be reactivated.");
  if (target.accountStatus === status) throw conflict(`This account is already ${status.toLowerCase()}.`);
  const previous = target.accountStatus; target.accountStatus = status; target.statusChangedAt = now(); target.statusChangedBy = actor.id;
  if (status === "DELETED") { target.deletedAt = now(); target.deletedBy = actor.id; }
  await target.save();
  if (target.role === "INVESTOR" && ["INACTIVE", "DELETED"].includes(status)) {
    await InvestmentRequest.updateMany({ investorId: targetId, status: { $in: ["PENDING_REVIEW", "APPROVED_AWAITING_PAYMENT", "PAYMENT_REJECTED"] } }, { $set: { status: "CANCELLED", updatedAt: now(), cancelledAt: now(), cancelReason: `Investor account ${status.toLowerCase()}` } });
  }
  await audit(actor, status === "DELETED" ? "ACCOUNT_DELETE" : status === "ACTIVE" ? "ACCOUNT_ACTIVATE" : "ACCOUNT_DEACTIVATE", targetId, `${target.email}; ${previous} -> ${status}; soft delete preserves financial history`);
  return publicUser(target);
}

export async function setRole(actor, targetId, role) {
  assertAdmin(actor); const target = await User.findOne({ id: targetId });
  if (!target) throw notFound("Account not found.");
  if (target.id === actor.id) throw forbidden("You cannot change your own role.");
  if (target.role === "MAIN_ADMIN" || role === "MAIN_ADMIN") throw forbidden("The SuperAdmin role is protected and cannot be reassigned.");
  if (!["INVESTOR", "FIELD_MGR", "ADMIN"].includes(role)) throw badRequest("Choose a valid role: Investor, Field Manager or Administrator.");
  if (target.role === role) throw conflict("This account already has that role.");
  if (["PENDING", "REJECTED", "DELETED", "INACTIVE", "DEACTIVATED"].includes(target.accountStatus) || target.approvalStatus !== "APPROVED") throw conflict("The account must be approved and active before its role can be changed.");
  if (actor.role === "ADMIN" && (!["INVESTOR", "FIELD_MGR"].includes(target.role) || !["INVESTOR", "FIELD_MGR"].includes(role))) throw forbidden("Administrators can only change roles between Investor and Field Manager.");
  if (target.role === "INVESTOR" && role !== "INVESTOR") {
    const [hasInvestment, hasOpenRequest, hasPendingTx] = await Promise.all([
      Investment.exists({ investorId: targetId, status: "ACTIVE" }),
      InvestmentRequest.exists({ investorId: targetId, status: { $in: ACTIVE_REQUESTS } }),
      Transaction.exists({ userId: targetId, status: "PENDING" }),
    ]);
    const txs = await Transaction.find({ userId: targetId, status: "COMPLETED" }).lean();
    if (hasInvestment || hasOpenRequest || hasPendingTx || total(txs, (tx) => tx.amount) !== 0) throw conflict("Resolve active investment positions, open requests, pending transactions and wallet balance before changing this investor's role.");
  }
  const previous = target.role; target.previousRole = previous; target.role = role; target.roleChangedAt = now(); target.roleChangedBy = actor.id; await target.save();
  await notify(targetId, "ACCOUNT", `Your Premium Agro access role was changed from ${previous} to ${role}. Financial and audit history has been retained.`);
  await audit(actor, "ROLE_CHANGE", targetId, `${target.email}; ${previous} -> ${role}; financial history retained`);
  return publicUser(target);
}

export async function markNotificationsRead(user) {
  await Notification.updateMany({ userId: user.id, read: false }, { $set: { read: true } });
  return { ok: true };
}

export async function sendSupportMessage(user, text) {
  assertActive(user);
  const body = String(text ?? "").trim(); if (body.length < 2 || body.length > 3000) throw badRequest("Support messages must contain 2 to 3,000 characters.");
  if (!["INVESTOR", "FIELD_MGR"].includes(user.role)) throw forbidden("Only investor or field-manager accounts can open a support conversation.");
  const msg = await SupportMessage.create({ id: newId("msg"), threadId: user.id, senderId: user.id, senderName: user.name, senderRole: user.role, text: body, createdAt: now(), readByAdmin: false, readByUser: true });
  await notifyAdmins("SUPPORT", `New Help & Support message from ${user.name}.`);
  await audit(user, "SUPPORT_MESSAGE", msg.id, `${user.role} sent support message`);
  return asDoc(msg);
}

export async function replySupportMessage(actor, threadId, text) {
  assertAdmin(actor);
  const body = String(text ?? "").trim(); if (body.length < 2 || body.length > 3000) throw badRequest("Support replies must contain 2 to 3,000 characters.");
  const target = await User.findOne({ id: threadId, role: { $in: ["INVESTOR", "FIELD_MGR"] } }).lean();
  if (!target) throw notFound("Support conversation not found.");
  const msg = await SupportMessage.create({ id: newId("msg"), threadId, senderId: actor.id, senderName: actor.name, senderRole: actor.role, text: body, createdAt: now(), readByAdmin: true, readByUser: false });
  await notify(threadId, "SUPPORT", "Premium Agro support replied to your conversation.");
  await audit(actor, "SUPPORT_REPLY", msg.id, `Replied to ${threadId}`);
  return asDoc(msg);
}

export async function markSupportThreadRead(actor, threadId) {
  assertAdmin(actor);
  await SupportMessage.updateMany({ threadId, senderId: threadId, readByAdmin: false }, { $set: { readByAdmin: true } });
  return { ok: true };
}

export async function uploadLegalDocument(actor, input) {
  assertAdmin(actor);
  const title = String(input.title ?? "").trim(); const category = String(input.category ?? "LEGAL").trim(); const description = String(input.description ?? "").trim();
  if (title.length < 3 || title.length > 160) throw badRequest("Document title must be between 3 and 160 characters.");
  const file = validDataFile(input.file, { maxLength: 2_200_000 });
  const doc = await LegalDocument.create({ id: newId("doc"), title, category, description: description.slice(0, 2000), file, uploadedBy: actor.id, uploadedAt: now(), isPublished: true });
  await audit(actor, "DOCUMENT_UPLOAD", doc.id, `${title}; ${file.name}`);
  return asDoc(doc);
}

export async function deleteLegalDocument(actor, documentId) {
  assertAdmin(actor); const doc = await LegalDocument.findOne({ id: documentId });
  if (!doc) throw notFound("Legal document not found.");
  await doc.deleteOne(); await audit(actor, "DOCUMENT_DELETE", documentId, doc.title);
  return { ok: true };
}

const revenueCategories = new Set(["PRODUCT_SALES", "BYPRODUCT_SALES", "SUBSIDY", "OTHER_REVENUE"]);
const expenseCategories = new Set(["FEED", "SEEDS_PLANTS", "FERTILIZER", "VETERINARY", "LABOR", "TRANSPORT", "EQUIPMENT", "IRRIGATION", "UTILITIES", "RENT", "OTHER_EXPENSE"]);
export async function createFinancialEntry(actor, input) {
  assertAdmin(actor); assertActive(actor);
  if (!cleanObject(input)) throw badRequest("Enter the project financial details.");
  const { programme, project } = await getProjectContext(input.projectId);
  if (["DRAFT", "LIQUIDATED"].includes(programme.status) || await Allocation.exists({ projectId: programme.id })) throw conflict("Financial entries can only be added before the pooled programme is settled.");
  if (project && ["COMPLETED", "ARCHIVED"].includes(project.status)) throw conflict("Financial entries are locked for completed or archived projects.");
  const amountInput = Number(input.amount); if (!Number.isSafeInteger(amountInput) || amountInput <= 0) throw badRequest("Amount must be a positive whole number of paisa.");
  const rawDate = String(input.transactionDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) throw badRequest("Enter a valid transaction date.");
  const parsed = new Date(`${rawDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== rawDate || rawDate > todayInDhaka()) throw badRequest("Enter a real transaction date that is not in the future.");
  const description = String(input.description ?? "").trim(); if (description.length < 5 || description.length > 500) throw badRequest("Description must be between 5 and 500 characters.");
  const reference = String(input.reference ?? "").trim().slice(0, 120);
  if (reference && await FinancialEntry.exists({ projectId: input.projectId, reference: new RegExp(`^${escapeRegex(reference)}$`, "i"), status: { $ne: "REJECTED" } })) throw conflict("That reference already exists for this project.");
  let kind = input.kind; let category = String(input.category ?? ""); let amount = amountInput; let reversalOf = null; const mode = input.mode === "REVERSAL" ? "REVERSAL" : "STANDARD";
  const existing = await FinancialEntry.find({ projectId: input.projectId }).lean();
  if (mode === "REVERSAL") {
    const original = existing.find((entry) => entry.id === input.reversalOf);
    if (!original || original.status !== "APPROVED" || original.reversalOf || await Allocation.exists({ projectId: programme.id })) throw conflict("Choose an approved, unreversed entry from the same unsettled project.");
    const reserved = total(existing.filter((entry) => entry.reversalOf === original.id && entry.status !== "REJECTED"), (entry) => Math.abs(entry.amount));
    const remaining = Number(original.amount) - reserved;
    if (!Number.isSafeInteger(remaining) || remaining <= 0 || amountInput > remaining) throw badRequest(`The reversal cannot exceed the unreversed balance of ${fmtBDT(Math.max(remaining, 0))}.`);
    kind = original.kind; category = original.category; amount = -amountInput; reversalOf = original.id;
  } else {
    if (!["REVENUE", "EXPENSE"].includes(kind)) throw badRequest("Choose Revenue or Expense.");
    if (!(kind === "REVENUE" ? revenueCategories : expenseCategories).has(category)) throw badRequest("Choose a valid category for the selected entry type.");
  }
  const evidence = input.evidence == null ? null : validDataFile(input.evidence, { maxLength: 500_000 });
  const title = project?.title ?? programme.title;
  const entry = await FinancialEntry.create({ id: newId("fe"), programmeId: programme.id, projectId: input.projectId, kind, category, amount, mode, reversalOf, transactionDate: rawDate, description, reference, evidence, status: "PENDING", createdBy: actor.id, createdAt: now(), reviewedBy: null, reviewedAt: null, reviewNote: "" });
  await notifyAdmins("FINANCE", `${actor.name} submitted a ${mode === "REVERSAL" ? "financial correction" : kind.toLowerCase()} entry for ${title}; it requires review by a different administrator.`);
  await audit(actor, "FINANCIAL_ENTRY_CREATE", entry.id, `${title}; ${mode}; ${kind}; ${fmtBDT(amount)}; ${category}; awaiting independent review`);
  return asDoc(entry);
}

export async function reviewFinancialEntry(actor, entryId, approve, reviewNote = "") {
  assertAdmin(actor); assertActive(actor);
  const entry = await FinancialEntry.findOne({ id: entryId }); if (!entry || entry.status !== "PENDING") throw conflict("This financial entry is no longer awaiting review.");
  if (entry.createdBy === actor.id) throw forbidden("Maker-checker control: a different administrator must review your entry.");
  const note = String(reviewNote ?? "").trim().slice(0, 500); if (!approve && note.length < 5) throw badRequest("Provide a rejection reason of at least 5 characters.");
  const { programme, project } = await getProjectContext(entry.projectId);
  if (approve && (["DRAFT", "LIQUIDATED"].includes(programme.status) || await Allocation.exists({ projectId: programme.id }))) throw conflict("The pooled programme is closed to new financial approvals.");
  if (approve && project && ["COMPLETED", "ARCHIVED"].includes(project.status)) throw conflict("Financial entries for completed or archived projects cannot be newly approved.");
  if (approve && entry.reversalOf) {
    const original = await FinancialEntry.findOne({ id: entry.reversalOf });
    if (!original || original.status !== "APPROVED" || await Allocation.exists({ projectId: programme.id })) throw conflict("The original financial entry is no longer eligible for reversal.");
    const reversals = await FinancialEntry.find({ reversalOf: original.id, status: { $ne: "REJECTED" }, id: { $ne: entry.id } }).lean();
    if (total(reversals, (x) => Math.abs(x.amount)) + Math.abs(entry.amount) > Number(original.amount)) throw conflict("Approved and pending reversals exceed the original entry amount.");
  }
  const updated = await FinancialEntry.findOneAndUpdate({ id: entryId, status: "PENDING", createdBy: { $ne: actor.id } }, { $set: { status: approve ? "APPROVED" : "REJECTED", reviewedBy: actor.id, reviewedAt: now(), reviewNote: note } }, { new: true });
  if (!updated) throw conflict("This financial entry was already reviewed by another request.");
  await notify(entry.createdBy, "FINANCE", approve ? `Your financial entry for ${project?.title ?? programme.title} was approved and is now included in management reports.` : `Your financial entry was rejected. Reason: ${note}`);
  await audit(actor, approve ? "FINANCIAL_ENTRY_APPROVE" : "FINANCIAL_ENTRY_REJECT", entryId, `${project?.title ?? programme.title}; ${updated.status}; amount ${fmtBDT(entry.amount)}; ${note || "No review note"}`);
  return asDoc(updated);
}

function previewAllocation(investments, { gross, costs, commissionPct }) {
  const active = investments.filter((i) => i.status === "ACTIVE");
  const totalCapital = total(active, (i) => i.amount);
  const commission = Math.round(gross * (commissionPct / 100));
  const net = gross - costs - commission;
  const rows = active.map((inv) => ({ inv, sharePct: totalCapital ? inv.amount / totalCapital * 100 : 0, payout: totalCapital && Number.isSafeInteger(net) && net >= 0 ? Number((BigInt(net) * BigInt(inv.amount)) / BigInt(totalCapital)) : 0 }));
  if (rows.length && net > 0) rows[0].payout += net - total(rows, (r) => r.payout);
  return { totalCapital, commission, net, rows, invested: totalCapital };
}

export async function allocateProceeds(actor, input) {
  assertAdmin(actor);
  if (!cleanObject(input)) throw badRequest("Enter the programme settlement figures.");
  const gross = Number(input.gross); const costs = Number(input.costs); const commissionPct = Number(input.commissionPct);
  if (!Number.isSafeInteger(gross) || gross < 0 || !Number.isSafeInteger(costs) || costs < 0 || !Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) throw badRequest("Gross sales and costs must be non-negative whole paisa amounts; commission must be from 0% to 100%.");
  const program = await getProgram(input.projectId); if (!program) throw notFound("Programme not found.");
  if (program.status !== "IN_PROGRESS") throw conflict("Programme proceeds can only be allocated when operations are In Progress.");
  if (await Allocation.exists({ projectId: program.id })) throw conflict("The programme has already been settled.");
  const childProjects = await AgroProject.find({ programmeId: program.id }).select("id title status").lean();
  const childProjectIds = childProjects.map((project) => project.id);
  if (await ProjectFundingAllocation.exists({ programmeId: program.id, status: "PENDING" })) throw conflict("Resolve all pending internal project-capital allocation proposals before programme settlement.");
  const fundedProjectIds = new Set(await ProjectFundingAllocation.distinct("projectId", { programmeId: program.id, status: "APPROVED" }));
  const stillOpenFundedProjects = childProjects.filter((project) => fundedProjectIds.has(project.id) && !["COMPLETED", "ARCHIVED"].includes(project.status));
  if (stillOpenFundedProjects.length) throw conflict(`Complete or archive every funded underlying project before settling the pooled programme: ${stillOpenFundedProjects.map((project) => project.title).join(", ")}.`);
  const entries = await FinancialEntry.find({ projectId: { $in: [program.id, ...childProjectIds] } }).lean();
  if (entries.some((entry) => entry.status === "PENDING")) throw conflict("Resolve every financial entry awaiting review across the programme and all underlying projects before settlement.");
  const approved = entries.filter((entry) => entry.status === "APPROVED");
  if (!approved.length) throw conflict("At least one financial entry must be approved before settlement. Record and independently review the programme's realized revenue and expenses first.");
  const recordedGross = total(approved.filter((entry) => entry.kind === "REVENUE"), (e) => e.amount);
  const recordedCosts = total(approved.filter((entry) => entry.kind === "EXPENSE"), (e) => e.amount);
  if (recordedGross < 0 || recordedCosts < 0 || gross !== recordedGross || costs !== recordedCosts) throw conflict(`Settlement must match approved financial entries: gross ${fmtBDT(recordedGross)}, costs ${fmtBDT(recordedCosts)}.`);
  const investments = await Investment.find({ projectId: program.id, status: "ACTIVE" }).lean();
  const preview = previewAllocation(investments, { gross, costs, commissionPct });
  if (!preview.rows.length || preview.totalCapital <= 0) throw conflict("There are no active investor positions to settle for this programme.");
  if (preview.net < 0) throw badRequest("Costs and commission exceed gross sales.");
  const session = await mongoose.startSession(); let allocation;
  try {
    await session.withTransaction(async () => {
      if (await Allocation.exists({ projectId: program.id }).session(session)) throw conflict("The programme has already been settled.");
      const timestamp = now();
      allocation = new Allocation({ id: newId("pa"), projectId: program.id, grossSales: gross, operatingCosts: costs, commissionPct, platformCommission: preview.commission, netProceeds: preview.net, investedCapital: preview.invested, allocationBasis: "INVESTED_CAPITAL", totalCapital: preview.totalCapital, investorCount: new Set(preview.rows.map(({ inv }) => inv.investorId)).size, positionCount: preview.rows.length, realizedProfitLoss: preview.net - preview.invested, createdAt: timestamp, createdBy: actor.id, payouts: preview.rows.map(({ inv, payout }) => ({ investmentId: inv.id, investorId: inv.investorId, investedCapital: inv.amount, sharePct: preview.totalCapital ? inv.amount / preview.totalCapital * 100 : 0, payout, realizedProfitLoss: payout - inv.amount })) });
      await allocation.save({ session });
      for (const { inv, payout } of preview.rows) {
        const changed = await Investment.updateOne({ id: inv.id, status: "ACTIVE" }, { $set: { status: "COMPLETED", payout } }, { session });
        if (changed.modifiedCount !== 1) throw conflict("An investment position changed during settlement; nothing was distributed.");
        await Transaction.create([{ id: newId("t"), userId: inv.investorId, type: "DIVIDEND", amount: payout, date: timestamp, channel: null, trxId: null, status: "COMPLETED", ref: program.id, allocationId: allocation.id }], { session });
        await notify(inv.investorId, "PAYMENT", `${fmtBDT(payout)} in total programme proceeds from ${program.title} has been credited to your wallet. Review Reports & Statements for realized gain or loss.`, session);
      }
      // Preserve the capital-at-settlement snapshot for reporting. Recomputing from
      // ACTIVE investments here would incorrectly overwrite raisedAmount with zero
      // after the position loop changes those investments to COMPLETED.
      const changedProgram = await Programme.updateOne(
        { id: program.id, status: "IN_PROGRESS" },
        { $set: { status: "LIQUIDATED", raisedAmount: preview.totalCapital } },
        { session },
      );
      if (changedProgram.modifiedCount !== 1) throw conflict("Programme status changed during settlement; retry after review.");
      await audit(actor, "ALLOCATE", program.id, `Gross ${fmtBDT(gross)}, costs ${fmtBDT(costs)}, commission ${fmtBDT(preview.commission)}, net proceeds ${fmtBDT(preview.net)}, realized gain/loss ${fmtBDT(preview.net - preview.invested)}`, session);
    });
  } finally { await session.endSession(); }
  return asDoc(allocation);
}

export async function previewProceeds(actor, input) {
  assertAdmin(actor); assertActive(actor);
  if (!cleanObject(input)) throw badRequest("Enter the programme settlement figures.");
  const gross = Number(input.gross);
  const costs = Number(input.costs);
  const commissionPct = Number(input.commissionPct);
  if (!Number.isSafeInteger(gross) || gross < 0 || !Number.isSafeInteger(costs) || costs < 0 || !Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) {
    throw badRequest("Gross sales and costs must be non-negative whole paisa amounts; commission must be from 0% to 100%.");
  }
  const program = await getProgram(input.projectId); if (!program) throw notFound("Programme not found.");
  if (program.status !== "IN_PROGRESS") throw conflict("Preview proceeds only after pooled programme operations have started.");
  if (await Allocation.exists({ projectId: program.id })) throw conflict("The programme has already been settled.");
  const investments = await Investment.find({ projectId: program.id, status: "ACTIVE" }).lean();
  const p = previewAllocation(investments, { gross, costs, commissionPct });
  if (!p.rows.length || p.totalCapital <= 0) throw conflict("There are no active investor positions to preview.");
  if (p.net < 0) throw badRequest("Costs and commission exceed gross sales.");
  return { totalCapital: p.totalCapital, commission: p.commission, net: p.net, invested: p.invested, rows: p.rows.map(({ inv, sharePct, payout }) => ({ inv, sharePct, payout })) };
}
