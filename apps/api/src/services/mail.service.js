import nodemailer from "nodemailer";
import { createLogger } from "@stdyapp/core";

import { isDevAuthEnabled } from "../config/auth.js";
import {
  GMAIL_SMTP_HOST,
  GMAIL_SMTP_PORT,
  RESET_CODE_TTL_MIN,
  getMailConfig,
} from "../config/mail.js";

/**
 * Outgoing email, through Gmail's SMTP server.
 *
 * The only module that knows how mail leaves the API, so a move to a mail
 * provider later touches this file and nothing that calls it.
 */

const log = createLogger("mail");

/**
 * One transport per configuration, built on first use. Cached so each email
 * does not open a fresh TLS connection and log in again; keyed on the config so
 * a changed .env under `node --watch` is picked up rather than ignored.
 */
let transport;
let transportKey;

const getTransport = (config) => {
  const key = `${config.user}:${config.pass}`;
  if (!transport || transportKey !== key) {
    transport = nodemailer.createTransport({
      host: GMAIL_SMTP_HOST,
      port: GMAIL_SMTP_PORT,
      secure: true,
      auth: { user: config.user, pass: config.pass },
    });
    transportKey = key;
  }
  return transport;
};

/**
 * Whether a reset email can be delivered at all - by Gmail, or in development
 * by the log line below.
 *
 * @returns {boolean}
 */
export const canSendMail = () => getMailConfig() !== null || isDevAuthEnabled();

/**
 * Emails a password-reset code.
 *
 * In development with no Gmail account set up, the code is LOGGED instead, so
 * the flow can be tested without credentials. Never anywhere else:
 * isDevAuthEnabled is true only for NODE_ENV=development exactly, and a code in
 * a production log would be a reset for anyone who can read the logs.
 *
 * @param {string} to
 * @param {string} code
 * @returns {Promise<void>}
 */
export const sendResetCodeEmail = async (to, code) => {
  const config = getMailConfig();

  if (!config) {
    if (isDevAuthEnabled()) {
      log.info(`GMAIL_* not set - reset code for ${to}: ${code}`);
      return;
    }
    throw new Error("Mail is not configured (GMAIL_USER / GMAIL_APP_PASSWORD)");
  }

  await getTransport(config).sendMail({
    from: config.from,
    to,
    subject: "Your stdy password reset code",
    text: [
      `Your stdy password reset code is ${code}`,
      "",
      `It expires in ${RESET_CODE_TTL_MIN} minutes.`,
      "",
      "If you didn't ask to reset your password, you can ignore this email - your password has not changed.",
    ].join("\n"),
    html: resetCodeHtml(code),
  });
};

/**
 * The HTML body. Inline styles and a table, because that is what email clients
 * render consistently; the colours are the app's light palette (text #1e293b,
 * muted #64748b, primary #3b82f6), which is safe in a dark inbox too.
 *
 * The code is generated from a fixed alphabet (see passwordResetCode.js), so it
 * is safe to interpolate without escaping.
 */
const resetCodeHtml = (code) => `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;padding:28px;font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;color:#1e293b;">
            <tr><td style="font-size:22px;font-weight:700;padding-bottom:8px;">Reset your password</td></tr>
            <tr><td style="font-size:14px;line-height:20px;color:#64748b;padding-bottom:22px;">Enter this code in the stdy app to choose a new password.</td></tr>
            <tr>
              <td align="center" style="padding:16px 0;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;font-size:32px;font-weight:700;letter-spacing:10px;color:#1e293b;font-family:Menlo,Consolas,monospace;">${code}</td>
            </tr>
            <tr><td style="font-size:13px;line-height:18px;color:#64748b;padding-top:22px;">It expires in ${RESET_CODE_TTL_MIN} minutes. If you didn't ask to reset your password, you can ignore this email - your password has not changed.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
