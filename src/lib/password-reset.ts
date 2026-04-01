import { createHash, randomInt } from "crypto";

import { absoluteUrl } from "@/lib/site";

const PASSWORD_RESET_CODE_LENGTH = 6;
const PASSWORD_RESET_TTL_MINUTES = 15;

export function generatePasswordResetCode() {
  const min = 10 ** (PASSWORD_RESET_CODE_LENGTH - 1);
  const max = 10 ** PASSWORD_RESET_CODE_LENGTH;

  return String(randomInt(min, max));
}

export function hashPasswordResetCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function getPasswordResetExpiry() {
  return new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
}

export function getPasswordResetEmailContent(code: string) {
  const supportUrl = absoluteUrl("/forgot-password");

  return {
    subject: "Your ERA Academy password reset code",
    text: `Use this code to reset your ERA Academy password: ${code}. The code expires in ${PASSWORD_RESET_TTL_MINUTES} minutes. Reset page: ${supportUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
        <h2 style="margin-bottom: 12px;">Reset your ERA Academy password</h2>
        <p style="margin: 0 0 12px;">Use the verification code below to create a new password.</p>
        <p style="margin: 0 0 16px; font-size: 32px; font-weight: 700; letter-spacing: 0.35em;">${code}</p>
        <p style="margin: 0 0 12px;">This code expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.</p>
        <p style="margin: 0;">Open <a href="${supportUrl}">${supportUrl}</a> to finish resetting your password.</p>
      </div>
    `
  };
}
