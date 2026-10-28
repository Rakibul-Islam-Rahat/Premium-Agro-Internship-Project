import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import Field from "./Field";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { useAuth } from "@/features/auth/AuthContext";
import { ROLE_HOME } from "@/config/roles";
import { env } from "@/config/env";
import { ROLE } from "@/config/labels";
import { MOCK_USERS, MOCK_VERIFICATION_CODE } from "@/services/mock/users";
import { authService } from "@/services/auth.service";
import { useLanguage } from "@/context/LanguageContext";

export default function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, verify } = useAuth();
  const { t } = useLanguage();
  const [challenge, setChallenge] = useState(null);
  const [view, setView] = useState("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, getValues, setError, clearErrors, formState: { errors, isSubmitting } } = useForm({ defaultValues: { email: "", password: "", code: "", newPassword: "" } });
  const goHome = (user) => navigate(location.state?.from?.pathname ?? ROLE_HOME[user.role], { replace: true });
  const serverError = errors?.root?.server?.message;
  const inputClass = (err) => `auth-input ${err ? "border-red-500" : "border-slate-200"}`;
  const showView = (next) => { clearErrors(); setView(next); };

  const onCredentials = async (data) => {
    try {
      const res = await login(data);
      if (res.requiresVerification) setChallenge(res);
      else goHome(res.user);
    } catch (e) { setError("root.server", { message: e.message }); }
  };
  const onCode = async ({ code }) => {
    try { goHome(await verify({ challengeId: challenge.challengeId, code })); }
    catch (e) { setError("root.server", { message: e.message }); }
  };
  const onRequestReset = async ({ email }) => {
    try {
      const result = await authService.requestPasswordReset({ email });
      setResetEmail(email.trim().toLowerCase());
      setResetSent(true);
      showView("reset");
      if (env.useMock && result.demoCode) setError("root.demo", { message: `Demo reset code: ${result.demoCode}` });
    } catch (e) { setError("root.server", { message: e.message }); }
  };
  const onResetPassword = async ({ code, newPassword }) => {
    try {
      await authService.resetPassword({ email: resetEmail, code, password: newPassword });
      showView("login"); setChallenge(null); setResetSent(false);
      setError("root.success", { message: "Password updated. Sign in with your new password." });
    } catch (e) { setError("root.server", { message: e.message }); }
  };

  return (
    <Card className="auth-card w-full overflow-hidden rounded-2xl border-white/70 shadow-2xl shadow-emerald-950/10">
      <CardContent className="p-6 sm:p-8">
        {view === "login" && !challenge && <>
          <div className="mb-6">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t("Welcome back")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("Sign in to continue to your Premium Agro account.")}</p>
          </div>
          <form className="space-y-4" onSubmit={handleSubmit(onCredentials)} noValidate>
            <Field label="Email address" error={errors.email}>
              <input {...register("email", { required: "Enter your email address", pattern: { value: /^\S+@\S+\.\S+$/, message: "Enter a valid email address" } })} className={inputClass(errors.email)} placeholder={t("you@example.com")} type="email" id="email" autoComplete="username" />
            </Field>
            <Field label="Password" error={errors.password}>
              <div className="relative">
                <input {...register("password", { required: "Enter your password", minLength: { value: 8, message: "At least 8 characters" } })} className={`${inputClass(errors.password)} pr-11`} placeholder={t("Enter your password")} type={showPassword ? "text" : "password"} id="password" autoComplete="current-password" />
                <button type="button" onClick={() => setShowPassword((x) => !x)} className="absolute inset-y-0 right-3 text-slate-400 hover:text-slate-700" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </Field>
            <div className="flex justify-end"><button type="button" className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" onClick={() => { setResetEmail(getValues("email") || ""); showView("forgot"); }}>{t("Forgot password?")}</button></div>
            {serverError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>}
            {errors?.root?.success?.message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{errors.root.success.message}</p>}
            <Button className="h-11 w-full rounded-lg text-base" type="submit" disabled={isSubmitting}>{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Sign in securely</Button>
          </form>
          {env.useMock && <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{t("Demo access")}</p>
            <div className="grid gap-1.5 text-xs text-slate-500 sm:grid-cols-2">{MOCK_USERS.map((u) => <div key={u.id} className="rounded-md bg-slate-50 px-2.5 py-2"><span className="block font-semibold text-slate-700">{ROLE[u.role]}</span>{u.email}<br /><span className="font-mono">{u.password}</span></div>)}</div>
            <p className="mt-2 text-xs text-slate-400">{t("Verification code for demo roles:")} {MOCK_VERIFICATION_CODE}</p>
          </div>}
        </>}

        {view === "login" && challenge && <>
          <button className="mb-5 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900" onClick={() => setChallenge(null)} type="button"><ArrowLeft className="h-4 w-4" />{t("Back to sign in")}</button>
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t("Verify your identity")}</h2>
          <p className="mt-1 mb-5 text-sm text-slate-500">{challenge.method === "EMAIL" ? t("Enter the six-digit verification code sent to your registered email address.") : challenge.method === "OTP" ? t("Enter the one-time code sent to your registered phone.") : t("Enter the six-digit authenticator code for administrator access.")}</p>
          <form className="space-y-4" onSubmit={handleSubmit(onCode)} noValidate>
            <Field label="Verification code" error={errors.code}><input {...register("code", { required: "Enter the verification code", pattern: { value: /^\d{6}$/, message: "Enter all 6 digits" } })} className={inputClass(errors.code)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder={t("000000")} id="code" /></Field>
            {serverError && <p role="alert" className="text-sm text-red-600">{serverError}</p>}
            <Button className="h-11 w-full rounded-lg text-base" type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify and continue</Button>
          </form>
        </>}

        {view === "forgot" && <>
          <button className="mb-5 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900" onClick={() => showView("login")} type="button"><ArrowLeft className="h-4 w-4" />{t("Back to sign in")}</button>
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><KeyRound className="h-5 w-5" /></div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t("Reset your password")}</h2>
          <p className="mb-5 mt-1 text-sm text-slate-500">{t("Enter the email linked to your account. A reset code will be sent using the configured authentication service.")}</p>
          <form className="space-y-4" onSubmit={handleSubmit(onRequestReset)} noValidate>
            <Field label="Email address" error={errors.email}><input {...register("email", { required: "Enter your email address", pattern: { value: /^\S+@\S+\.\S+$/, message: "Enter a valid email address" } })} defaultValue={resetEmail} className={inputClass(errors.email)} placeholder={t("you@example.com")} type="email" id="reset-email" autoComplete="email" /></Field>
            {serverError && <p role="alert" className="text-sm text-red-600">{serverError}</p>}
            <Button className="h-11 w-full rounded-lg text-base" type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send reset code</Button>
          </form>
        </>}

        {view === "reset" && <>
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">{resetSent ? <CheckCircle2 className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}</div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{t("Create a new password")}</h2>
          <p className="mb-5 mt-1 text-sm text-slate-500">{t("Enter the reset code and a new password for")} <strong>{resetEmail}</strong>.</p>
          {resetSent && !env.useMock && <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t("If the account exists, a reset code has been sent to the registered email address. Check your inbox and spam folder.")}</p>}
          {env.useMock && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("Local demo mode has no email service. Use demo reset code")} <strong>{MOCK_VERIFICATION_CODE}</strong>. {t("Production mode must send a single-use code by email.")}</p>}
          {errors?.root?.demo?.message && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{errors.root.demo.message}</p>}
          <form className="space-y-4" onSubmit={handleSubmit(onResetPassword)} noValidate>
            <Field label="Reset code" error={errors.code}><input {...register("code", { required: "Enter the reset code", pattern: { value: /^\d{6}$/, message: "Enter all 6 digits" } })} className={inputClass(errors.code)} placeholder={t("000000")} inputMode="numeric" maxLength={6} /></Field>
            <Field label="New password" error={errors.newPassword}><input {...register("newPassword", { required: "Enter a new password", minLength: { value: 8, message: "Use at least 8 characters" } })} className={inputClass(errors.newPassword)} type="password" autoComplete="new-password" placeholder={t("At least 8 characters")} /></Field>
            {serverError && <p role="alert" className="text-sm text-red-600">{serverError}</p>}
            <Button className="h-11 w-full rounded-lg text-base" type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update password</Button>
          </form>
        </>}
      </CardContent>
    </Card>
  );
}
