import nodemailer from "nodemailer";

type MailOptions = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function getMailConfig() {
  const host = process.env.EMAIL_SERVER_HOST;
  const port = Number(process.env.EMAIL_SERVER_PORT ?? "587");
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  const from = process.env.EMAIL_FROM;

  if (!host || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass
    },
    from
  };
}

export function isEmailConfigured() {
  return getMailConfig() !== null;
}

export async function sendMail({ to, subject, text, html }: MailOptions) {
  const config = getMailConfig();

  if (!config) {
    throw new Error("Email delivery is not configured.");
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth
  });

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text,
    html
  });
}
