import crypto from "crypto";

const SECRET = process.env.CRON_SECRET || "chlore-cron-2026-epg";

export function makeEmployeeToken(employeeId: string): string {
  const hmac = crypto.createHmac("sha256", SECRET).update(employeeId).digest("hex");
  return `${employeeId}.${hmac}`;
}

export function validateEmployeeToken(token: string): string | null {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx < 0) return null;
  const id = token.slice(0, dotIdx);
  const hmac = token.slice(dotIdx + 1);
  const expected = crypto.createHmac("sha256", SECRET).update(id).digest("hex");
  return expected === hmac ? id : null;
}
