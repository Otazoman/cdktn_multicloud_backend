export const env: string = "dev"; // 'dev' for SingleVPN, 'prod' for HAVpn
export const awsToGoogle: boolean = true; // Enable/disable VPN connection between AWS and Google
export const awsToAzure: boolean = true; // Enable/disable VPN connection between AWS and Azure
export const googleToAzure: boolean = true; // Enable/disable VPN connection between Google and Azure
export const useVpn: boolean = false; // Enable/disable VPN usage
export const useVms: boolean = false; // Enable/disable VM usage
export const useDbs: boolean = false; // Enable/disable DataBase usage
export const hostZones: boolean = false; // Enable/disable PrivateHostZone usage
export const useLbs: boolean = true;

// Public DNS management flag
// Set to true to automatically create A records in existing public DNS zones
// Set to false for manual DNS management
// Note: Public DNS zones must be created manually in advance
export const useDns: boolean = true;
