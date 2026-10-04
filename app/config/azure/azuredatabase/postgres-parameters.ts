// Azure Database for PostgreSQL Flexible Server Configuration Parameters
export const postgresParameters = [
  {
    name: "shared_buffers",
    value: "32MB", // Appropriate for small instances
  },
  {
    name: "max_connections",
    value: "100",
  },
  {
    name: "log_statement",
    value: "all", // Log all statements for monitoring
  },
  {
    name: "log_min_duration_statement",
    value: "2000", // Log statements taking longer than 2 seconds
  },
  {
    name: "log_checkpoints",
    value: "on",
  },
  {
    name: "log_connections",
    value: "on",
  },
  {
    name: "log_disconnections",
    value: "on",
  },
  {
    name: "effective_cache_size",
    value: "128MB",
  },
  {
    name: "work_mem",
    value: "4MB",
  },
  {
    name: "maintenance_work_mem",
    value: "64MB",
  },
  {
    name: "timezone",
    value: "Asia/Tokyo", // JST for Japan East region
  },
  {
    name: "datestyle",
    value: "ISO, YMD",
  },
  {
    name: "default_text_search_config",
    value: "pg_catalog.english",
  },
  {
    name: "wal_level",
    value: "replica", // Enable WAL for backup and replication
  },
  {
    name: "max_wal_size",
    value: "1GB",
  },
];

export default postgresParameters;
