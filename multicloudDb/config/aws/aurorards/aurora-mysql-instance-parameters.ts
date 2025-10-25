// Aurora MySQL Instance Parameter Group Parameters
// This file contains parameter settings for Aurora MySQL instance parameter groups

export const auroraMysqlInstanceParameters = [
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
    name: "log_queries_not_using_indexes",
    value: "1",
    applyMethod: "immediate",
  },
];
