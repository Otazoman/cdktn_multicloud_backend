export const postgresDatabaseFlags = [
  {
    name: "log_statement",
    value: "all"
  },
  {
    name: "log_min_duration_statement",
    value: "1000"
  },
  {
    name: "max_connections",
    value: "100"
  },
  // Logical replication (FEAT-01 active/active). Remove to disable.
  {
    name: "cloudsql.logical_decoding",
    value: "on"
  }
];
