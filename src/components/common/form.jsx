import { useLanguage } from "@/context/LanguageContext";
import { forwardRef } from "react";

export function Labeled({ label, hint, children }) {
  const { t } = useLanguage();
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{t(label)}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{t(hint)}</span>}
    </label>
  );
}
const base = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const TextInput = forwardRef((p, ref) => {
  const { t } = useLanguage();
  return <input ref={ref} {...p} placeholder={p.placeholder ? t(p.placeholder) : undefined} className={`${base} ${p.className ?? ""}`} />;
});
TextInput.displayName = "TextInput";
export const SelectInput = ({ options, ...p }) => {
  const { t } = useLanguage();
  return <select {...p} className={base}>
    {options.map((o) => (typeof o === "string" ? <option key={o} value={o}>{t(o)}</option> : <option key={o.value} value={o.value}>{t(o.label)}</option>))}
  </select>;
};
export const TextArea = (p) => { const { t } = useLanguage(); return <textarea rows={3} {...p} placeholder={p.placeholder ? t(p.placeholder) : undefined} className={`${base} h-auto`} />; };
export const ProgressBar = ({ value }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, value)}%` }} />
  </div>
);
