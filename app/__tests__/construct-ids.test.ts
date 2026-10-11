/**
 * NAM-05: construct IDs are built from names, not from list positions, so
 * that adding, removing or reordering a config entry does not change the
 * Terraform addresses of the other entries.
 *
 * The config lists below are reversed in memory; every resource must keep
 * its address.
 */
import { cloudwatchLogGroupsConfig } from "../config/aws/cloudwatchlogs";
import { securityGroups as awsSecurityGroups } from "../config/aws/vpc/securitygroups";
import { subnets as awsSubnets } from "../config/aws/vpc/subnets";
import { subnets as azureSubnets } from "../config/azure/vnet/subnets";
import { azureVmsConfigparams } from "../config/azure/vm";
import { gceInstancesParams } from "../config/google/gce";
import { googlePsaConfig } from "../config/google/psa";
import { FEATURE_SETS, synthCase } from "../scripts/dev/synthMatrix";

const addresses = (synth: any): string[] =>
  Object.entries<any>(synth.resource ?? {})
    .flatMap(([type, instances]) =>
      Object.keys(instances).map((name) => `${type}.${name}`),
    )
    .sort();

const synthAllOn = () =>
  synthCase({
    name: "construct-ids",
    overrides: {
      ...FEATURE_SETS.allOn,
      vpnMode: "haBgp",
      awsToGoogle: true,
      awsToAzure: true,
      googleToAzure: true,
    },
  });

const lists: unknown[][] = [
  cloudwatchLogGroupsConfig,
  awsSubnets,
  awsSecurityGroups,
  azureSubnets,
  azureVmsConfigparams,
  gceInstancesParams.instanceConfigs,
  googlePsaConfig.serviceRanges.filestore,
];

test("reordering config lists keeps every Terraform address", () => {
  const before = addresses(synthAllOn());
  lists.forEach((list) => list.reverse());
  try {
    expect(addresses(synthAllOn())).toEqual(before);
  } finally {
    lists.forEach((list) => list.reverse());
  }
}, 120000);

test("renaming with key set to the old name keeps the Terraform address", () => {
  const before = addresses(synthAllOn());
  const instance = gceInstancesParams.instanceConfigs[0] as {
    name: string;
    key?: string;
  };
  const logGroup = cloudwatchLogGroupsConfig[0] as { name: string; key?: string };
  const original = { instance: { ...instance }, logGroup: { ...logGroup } };
  instance.key = instance.name;
  instance.name = `${instance.name}-renamed`;
  logGroup.key = logGroup.name;
  logGroup.name = `${logGroup.name}-renamed`;
  try {
    expect(addresses(synthAllOn())).toEqual(before);
  } finally {
    delete instance.key;
    Object.assign(instance, original.instance);
    delete logGroup.key;
    Object.assign(logGroup, original.logGroup);
  }
}, 120000);
