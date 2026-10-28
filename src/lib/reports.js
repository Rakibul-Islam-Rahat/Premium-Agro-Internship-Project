import { sum } from "./money.js";

const isValidDate = (value) => value != null && value !== "" && !Number.isNaN(new Date(value).getTime());
const localDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateKey = (value) => {
  // Preserve an actual date-only value instead of shifting it through UTC and a local timezone.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00`);
    return isValidDate(date) && localDateKey(date) === value ? value : "";
  }
  return isValidDate(value) ? localDateKey(new Date(value)) : "";
};
const monthKey = (value) => dateKey(value).slice(0, 7);
const moneyAmount = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const monthLabel = (key) => new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(`${key}-01T12:00:00`));

export function filterReportTransactions(transactions, filters = {}) {
  const { start = "", end = "", type = "ALL", status = "ALL", projectId = "ALL", userId = "ALL" } = filters;
  return transactions.filter((tx) => {
    const date = dateKey(tx.date);
    if (start && (!date || date < start)) return false;
    if (end && (!date || date > end)) return false;
    if (type !== "ALL" && tx.type !== type) return false;
    if (status !== "ALL" && tx.status !== status) return false;
    if (projectId !== "ALL" && tx.ref !== projectId) return false;
    if (userId !== "ALL" && tx.userId !== userId) return false;
    return true;
  }).sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
  });
}

/** Filter project financial records by transaction date, project, and review state. */
export function filterFinancialEntries(entries, filters = {}) {
  const { start = "", end = "", projectId = "ALL", status = "ALL" } = filters;
  return (entries ?? []).filter((entry) => {
    const date = dateKey(entry.transactionDate || entry.createdAt);
    if (start && (!date || date < start)) return false;
    if (end && (!date || date > end)) return false;
    if (projectId !== "ALL" && entry.projectId !== projectId) return false;
    if (status !== "ALL" && entry.status !== status) return false;
    return true;
  }).sort((a, b) => {
    const da = new Date(a.transactionDate || a.createdAt).getTime();
    const db = new Date(b.transactionDate || b.createdAt).getTime();
    return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
  });
}

/** Approved operational activity only. These totals are not added to programme settlement totals. */
export function summarizeFinancialEntries(entries) {
  const rows = entries ?? [];
  const approved = rows.filter((entry) => entry.status === "APPROVED");
  const sumKind = (kind) => sum(approved.filter((entry) => entry.kind === kind), (entry) => moneyAmount(entry.amount));
  const revenue = sumKind("REVENUE");
  const expenses = sumKind("EXPENSE");
  return {
    approvedCount: approved.length,
    pendingCount: rows.filter((entry) => entry.status === "PENDING").length,
    rejectedCount: rows.filter((entry) => entry.status === "REJECTED").length,
    revenue,
    expenses,
    operatingResult: revenue - expenses,
  };
}

export function buildMonthlyFinancialEntryReport(entries, filters = {}) {
  const filtered = filterFinancialEntries(entries, filters).filter((entry) => entry.status === "APPROVED");
  const months = new Map();
  for (const entry of filtered) {
    const key = monthKey(entry.transactionDate || entry.createdAt);
    if (!key) continue;
    const row = months.get(key) ?? { key, month: monthLabel(key), revenue: 0, expenses: 0, operatingResult: 0, entries: 0, projectIds: new Set() };
    if (entry.kind === "REVENUE") row.revenue += moneyAmount(entry.amount);
    if (entry.kind === "EXPENSE") row.expenses += moneyAmount(entry.amount);
    row.entries += 1;
    row.projectIds.add(entry.projectId);
    row.operatingResult = row.revenue - row.expenses;
    months.set(key, row);
  }
  return [...months.values()].map((row) => ({ ...row, projects: row.projectIds.size, projectIds: [...row.projectIds] })).sort((a, b) => a.key.localeCompare(b.key));
}

