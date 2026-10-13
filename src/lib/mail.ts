import nodemailer from "nodemailer";
import { env } from "./env";

/** Email recovery is enabled only when APP_URL, SMTP_URL and MAIL_FROM are all configured. */
export const mailEnabled = () => {
  const e = env();
  return !!(e.APP_URL && e.SMTP_URL && e.MAIL_FROM);
};

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const e = env();
  if (!e.SMTP_URL || !e.MAIL_FROM) throw new Error("Mail not configured");
  await nodemailer.createTransport(e.SMTP_URL).sendMail({ from: e.MAIL_FROM, to, subject, text });
}
