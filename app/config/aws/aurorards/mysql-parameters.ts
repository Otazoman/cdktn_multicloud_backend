// MySQL Parameter Group Parameters
// This file contains parameter settings for MySQL RDS parameter groups
// Reference: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.MySQL.Parameters.html

export const mysqlParameters = [
  {
    name: "character_set_server",
    value: "utf8mb4",
    applyMethod: "immediate",
  },
  {
    name: "collation_server",
    value: "utf8mb4_unicode_ci",
    applyMethod: "immediate",
  },
  {
    name: "max_connections",
    value: "100",
    applyMethod: "immediate",
  },
  {
    name: "innodb_buffer_pool_size",
    value: "{DBInstanceClassMemory*3/4}",
    applyMethod: "pending-reboot",
  },
  {
    name: "slow_query_log",
    value: "1",
    applyMethod: "immediate",
  },
  {
    name: "long_query_time",
    value: "2",
    applyMethod: "immediate",
  },
  {
    name: "log_bin_trust_function_creators",
    value: "1",
    applyMethod: "immediate",
  },
];
