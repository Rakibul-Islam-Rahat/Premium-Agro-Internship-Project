import { env } from "../config/env.js";
import { unavailable } from "../utils/errors.js";

const BRAND = "Premium Agro";
const CODE_TTL_MINUTES = 10;

/**
 * Deliver a one-time authentication/reset code via Resend's HTTPS API.
 * API credentials remain server-side. Node 20+ provides global fetch.
 */
export async function sendAuthCodeEmail({ to, code, purpose }) {
  if (!env.emailConfigured) {
    throw unavailable("Email verification is not configured. Add RESEND_API_KEY and AUTH_EMAIL_FROM to backend/.env.");
  }

  const isPasswordReset = purpose === "PASSWORD_RESET";
  const subject = isPasswordReset ? "Premium Agro password reset code" : "Your Premium Agro verification code";
  const action = isPasswordReset ? "reset your password" : "complete your sign-in";
  const text = [
    `Your Premium Agro code is: ${code}`,
    "",
    `Enter this six-digit code to ${action}.`,
    `This code expires in ${CODE_TTL_MINUTES} minutes and can be used only once.`,
    "",
    "If you did not request this code, you can ignore this email. Never share this code with anyone.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f5;font-family:Arial,Helvetica,sans-serif;color:#18352b;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dce8e0;border-radius:16px;overflow:hidden"><div style="padding:24px 28px;background:#0f5132;color:#fff"><p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase">${BRAND}</p><h1 style="margin:12px 0 0;font-size:24px">Verification code</h1></div><div style="padding:28px"><p style="font-size:16px;line-height:1.6">Use this code to ${action}:</p><div style="margin:24px 0;padding:18px;text-align:center;background:#f1f8f3;border:1px solid #d8e9dd;border-radius:12px;font-size:34px;font-weight:700;letter-spacing:8px;color:#0f5132">${code}</div><p style="font-size:14px;line-height:1.6;color:#52665b">This code expires in ${CODE_TTL_MINUTES} minutes and can be used once.</p><p style="font-size:13px;line-height:1.6;color:#6c7b73">If you did not request this code, ignore this email. Never share it with anyone, including anyone claiming to work for Premium Agro.</p></div></div></body></html>`;

  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.authEmailFrom,
        to: [String(to).trim().toLowerCase()],
        subject,
        text,
        html,
        ...(env.authEmailReplyTo ? { reply_to: env.authEmailReplyTo } : {}),
      }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    console.error("[AUTH EMAIL] Provider request failed:", error?.name || "NetworkError");
    throw unavailable("Premium Agro could not send the verification email. Check the email provider configuration and try again.");
  }

  if (!response.ok) {
    // Do not log credentials, message contents or verification codes.
    const detail = await response.json().catch(() => ({}));
    console.error("[AUTH EMAIL] Provider rejected the email:", {
      status: response.status,
      code: typeof detail?.name === "string" ? detail.name.slice(0, 80) : "provider_error",
    });
    throw unavailable("Premium Agro could not send the verification email. Check the sender domain and email provider logs.");
  }

  return response.json().catch(() => ({}));
}
