import { Inbox } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
export default function EmptyState({ title, description }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
      <Inbox className="mb-3 h-8 w-8 text-muted-foreground" />
      <p className="font-medium">{t(title)}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{t(description)}</p>}
    </div>
  );
}
