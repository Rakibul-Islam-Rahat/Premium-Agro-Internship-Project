import { sum } from "../lib/money.js";
// Wallet balances are derived from the ledger, never stored.
export const balanceOf = (txs, uid) => sum(txs.filter((t) => t.userId === uid && t.status === "COMPLETED"), (t) => t.amount);
// Available = balance minus funds reserved by pending withdrawals.
export const availableOf = (txs, uid) =>
  balanceOf(txs, uid) + sum(txs.filter((t) => t.userId === uid && t.status === "PENDING" && t.amount < 0), (t) => t.amount);
export const raisedOf = (p) => Number(p?.raisedAmount) || 0;
