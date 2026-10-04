// ---------------------------------------------------------------------------
// Naming
//
// Resource names are set in each feature's config file (e.g. VPN names in
// config/<cloud>/vpn.ts). When a name is omitted there, a default name is
// generated as:
//
//   <PROJECT_NAME>-<cloud>-<resource type>[-<key>]
//
// and adjusted to the naming rules of the resource (allowed characters,
// maximum length). See utils/naming.ts.
// ---------------------------------------------------------------------------

/** Prefix of default resource names. */
export const PROJECT_NAME = "multicloud";
