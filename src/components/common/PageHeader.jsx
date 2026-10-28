import { useLanguage } from "@/context/LanguageContext";
export default function PageHeader({ title, description, actions }) {
  const { t } = useLanguage();
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t(title)}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{t(description)}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
