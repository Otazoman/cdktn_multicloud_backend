// Aurora PostgreSQL Cluster Parameter Group Parameters
// This file contains parameter settings for Aurora PostgreSQL cluster parameter groups

export const auroraPostgresClusterParameters = [
  // Logical replication (FEAT-01 active/active). Remove to disable.
  {
    name: "rds.logical_replication",
    value: "1",
    applyMethod: "pending-reboot",
  },
];
