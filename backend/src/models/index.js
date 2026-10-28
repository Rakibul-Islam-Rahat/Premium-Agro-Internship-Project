import mongoose from "mongoose";

const { Schema } = mongoose;
const common = { minimize: false, strict: false, versionKey: false, timestamps: false };
const base = (extra = {}) => new Schema({ id: { type: String, required: true, unique: true, index: true }, ...extra }, common);

const UserSchema = base({
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["INVESTOR", "FIELD_MGR", "ADMIN", "MAIN_ADMIN"], required: true, index: true },
  phone: { type: String, default: "" }, avatar: { type: String, default: "" },
  profile: { type: Schema.Types.Mixed, default: {} }, kyc: { type: Schema.Types.Mixed, default: { status: "NONE" } },
  bank: { type: Schema.Types.Mixed, default: {} },
  accountStatus: { type: String, default: "PENDING", index: true },
  approvalStatus: { type: String, default: "PENDING_ADMIN", index: true },
  approval: { type: Schema.Types.Mixed, default: {} },
  registrationFlow: { type: Boolean, default: true }, autoReinvest: { type: Boolean, default: false },
  createdAt: { type: String, default: () => new Date().toISOString() },
  deletedAt: String, deletedBy: String, previousRole: String, roleChangedAt: String, roleChangedBy: String,
});

const ProgrammeSchema = base({
  singletonKey: { type: String, default: "premium-agro-collective", unique: true, index: true },
  title: { type: String, required: true }, location: String, targetAmount: { type: Number, default: 0 }, raisedAmount: { type: Number, default: 0 },
  category: { type: String, default: "COLLECTIVE" }, risk: { type: String, default: "VARIABLE" },
  status: { type: String, enum: ["PAUSED", "OPEN", "IN_PROGRESS", "LIQUIDATED"], default: "PAUSED", index: true },
  operationsStartedAt: String, fundingRevision: { type: Number, default: 0 }, progress: { type: Number, default: 0 }, stage: String, startDate: String, harvestDate: String,
  payment: { type: Schema.Types.Mixed, default: {} }, description: String, subprojects: [Schema.Types.Mixed], protocols: [String],
});

