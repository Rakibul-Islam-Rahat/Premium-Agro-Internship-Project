import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sha256 } from "../src/lib/sha256.js";
import { api, previewAllocation } from "../src/services/api.js";
import { getState, resetDb } from "../src/services/mock/store-core.js";
import { summarizeFinancialEntries, reconcileCloseout, csvCell } from "../src/lib/reports.js";

for (const value of ["", "abc", "x".repeat(1000), "Premium Agro ৳"])
  assert.equal(sha256(value), crypto.createHash("sha256").update(value).digest("hex"));

resetDb();
let state = getState();
assert.equal(state.projects.length, 1, "one pooled programme is the only investment choice");
assert.equal(state.projects[0].title, "Premium Agro Collective Investment Programme");
assert.equal(state.projects[0].status, "PAUSED", "the demo does not accept deposits until real bank details are verified");
assert.ok(state.investments.every((investment) => investment.projectId === "p1"));
assert.ok(state.investments.every((investment) => !Object.hasOwn(investment, "units")), "investments are tracked by money amount, not units");
assert.equal(state.users.find((u) => u.id === "u1").profile.fatherName, "Baba");
assert.equal(state.users.find((u) => u.id === "u1").profile.motherName, "Ma");
assert.equal(state.users.find((u) => u.id === "u1").profile.nominee.relation, "Father");
assert.ok(Array.isArray(state.legalDocuments) && state.legalDocuments.length === 0, "legal vault begins empty and accepts manual uploads only");
assert.ok(Array.isArray(state.supportMessages));

await assert.rejects(() => api.createInvestmentRequest("u1", "p1", 100000), /not currently accepting/);
await api.updateProgram("u4", {
  title: "Premium Agro Collective Investment Program",
  location: "Selected farming locations across Bangladesh",
  description: "One pooled investment programme funding approved agriculture activities. Actual results depend on operations, sales and costs; no return is guaranteed.",
  bankName: "Sonali Bank", bankAccountName: "Premium Agro Limited", bankAccountNumber: "1234567890123", bankBranch: "Dhaka Main Branch", bankVerified: true,
});
await api.setProgramStatus("u4", "p1", "OPEN");
state = getState();
assert.equal(state.projects[0].status, "OPEN");
assert.equal(state.projects[0].payment.bankVerified, true);
assert.equal(state.projects[0].payment.bankBranch, "Dhaka Main Branch");
await assert.rejects(() => api.updateProgram("u4", {
  title: state.projects[0].title, location: state.projects[0].location, description: state.projects[0].description,
  bankName: "Demo Bank", bankAccountName: "Premium Agro Demo", bankAccountNumber: "DEMO-REPLACE", bankVerified: true,
}), /cannot be marked as verified/);

const amount = 1000000; // BDT 10,000, in integer paisa
await api.createInvestmentRequest("u1", "p1", amount);
state = getState();
let request = state.investmentRequests.find((r) => r.investorId === "u1" && r.amount === amount && r.status === "PENDING_REVIEW");
assert.ok(request, "amount-based investment request is recorded separately");
assert.equal(Object.hasOwn(request, "units"), false);
await api.reviewInvestmentRequest("u4", request.id, true);
state = getState();
request = state.investmentRequests.find((r) => r.id === request.id);
assert.equal(request.status, "APPROVED_AWAITING_PAYMENT", "approval must not activate the investment or move funds");
await assert.rejects(() => api.submitInvestmentPayment("u1", request.id, { channel: "BKASH", trxId: "MOBILE-123456" }), /Only organization bank transfer/);
await api.submitInvestmentPayment("u1", request.id, { channel: "BANK", trxId: "BANK-REF-0001" });
state = getState();
assert.equal(state.investmentRequests.find((r) => r.id === request.id).status, "PAYMENT_PENDING");
await api.reviewInvestmentPayment("u4", request.id, true);
state = getState();
const settledRequest = state.investmentRequests.find((r) => r.id === request.id);
assert.equal(settledRequest.status, "PAID");
const createdInvestment = state.investments.find((i) => i.id === settledRequest.investmentId);
assert.equal(createdInvestment.amount, amount);
assert.equal(Object.hasOwn(createdInvestment, "units"), false);
assert.equal(state.projects[0].raisedAmount >= amount, true);
assert.ok(state.transactions.some((tx) => tx.trxId === "BANK-REF-0001" && tx.status === "COMPLETED"));
await assert.rejects(() => api.submitInvestmentPayment("u1", request.id, { channel: "BANK", trxId: "BANK-REF-0001" }), /only be submitted after/);

