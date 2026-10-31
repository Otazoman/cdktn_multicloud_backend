// Azure Database for PostgreSQL Flexible Server Configuration Parameters
// Values must be plain numbers in the parameter's unit (no "MB" / "GB").
// Reference: https://learn.microsoft.com/azure/postgresql/server-parameters/
export const postgresParameters = [
  // shared_buffers: not set. Azure sets it from the memory of the SKU when the
  // server is created (B1ms, 2GiB: 32768 x 8kB = 256MB, 1/8 of the memory).
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
  // log_connections: read-only on flexible server (always logged), not set.
  {
    name: "log_disconnections",
    value: "on",
  },
  // effective_cache_size: not set. Azure sets it from the memory of the SKU
  // when the server is created: memoryGib x 131072 - shared_buffers
  // (B1ms, 2GiB: 229376 x 8kB = 1792MB).
  {
    name: "work_mem",
    value: "4096", // 4MB (unit: kB)
  },
  {
    name: "maintenance_work_mem",
    value: "65536", // 64MB (unit: kB)
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
    // Logical replication (FEAT-01 active/active). "replica" to disable.
    value: "logical",
  },
  {
    // Logical replication needs at least 16 (Azure documentation)
    name: "max_worker_processes",
    value: "16",
  },
  {
    name: "max_wal_size",
    value: "1024", // 1GB (unit: MB)
  },
  // High availability: keep the logical replication slots on the standby, so
  // that the other clouds' subscriptions continue after a failover
  // (PostgreSQL 17+; the subscriptions are created with failover = true by the
  // application's scripts/replication-setup.sh). Harmless without it
  {
    name: "sync_replication_slots",
    value: "on",
  },
  {
    name: "hot_standby_feedback",
    value: "on",
  },
];

export default postgresParameters;
