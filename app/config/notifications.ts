// ---------------------------------------------------------------------------
// Alert notifications shared by every cloud (config/<cloud>/monitoring.ts)
// ---------------------------------------------------------------------------

/**
 * Addresses that receive the alerts: ALERT_EMAILS in .env.<env>,
 * comma-separated (kept out of this public repository). Empty: the
 * notification targets are created without recipients.
 */
export const alertEmails: string[] = (process.env.ALERT_EMAILS ?? "")
  .split(",")
  .map((address) => address.trim())
  .filter((address) => address !== "");