// Maker-checker: the administrator who creates a financial entry cannot approve it.
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
await api.createFinancialEntry("u4", {
  projectId: "p1", kind: "REVENUE", category: "PRODUCT_SALES", amount: 250000,
  transactionDate: today(), description: "Wholesale sale test record", reference: "PREMIUM-TEST-SALE-001",
});
let entry = getState().financialEntries.find((item) => item.reference === "PREMIUM-TEST-SALE-001");
assert.equal(entry.status, "PENDING");
await assert.rejects(() => api.reviewFinancialEntry("u4", entry.id, true), /different administrator/);
await api.reviewFinancialEntry("u8", entry.id, true);
assert.equal(getState().financialEntries.find((item) => item.id === entry.id).status, "APPROVED");
assert.equal(summarizeFinancialEntries(getState().financialEntries).revenue >= 250000, true);
await assert.rejects(() => api.createFinancialEntry("u4", {
  projectId: "p1", kind: "REVENUE", category: "PRODUCT_SALES", amount: 250000,
  transactionDate: today(), description: "Duplicate reference", reference: "PREMIUM-TEST-SALE-001",
}), /reference already exists/);

// Capital-weighted profit distribution uses money contributed, never an artificial unit count.
state = getState();
const allocation = previewAllocation(state, { projectId: "p1", gross: 1000000, costs: 100000, commissionPct: 2 });
assert.equal(allocation.net, 880000);
assert.equal(allocation.rows.reduce((sum, row) => sum + row.payout, 0), allocation.net);
assert.ok(allocation.rows.every((row) => typeof row.sharePct === "number"));

// Support conversations, inbox replies, and manually uploaded original legal files.
await api.sendSupportMessage("u1", "Please explain my investment request status.");
state = getState();
assert.equal(state.supportMessages.length, 1);
assert.equal(state.supportMessages[0].threadId, "u1");
await api.replySupportMessage("u4", "u1", "Your request status is available in Investment Requests.");
state = getState();
assert.equal(state.supportMessages.length, 2);
assert.equal(state.supportMessages[1].senderRole, "ADMIN");
await assert.rejects(() => api.replySupportMessage("u1", "u1", "This should fail"), /administrator access/);
await api.uploadLegalDocument("u4", {
  title: "Investment Policy Test", category: "LEGAL", description: "Uploaded original policy file.",
  file: { name: "investment-policy.pdf", type: "application/pdf", dataUrl: "data:application/pdf;base64,JVBERi0x" },
});
state = getState();
assert.equal(state.legalDocuments[0].title, "Investment Policy Test");
assert.equal(state.legalDocuments[0].dataUrl, "data:application/pdf;base64,JVBERi0x");
const savedLegalDocument = getState().legalDocuments.find((item) => item.title === "Investment Policy Test");
assert.ok(savedLegalDocument);
await api.deleteLegalDocument("u4", savedLegalDocument.id);
assert.equal(getState().legalDocuments.length, 0);

const validCloseout = {
  id: "closeout-1", projectId: "p1", grossSales: 100000, operatingCosts: 10000, commissionPct: 2,
  platformCommission: 2000, netProceeds: 88000, investedCapital: 80000, realizedProfitLoss: 8000,
  investorCount: 1, positionCount: 1,
  payouts: [{ investorId: "u1", investmentId: "i1", investedCapital: 80000, payout: 88000, realizedProfitLoss: 8000 }],
};
assert.equal(reconcileCloseout(validCloseout).status, "RECONCILED");
assert.match(csvCell("=HYPERLINK(\"https://example.invalid\")"), /^"'=/, "CSV export neutralizes spreadsheet formula injection");

console.log("Logic checks passed: single pooled programme, bank-only staged payment, maker-checker financial review, capital-weighted allocation, support chat and manual legal documents.");