export function summarizeReportTransactions(transactions) {
  const completed = transactions.filter((tx) => tx.status === "COMPLETED");
  const byType = (type) => completed.filter((tx) => tx.type === type);
  return {
    completedCount: completed.length,
    pendingCount: transactions.filter((tx) => tx.status === "PENDING").length,
    rejectedCount: transactions.filter((tx) => tx.status === "REJECTED").length,
    // The transaction sign is preserved where it represents a reversal or adjustment.
    deposits: sum(byType("DEPOSIT"), (tx) => moneyAmount(tx.amount)),
    capitalInvested: sum(byType("INVEST"), (tx) => -moneyAmount(tx.amount)),
    projectPayouts: sum(byType("DIVIDEND"), (tx) => moneyAmount(tx.amount)),
    withdrawalsPaid: sum(byType("WITHDRAW"), (tx) => -moneyAmount(tx.amount)),
    netLedgerMovement: sum(completed, (tx) => moneyAmount(tx.amount)),
  };
}

export function buildMonthlyReport(transactions) {
  const months = new Map();
  for (const tx of transactions) {
    if (tx.status !== "COMPLETED") continue;
    const key = monthKey(tx.date);
    if (!key) continue;
    const row = months.get(key) ?? { key, month: monthLabel(key), deposits: 0, invested: 0, payouts: 0, withdrawals: 0, entries: 0 };
    if (tx.type === "DEPOSIT") row.deposits += moneyAmount(tx.amount);
    if (tx.type === "INVEST") row.invested += -moneyAmount(tx.amount);
    if (tx.type === "DIVIDEND") row.payouts += moneyAmount(tx.amount);
    if (tx.type === "WITHDRAW") row.withdrawals += -moneyAmount(tx.amount);
    row.entries += 1;
    months.set(key, row);
  }
  return [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Reconcile a stored close-out snapshot before it is trusted for management reporting. */
export function reconcileCloseout(item) {
  const reasons = [];
  const required = ["grossSales", "operatingCosts", "platformCommission", "netProceeds", "investedCapital", "realizedProfitLoss", "investorCount"];
  for (const field of required) {
    const value = item?.[field];
    if (value == null || value === "" || !Number.isSafeInteger(Number(value))) reasons.push(`${field} is missing or not a whole valid amount`);
  }
  const gross = moneyAmount(item?.grossSales);
  const costs = moneyAmount(item?.operatingCosts);
  const commission = moneyAmount(item?.platformCommission);
  const net = moneyAmount(item?.netProceeds);
  const capital = moneyAmount(item?.investedCapital);
  if (gross < 0 || costs < 0 || commission < 0 || capital < 0) reasons.push("A monetary input is negative");
  if (Number(item?.investorCount) < 0) reasons.push("Investor count cannot be negative");
  if (net < 0) reasons.push("Net proceeds cannot be negative");
  const commissionPct = Number(item?.commissionPct);
  if (item?.commissionPct == null || item.commissionPct === "" || !Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 100) reasons.push("Commission rate is missing or outside the allowed 0–100% range");
  else if (Math.round(gross * (commissionPct / 100)) !== commission) reasons.push("Recorded commission does not match the recorded rate and gross sales");
  if (net !== gross - costs - commission) reasons.push("Net proceeds do not equal sales less costs and commission");
  if (moneyAmount(item?.realizedProfitLoss) !== net - capital) reasons.push("Realized gain/loss does not reconcile to net proceeds and invested capital");

  if (!Array.isArray(item?.payouts)) {
    return { status: reasons.length ? "MISMATCH" : "DETAILS_UNAVAILABLE", reasons: [...reasons, "Per-investor payout details were not stored for this historical close-out"] };
  }
  const payoutTotal = sum(item.payouts, (row) => moneyAmount(row?.payout));
  const capitalTotal = sum(item.payouts, (row) => moneyAmount(row?.investedCapital));
  const profitTotal = sum(item.payouts, (row) => moneyAmount(row?.realizedProfitLoss));
  const payoutInvestorIds = new Set();
  const investmentIds = new Set();
  for (const row of item.payouts) {
    if (!row?.investorId || !row?.investmentId) reasons.push("A payout row is missing its investor or investment reference");
    if (row?.investmentId && investmentIds.has(row.investmentId)) reasons.push("A close-out contains a duplicate investment payout row");
    if (row?.investmentId) investmentIds.add(row.investmentId);
    if (row?.investorId) payoutInvestorIds.add(row.investorId);
    for (const field of ["payout", "investedCapital", "realizedProfitLoss"]) {
      if (row?.[field] == null || row[field] === "" || !Number.isSafeInteger(Number(row[field]))) reasons.push(`An investor payout row has an invalid ${field} amount`);
    }
    if (moneyAmount(row?.realizedProfitLoss) !== moneyAmount(row?.payout) - moneyAmount(row?.investedCapital)) reasons.push("An investor gain/loss does not reconcile to their payout and invested capital");
    if (moneyAmount(row?.payout) < 0 || moneyAmount(row?.investedCapital) < 0) reasons.push("An investor payout or capital amount is negative");
  }
  if (payoutTotal !== net) reasons.push("Per-investor payouts do not sum to net proceeds");
  if (capitalTotal !== capital) reasons.push("Per-investor capital does not sum to invested capital");
  if (profitTotal !== moneyAmount(item?.realizedProfitLoss)) reasons.push("Per-investor gain/loss does not reconcile to project gain/loss");
  // Older app versions stored investorCount as the number of investment positions.
  // New snapshots carry positionCount separately and investorCount is the distinct-person count.
  const hasPositionCount = item.positionCount != null;
  const expectedPositionCount = hasPositionCount ? Number(item.positionCount) : Number(item.investorCount);
  if (!Number.isSafeInteger(expectedPositionCount) || item.payouts.length !== expectedPositionCount) reasons.push("Payout detail count differs from the recorded investment-position count");
  if (hasPositionCount && payoutInvestorIds.size !== Number(item.investorCount)) reasons.push("Distinct investor count differs from the stored payout details");
  return { status: reasons.length ? "MISMATCH" : "RECONCILED", reasons };
}

export function buildMonthlyCloseoutReport(allocations) {
  const months = new Map();
  const snapshots = allocations ?? [];
  const projectSnapshotCounts = new Map();
  for (const item of snapshots) if (item.projectId) projectSnapshotCounts.set(item.projectId, (projectSnapshotCounts.get(item.projectId) ?? 0) + 1);
  for (const item of snapshots) {
    // Duplicate close-outs would double-count a project even if each snapshot looks internally valid.
    if (item.projectId && projectSnapshotCounts.get(item.projectId) > 1) continue;
    // Do not silently include a financial snapshot whose arithmetic fails reconciliation.
    if (item.reconciliation?.status === "MISMATCH" || reconcileCloseout(item).status === "MISMATCH") continue;
    const key = monthKey(item.createdAt);
    if (!key) continue;
    const row = months.get(key) ?? { key, month: monthLabel(key), grossSales: 0, operatingCosts: 0, platformCommission: 0, netProceeds: 0, investedCapital: 0, realizedProfitLoss: 0, projects: 0, investors: 0, detailUnavailable: 0 };
    row.grossSales += moneyAmount(item.grossSales);
    row.operatingCosts += moneyAmount(item.operatingCosts);
    row.platformCommission += moneyAmount(item.platformCommission);
    row.netProceeds += moneyAmount(item.netProceeds);
    row.investedCapital += moneyAmount(item.investedCapital);
    row.realizedProfitLoss += moneyAmount(item.realizedProfitLoss);
    row.projects += 1;
    row.investors += moneyAmount(item.investorCount);
    if (reconcileCloseout(item).status === "DETAILS_UNAVAILABLE") row.detailUnavailable += 1;
    months.set(key, row);
  }
  return [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function buildProjectPerformance({ investments = [], transactions = [], projects = [], investorId = null, projectId = "ALL" } = {}) {
  const payoutByProject = new Map();
  const payoutByProjectInvestor = new Map();
  const payoutProjectsByInvestor = new Set();
  for (const tx of transactions) {
    if (tx.status !== "COMPLETED" || tx.type !== "DIVIDEND" || !tx.ref || !tx.userId) continue;
    if (investorId && tx.userId !== investorId) continue;
    const investorKey = `${tx.ref}::${tx.userId}`;
    payoutByProject.set(tx.ref, (payoutByProject.get(tx.ref) ?? 0) + moneyAmount(tx.amount));
    payoutByProjectInvestor.set(investorKey, (payoutByProjectInvestor.get(investorKey) ?? 0) + moneyAmount(tx.amount));
    payoutProjectsByInvestor.add(investorKey);
  }

  const positions = investments.filter((inv) =>
    (!investorId || inv.investorId === investorId)
    && (projectId === "ALL" || inv.projectId === projectId)
    && ["ACTIVE", "COMPLETED"].includes(inv.status),
  );
  const grouped = new Map();
  for (const inv of positions) {
    const row = grouped.get(inv.projectId) ?? {
      projectId: inv.projectId, activeCapital: 0, completedCapital: 0,
      activePositions: 0, completedPositions: 0,
      completedInvestorIds: new Set(),
    };
    if (inv.status === "ACTIVE") { row.activeCapital += moneyAmount(inv.amount); row.activePositions += 1; }
    if (inv.status === "COMPLETED") {
      row.completedCapital += moneyAmount(inv.amount);
      row.completedPositions += 1;
      row.completedInvestorIds.add(inv.investorId);
    }
    grouped.set(inv.projectId, row);
  }

  return [...grouped.values()].map((row) => {
    const project = projects.find((p) => p.id === row.projectId);
    const hasClosedPosition = row.completedPositions > 0;
    const payoutCredited = hasClosedPosition
      ? sum([...row.completedInvestorIds], (id) => payoutByProjectInvestor.get(`${row.projectId}::${id}`) ?? 0)
      : (payoutByProject.get(row.projectId) ?? 0);
    const everyCompletedInvestorHasPayout = [...row.completedInvestorIds].every((id) => payoutProjectsByInvestor.has(`${row.projectId}::${id}`));
    const mixedPositionStates = row.activePositions > 0 && row.completedPositions > 0;
    const completeSettlement = hasClosedPosition && everyCompletedInvestorHasPayout && !mixedPositionStates;
    const settlementStatus = !hasClosedPosition ? "ACTIVE" : completeSettlement ? "SETTLED" : "INCOMPLETE";
    const realizedProfitLoss = completeSettlement ? payoutCredited - row.completedCapital : null;
    return {
      ...row,
      completedInvestorIds: undefined,
      project,
      title: project?.title ?? `Project ${row.projectId}`,
      payoutCredited,
      settlementStatus,
      realizedProfitLoss,
      realizedReturnPct: completeSettlement && row.completedCapital > 0 ? (realizedProfitLoss / row.completedCapital) * 100 : null,
    };
  }).sort((a, b) => (b.activeCapital + b.completedCapital) - (a.activeCapital + a.completedCapital));
}

export function csvCell(value) {
  let stringValue = value == null ? "" : String(value);
  // Guard against spreadsheet formula injection from user-controlled names/references.
  const numericLiteral = /^-?\d+(?:\.\d+)?$/.test(stringValue);
  if (/^[\s\u0000-\u001f]*[=+@]/.test(stringValue) || (!numericLiteral && /^[\s]*-/.test(stringValue))) stringValue = `'${stringValue}`;
  return `"${stringValue.replace(/"/g, '""')}"`;
}

export function reportCsv(rows) {
  const headers = ["Transaction ID", "Date", "Account", "Category", "Project", "Amount BDT", "Status", "Channel", "Reference"];
  const body = rows.map((row) => [row.id, row.date, row.accountName ?? "", row.category ?? row.type, row.projectTitle ?? "", (moneyAmount(row.amount) / 100).toFixed(2), row.status, row.channel ?? "", row.trxId ?? ""]);
  return [headers, ...body].map((line) => line.map(csvCell).join(",")).join("\r\n");
}
