import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/context/LanguageContext";

export default function StatCard({ label, value, hint, icon: Icon }) {
  const { t } = useLanguage();
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{t(label)}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{t(hint)}</p>}
        </div>
        {Icon && <span className="rounded-lg bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></span>}
      </CardContent>
    </Card>
  );
}
