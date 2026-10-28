// Presentational primitives shared by all printable documents. Always light-themed: documents are paper.
export const Sheet = ({ title, subtitle, meta, children }) => (
  <div className="bg-white p-8 text-[13px] leading-relaxed text-black" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
    <header className="mb-6 flex items-start justify-between border-b-2 border-emerald-800 pb-4">
      <div><p className="text-2xl font-bold text-emerald-800">Premium Agro</p><p className="text-xs text-gray-500">Collective Agriculture Investment Programme</p></div>
      <div className="text-right"><p className="text-base font-semibold">{title}</p>{subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}{meta}</div>
    </header>
    {children}
  </div>
);
export const Section = ({ title, children }) => (
  <section className="mb-5"><h3 className="mb-2 border-b border-gray-300 pb-1 text-sm font-semibold text-emerald-800">{title}</h3>{children}</section>
);
export const Rows = ({ rows }) => (
  <table className="w-full border-collapse"><tbody>
    {rows.map(([k, v]) => (
      <tr key={k} className="border-b border-gray-200 align-top"><th className="w-2/5 py-1.5 pr-3 text-left font-medium text-gray-600">{k}</th><td className="py-1.5">{v || "—"}</td></tr>
    ))}
  </tbody></table>
);
export const Seal = ({ hash, signedAt }) => (
  <footer className="mt-8 flex items-end justify-between gap-6 border-t border-gray-300 pt-4 text-xs">
    <div><p className="font-semibold">Digitally signed</p><p className="text-gray-500">{signedAt}</p></div>
    <div className="max-w-[60%] break-all text-right"><p className="font-semibold">SHA-256 Seal</p><code className="text-[10px] text-gray-600">{hash}</code></div>
  </footer>
);
