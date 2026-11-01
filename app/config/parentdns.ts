// ---------------------------------------------------------------------------
// Delegation of the public DNS zones from the parent zone
// (docs/getting-started.md, "Parent zone delegation")
//
// The public zones of the clouds (PUBLIC_DOMAIN of config/<cloud>/common.ts,
// features.dns) are sub-domains of a parent zone in Route 53 of another AWS
// account. When state/<env>/parent-dns.json exists, cdktn writes the NS
// records of each public zone into the parent zone, assuming an IAM role of
// the parent account:
//
//   { "roleArn": "arn:aws:iam::<parent account>:role/cdktn-ns-delegation",
//     "hostedZoneId": "Z..." }
//
// The file is next to the Terraform state (not in Git: the role ARN contains
// the account ID) and is read at every synthesis, unlike .env.<env>, which
// the container reads at start. Without the file the NS records are
// registered by hand (the NS values are printed after the deploy).
// ---------------------------------------------------------------------------

import * as fs from "fs";
import * as path from "path";
import { currentEnv } from "./environment";

export interface ParentDnsSettings {
  /** IAM role of the parent account that may change the NS records */
  roleArn: string;
  /** Route 53 hosted zone ID of the parent zone */
  hostedZoneId: string;
  /** AWS account ID of the parent zone (from roleArn) */
  accountId: string;
}

/** TTL (seconds) of the NS records in the parent zone */
export const PARENT_NS_TTL = 60;

/** state/<env>/parent-dns.json (next to the Terraform state) */
export const parentDnsFile = (): string =>
  path.join(process.cwd(), "state", currentEnv(), "parent-dns.json");

/** The parent zone settings of the current environment, if the file exists */
export function parentDnsSettings(): ParentDnsSettings | undefined {
  const file = parentDnsFile();
  if (!fs.existsSync(file)) {
    return undefined;
  }
  const content = JSON.parse(fs.readFileSync(file, "utf8"));
  const roleArn = content?.roleArn;
  const hostedZoneId = content?.hostedZoneId;
  const accountId =
    typeof roleArn === "string" ? /^arn:aws:iam::(\d{12}):role\/.+$/.exec(roleArn)?.[1] : undefined;
  if (!accountId) {
    throw new Error(
      `${file}: roleArn must be an IAM role ARN (arn:aws:iam::<12-digit account>:role/<name>), got ${JSON.stringify(roleArn)}`,
    );
  }
  if (typeof hostedZoneId !== "string" || hostedZoneId === "") {
    throw new Error(`${file}: hostedZoneId must be the parent hosted zone ID, got ${JSON.stringify(hostedZoneId)}`);
  }
  return { roleArn, hostedZoneId, accountId };
}
