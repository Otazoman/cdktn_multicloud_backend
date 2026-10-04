// PostgreSQL Parameter Group Parameters
// This file contains parameter settings for PostgreSQL RDS parameter groups
// Reference: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.Parameters.html

export const postgresParameters = [
  {
    name: "shared_preload_libraries",
    value: "pg_stat_statements,pgaudit",
    applyMethod: "pending-reboot",
  },
  {
    name: "log_statement",
    value: "ddl",
    applyMethod: "immediate",
  },
  {
    name: "log_min_duration_statement",
    value: "1000",
    applyMethod: "immediate",
  },
  {
    name: "pg_stat_statements.track",
    value: "ALL",
    applyMethod: "immediate",
  },
  {
    name: "max_connections",
    value: "100",
    applyMethod: "pending-reboot",
  },
  {
    name: "work_mem",
    value: "4096",
    applyMethod: "immediate",
  },
];
