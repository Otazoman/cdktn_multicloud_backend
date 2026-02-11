// Aurora MySQL Cluster Parameter Group Parameters
// This file contains parameter settings for Aurora MySQL cluster parameter groups

export const auroraMysqlClusterParameters = [
  {
    name: "character_set_server",
    value: "utf8mb4",
    applyMethod: "pending-reboot",
  },
  {
    name: "collation_server",
    value: "utf8mb4_unicode_ci",
    applyMethod: "pending-reboot",
  },
  {
    name: "binlog_format",
    value: "ROW",
    applyMethod: "pending-reboot",
  },
  {
    name: "server_audit_logging",
    value: "1",
    applyMethod: "pending-reboot",
  },
  {
    name: "server_audit_events",
    value: "CONNECT,QUERY_DDL",
    applyMethod: "pending-reboot",
  },
];
