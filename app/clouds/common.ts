
// Types shared by the cloud modules.

// DNS information output from load balancer creation
export interface LoadBalancerDnsInfo {
  subdomain: string;
  fqdn?: string;
  ipAddress?: string; // For Google and Azure
  dnsName?: string; // For AWS ALB
  zoneId?: string; // Public zone ID if created
  nsRecords?: string[]; // NS records for delegation
}
