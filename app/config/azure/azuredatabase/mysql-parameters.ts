// Azure Database for MySQL Flexible Server Configuration Parameters
export const mysqlParameters = [
  {
    name: "innodb_buffer_pool_size",
    value: "134217728", // 128MB for small instances
  },
  {
    name: "max_connections",
    value: "100",
  },
  {
    name: "slow_query_log",
    value: "ON",
  },
  {
    name: "long_query_time",
    value: "2.000000",
  },
  {
    name: "innodb_lock_wait_timeout",
    value: "50",
  },
  {
    name: "character_set_server",
    value: "utf8mb4",
  },
  {
    name: "collation_server",
    value: "utf8mb4_unicode_ci",
  },
  {
    name: "sql_mode",
    value:
      "STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO",
  },
  {
    name: "binlog_expire_logs_seconds",
    value: "86400", // 1 day
  },
  {
    name: "time_zone",
    value: "+09:00", // JST for Japan East region
  },
];

export default mysqlParameters;
