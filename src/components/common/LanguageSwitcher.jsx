import { useLanguage } from "@/context/LanguageContext";
import { Button } from "@/components/ui/button";

export default function LanguageSwitcher({ className = "" }) {
  const { language, changeLanguage, t } = useLanguage();
  return <Button
    type="button"
    variant="outline"
    size="sm"
    className={className}
    onClick={() => changeLanguage(language === "en" ? "bn" : "en")}
    aria-label={t("Change language")}
    aria-pressed={language === "bn"}
  >{language === "en" ? "বাংলা" : "English"}</Button>;
}
