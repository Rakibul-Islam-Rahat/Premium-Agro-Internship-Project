// Money is stored as integer minor units (paisa) and formatted with English numerals.
export const toMinor = (taka) => Math.round(Number(taka) * 100);
const nf = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 });
const moneyNf = new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 });
export const bn = (n) => nf.format(n); // Format non-currency numbers with English digits.
export const formatBDT = (minor) => `${minor < 0 ? "-" : ""}৳${moneyNf.format(Math.abs(minor) / 100)}`;
export const pct = (n) => `${nf.format(n)}%`;
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);
