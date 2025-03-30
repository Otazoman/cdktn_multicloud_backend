import { PrivateKey } from "@cdktf/provider-tls/lib/private-key";
import { TlsProvider } from "@cdktf/provider-tls/lib/provider";
import { Construct } from "constructs";

export const createSshKey = (scope: Construct, tlsProvider: TlsProvider) => {
  return new PrivateKey(scope, "ssh-key", {
    algorithm: "RSA",
    rsaBits: 4096,
    provider: tlsProvider,
  });
};
