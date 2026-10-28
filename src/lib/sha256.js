// Small synchronous SHA-256 (used for contract integrity hashes in mock mode and PDFs).
const primes = [];
for (let n = 2; primes.length < 64; n++) if (primes.every((p) => n % p)) primes.push(n);
const frac = (x) => Math.floor((x - Math.floor(x)) * 4294967296);
const K = primes.map((p) => frac(Math.cbrt(p)));
const H0 = primes.slice(0, 8).map((p) => frac(Math.sqrt(p)));
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

export function sha256(str) {
  const m = Array.from(new TextEncoder().encode(str));
  const bits = m.length * 8;
  m.push(0x80);
  while (m.length % 64 !== 56) m.push(0);
  const hi = Math.floor(bits / 4294967296), lo = bits >>> 0;
  m.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  let h = [...H0];
  for (let i = 0; i < m.length; i += 64) {
    const w = new Array(64);
    for (let t = 0; t < 16; t++) w[t] = (m[i + 4 * t] << 24) | (m[i + 4 * t + 1] << 16) | (m[i + 4 * t + 2] << 8) | m[i + 4 * t + 3];
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let t = 0; t < 64; t++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h = h.map((v, j) => (v + [a, b, c, d, e, f, g, hh][j]) | 0);
  }
  return h.map((v) => (v >>> 0).toString(16).padStart(8, "0")).join("");
}
export const contractHash = (i) => sha256(`${i.id}|${i.investorId}|${i.projectId}|${i.amount}|${i.createdAt}`);
