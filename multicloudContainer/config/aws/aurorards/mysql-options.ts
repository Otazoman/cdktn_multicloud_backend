// MySQL Option Group Options
// This file contains option settings for MySQL RDS option groups
// Reference: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.MySQL.Options.html

export const mysqlOptions = [
  {
    optionName: "MARIADB_AUDIT_PLUGIN",
    optionSettings: [
      {
        name: "SERVER_AUDIT_EVENTS",
        value: "CONNECT,QUERY_DDL",
      },
      {
        name: "SERVER_AUDIT_EXCL_USERS",
        value: "rdsadmin",
      },
    ],
  },
];