const AgroProjectSchema = base({
  programmeId: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  category: { type: String, required: true, default: "OTHER", maxlength: 64 },
  location: { type: String, required: true, maxlength: 200 },
  summary: { type: String, default: "", maxlength: 300 },
  description: { type: String, required: true, maxlength: 6000 },
  status: { type: String, enum: ["PLANNING", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"], default: "PLANNING", index: true },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  stage: { type: String, default: "Planning", maxlength: 160 },
  startDate: String,
  expectedEndDate: String,
  coverImage: String,
  createdBy: String,
  updatedBy: String,
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: String,
  archivedAt: String,
  archivedBy: String,
});
AgroProjectSchema.index({ programmeId: 1, title: 1 }, { unique: true });

const ProjectFundingAllocationSchema = base({
  programmeId: { type: String, required: true, index: true },
  projectId: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 1 },
  note: { type: String, default: "", maxlength: 1000 },
  status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING", index: true },
  createdBy: { type: String, required: true, index: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  reviewedBy: String,
  reviewedAt: String,
  reviewNote: String,
});
ProjectFundingAllocationSchema.index({ projectId: 1, status: 1 });

const InvestmentRequestSchema = base({
  investorId: { type: String, required: true, index: true }, projectId: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 1 }, status: { type: String, default: "PENDING_REVIEW", index: true },
  createdAt: String, updatedAt: String, reviewedBy: String, reviewedAt: String, payment: Schema.Types.Mixed,
  paymentAttempts: { type: [Schema.Types.Mixed], default: [] }, cancelledAt: String, cancelReason: String,
});
const InvestmentSchema = base({ investorId: { type: String, index: true }, projectId: { type: String, index: true }, amount: Number, status: { type: String, index: true }, createdAt: String, payout: Number, payment: Schema.Types.Mixed, allocationId: String });
const TransactionSchema = base({ userId: { type: String, index: true }, type: String, amount: Number, date: String, channel: String, trxId: String, status: { type: String, index: true }, ref: String, reviewedBy: String, allocationId: String });
TransactionSchema.index({ trxId: 1, status: 1 });
const FieldLogSchema = base({ projectId: { type: String, index: true }, type: String, tag: String, value: Schema.Types.Mixed, unit: String, note: String, media: [Schema.Types.Mixed], loggedBy: { type: String, index: true }, status: { type: String, index: true }, date: String, notifyInvestors: Boolean, reviewedBy: String, reviewedAt: String });
const NotificationSchema = base({ userId: { type: String, required: true, index: true }, type: String, text: String, date: String, read: { type: Boolean, default: false, index: true } });
const AuditSchema = base({ actorId: { type: String, index: true }, actorName: String, action: String, entity: String, detail: String, date: String });
const AllocationSchema = base({ projectId: { type: String, index: true }, grossSales: Number, operatingCosts: Number, commissionPct: Number, platformCommission: Number, netProceeds: Number, investedCapital: Number, allocationBasis: String, totalCapital: Number, investorCount: Number, positionCount: Number, realizedProfitLoss: Number, createdAt: String, createdBy: String, payouts: [Schema.Types.Mixed] });
const FinancialEntrySchema = base({ projectId: { type: String, index: true }, kind: String, category: String, amount: Number, mode: String, reversalOf: String, transactionDate: String, description: String, reference: String, evidence: Schema.Types.Mixed, status: { type: String, default: "PENDING", index: true }, createdBy: { type: String, index: true }, createdAt: String, reviewedBy: String, reviewedAt: String, reviewNote: String });
FinancialEntrySchema.index({ projectId: 1, reference: 1 });
const LegalDocumentSchema = base({ title: String, category: String, description: String, file: Schema.Types.Mixed, uploadedBy: String, uploadedAt: String, isPublished: { type: Boolean, default: true } });
const SupportMessageSchema = base({ threadId: { type: String, required: true, index: true }, senderId: { type: String, required: true, index: true }, senderName: String, senderRole: String, text: String, createdAt: String, readByAdmin: { type: Boolean, default: false }, readByUser: { type: Boolean, default: false } });
const RefreshSessionSchema = base({ userId: { type: String, required: true, index: true }, tokenHash: { type: String, required: true, unique: true }, expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }, revokedAt: Date, createdAt: Date });
const AuthChallengeSchema = base({ userId: { type: String, required: true, index: true }, codeHash: { type: String, required: true }, purpose: { type: String, enum: ["LOGIN", "PASSWORD_RESET"], required: true }, expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }, attempts: { type: Number, default: 0 }, usedAt: Date, createdAt: Date });

function model(name, schema, collection) {
  return mongoose.models[name] || mongoose.model(name, schema, collection);
}

export const User = model("PremiumAgroUser", UserSchema, "users");
export const Programme = model("PremiumAgroProgramme", ProgrammeSchema, "investmentPrograms");
export const AgroProject = model("PremiumAgroProject", AgroProjectSchema, "agroProjects");
export const ProjectFundingAllocation = model("PremiumAgroProjectFundingAllocation", ProjectFundingAllocationSchema, "projectFundingAllocations");
export const InvestmentRequest = model("PremiumAgroInvestmentRequest", InvestmentRequestSchema, "investmentRequests");
export const Investment = model("PremiumAgroInvestment", InvestmentSchema, "investments");
export const Transaction = model("PremiumAgroTransaction", TransactionSchema, "ledgerEntries");
export const FieldLog = model("PremiumAgroFieldLog", FieldLogSchema, "fieldLogs");
export const Notification = model("PremiumAgroNotification", NotificationSchema, "notifications");
export const AuditLog = model("PremiumAgroAuditLog", AuditSchema, "auditLogs");
export const Allocation = model("PremiumAgroAllocation", AllocationSchema, "profitAllocations");
export const FinancialEntry = model("PremiumAgroFinancialEntry", FinancialEntrySchema, "financialEntries");
export const LegalDocument = model("PremiumAgroLegalDocument", LegalDocumentSchema, "legalDocuments");
export const SupportMessage = model("PremiumAgroSupportMessage", SupportMessageSchema, "supportMessages");
export const RefreshSession = model("PremiumAgroRefreshSession", RefreshSessionSchema, "refreshSessions");
export const AuthChallenge = model("PremiumAgroAuthChallenge", AuthChallengeSchema, "authChallenges");
