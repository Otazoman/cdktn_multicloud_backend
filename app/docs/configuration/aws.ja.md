# AWS の設定

[English](aws.md)

ディレクトリ: `config/aws/`（`awssettings.ts` がまとめて export）。機能の ON/OFF は [common.ja.md](common.ja.md#クラウドと機能の切り替えclouds) にあります。共通の決まり（`build`、`key`、名前での参照）は [README.ja.md](README.ja.md) にあります。

## 共通（`common.ts`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `REGION` | すべての AWS リソースのリージョン | AWS のリージョンコード | `ap-northeast-1` | |
| `PUBLIC_DOMAIN` | 公開 DNS のドメイン。ALB のホスト名（`api.<ドメイン>`）、証明書、公開ゾーンはここから作られる | ドメインの文字列、`byEnv` | すべての環境で `awstest.tohonokai.com` | `features.dns` または AWS のマネージド証明書を使うときだけ使われる。環境ごとに変えるときは `byEnv({ dev, stg, prod })` |

## VPC（`vpc/vpc.ts`、`vpc/subnets.ts`、`vpc/securitygroups.ts`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `vpcCidrBlock` | VPC の CIDR | CIDR | `10.0.0.0/16` | ほかのクラウドと重ならないこと（サンプルの値: Google Cloud `10.1.0.0/16`、Azure `10.2.0.0/16`） |
| `vpcName` | VPC の名前 | 文字列 | `my-aws-vpc` | |
| `internetGatewayName` | インターネットゲートウェイの名前 | 文字列 | `<PROJECT_NAME>-aws-igw` | |
| `vpcTags` | VPC のタグ | マップ | — | |
| `defaultRouteTableName` | メインのルートテーブルの名前 | 文字列 | **必須** | |
| `ec2ICEndpoint.enable` | EC2 Instance Connect のエンドポイントを作る | `boolean` | `true` | |
| `ec2ICEndpoint.endpointName` | エンドポイントの名前 | 文字列 | **必須** | |
| `ec2ICEndpoint.securityGroupNames` | エンドポイントのセキュリティグループ | `securityGroups` の名前 | **必須** | |
| `natGateway.enable` | NAT ゲートウェイを作る | `boolean` | `true` | 時間単位の料金がかかる |
| `natGateway.name`、`natGateway.eipName`、`natGateway.tags` | 名前とタグ | 文字列 / マップ | `eipName`: `<PROJECT_NAME>-aws-nat-eip` | |
| `routeTables.public` / `routeTables.private` | ルートテーブル | `{ name, associatedSubnetNames, tags? }` | **必須** | `associatedSubnetNames` はサブネットの `name` |

### サブネット（`subnets[]`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `name` | サブネットの名前 | 文字列 | **必須** | ほかのファイルから名前で参照される |
| `key` | Terraform のアドレスのキー | 文字列 | `name` | |
| `cidrBlock` | CIDR | VPC の中の CIDR | **必須** | |
| `az` | アベイラビリティゾーン | ゾーン名 | **必須** | |
| `type` | パブリックかプライベートか | `"public"`、`"private"` | **必須** | |
| `tags` | タグ | マップ | — | |

### セキュリティグループ（`securityGroups[]`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `name` | グループの名前 | 文字列 | **必須** | 名前で参照される |
| `key` | Terraform のアドレスのキー | 文字列 | `name` | |
| `resourcetype` | 用途のラベル | 文字列（`ec2`、`rds`、`alb`、`ecs`、`code-build`、`other`） | **必須** | |
| `tags` | タグ | マップ | — | |
| `ingress[]`、`egress[]` | ルール | `{ fromPort, toPort, protocol, cidrBlocks, ipv6CidrBlocks?, description? }` | **必須**（`[]` でもよい） | `protocol: "-1"` はすべて。クラウド間の CIDR（`10.1.0.0/16`、`10.2.0.0/16`、`10.100.0.0/16`）はここに書く |

`myaws-db-sg` で開けているのは PostgreSQL（5432）だけです。

## EC2（`ec2.ts`、`ec2Configs[]`、機能 `vms`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build` | このインスタンスを作る | `boolean` | **必須** | |
| `key` | Terraform のアドレスのキー | 文字列 | `tags.Name` | |
| `ami` | AMI の ID | 文字列 | **必須** | |
| `instanceType` | インスタンスタイプ | 文字列 | **必須** | |
| `keyName` | 既存の EC2 のキーペア | 文字列 | **必須** | |
| `tags` | タグ | マップ。`Name` は**必須** | — | |
| `subnetKey` | サブネット | サブネットの `name` | **必須** | |
| `securityGroupIds` | セキュリティグループ | `securityGroups` の名前 | **必須** | |
| `diskSize` | ルートボリュームのサイズ（GiB） | 数値 | AMI の既定 | |
| `userDataScriptPath` | ユーザーデータのスクリプト | パス | — | `./scripts/vm_init.sh` |

## EFS（`efs.ts`、`efsConfigs[]`、機能 `storage`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build` | 作る | `boolean` | **必須** | |
| `name`、`key` | 名前、Terraform のアドレスのキー | 文字列 | **必須**、key = `name` | |
| `encrypted` | 暗号化 | `boolean` | `true` | |
| `performanceMode` | パフォーマンスモード | `"generalPurpose"`、`"maxIO"` | AWS の既定 | |
| `throughputMode` | スループットモード | `"bursting"`、`"provisioned"`、`"elastic"` | AWS の既定 | |
| `provisionedThroughputInMibps` | スループット | 数値 | — | `provisioned` のとき |
| `subnetKeys` | マウントターゲットのサブネット | サブネットの `name` | **必須** | サブネットごとにマウントターゲットを 1 つ |
| `securityGroupIds` | セキュリティグループ | 名前 | **必須** | |
| `tags` | タグ | マップ。`Name` は**必須** | — | |
| `transitionToIa`、`backupPolicy` | ライフサイクルとバックアップ | `AFTER_7_DAYS` など。`ENABLED`、`DISABLED` | — | サンプルの設定に記載 |
| `cnameRecordName` | プライベートゾーン `aws.inner` に登録する CNAME | FQDN | — | プライベート DNS を参照 |
| `accessPoints[]` | アクセスポイント | `{ name, key?, resourceName?, path?, posixUser?, creationInfo? }` | `[]` | `resourceName` の既定は `<PROJECT_NAME>-aws-efs-access-point-<name>` |

## データベース（`aurorards/`、機能 `dbs`）— PostgreSQL のみ

`rdsConfigs[]`（RDS インスタンス）と `auroraConfigs[]`（Aurora クラスター）。

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build` | 作る | `boolean` | **必須** | |
| `identifier` / `clusterIdentifier` | インスタンス / クラスターの識別子 | 文字列 | **必須** | |
| `key` | Terraform のアドレスのキー | 文字列 | 識別子 | |
| `names` | 作るリソースの名前 | `{ subnetGroup, parameterGroup, optionGroup, clusterParameterGroup, instanceParameterGroup, instances[] }` | 既定の名前 | `instances[]`: インスタンスごとに 1 つ、順番どおり |
| `engine` | エンジン | `"postgres"`（RDS）、`"aurora-postgresql"`（Aurora） | **必須** | MySQL / MariaDB には対応しない |
| `engineVersion` | エンジンのバージョン | 文字列 | **必須** | |
| `instanceClass` | インスタンスクラス | 文字列 | **必須** | |
| `instanceCount` | Aurora のインスタンス数 | 数値 | `1` | Aurora のみ。`2` 以上でライターとリーダー（冗長化。フェイルオーバーでリーダーがライターになる）。`names.instances` にインスタンスごとの名前を書く |
| `allocatedStorage`、`storageType` | ストレージ | GiB、`gp3` など | — | RDS のみ |
| `username` / `masterUsername`、`password` | マスターユーザー | `AWSDB_ROOT_USER`、`AWSDB_ROOT_PASSWORD` から | — | |
| `manageMasterUserPassword` | パスワードを AWS が Secrets Manager で管理する | `boolean` | サンプルでは `false` | `true` のときは `password` を使わない |
| `subnetKeys` | DB サブネットグループのサブネット | サブネットの `name` | **必須** | |
| `vpcSecurityGroupNames` | セキュリティグループ | 名前 | **必須** | |
| `parameterGroupFamily`、`parameterGroupParametersFile` | RDS のパラメータグループと、そのパラメータファイル | ファミリー（例: `postgres18`）、パス | — | ファイルは `postgresParameters[]` `{ name, value, applyMethod: "immediate" \| "pending-reboot" }` を export する |
| `dbClusterParameterGroupFamily`、`dbClusterParameterGroupParametersFile` | Aurora のクラスターパラメータグループ | ファミリー（例: `aurora-postgresql18`）、パス | — | アクティブ / アクティブのために `rds.logical_replication` を設定している |
| `instanceParameterGroupFamily`、`instanceParameterGroupParametersFile` | Aurora のインスタンスパラメータグループ | | — | |
| `skipFinalSnapshot` | 削除時のスナップショットを取らない | `boolean` | **必須** | |
| `backupRetentionPeriod` | バックアップの日数 | 数値 | `7` | |
| `preferredBackupWindow`、`preferredMaintenanceWindow`、`instancePreferredMaintenanceWindow` | 時間帯（UTC） | `hh:mm-hh:mm`、`ddd:hh:mm-ddd:hh:mm` | AWS の既定 | 最後のものは Aurora のインスタンス用 |
| `enablePerformanceInsights`、`performanceInsightsRetentionPeriod` | Performance Insights | `boolean`、日数 | — | |
| `enableEnhancedMonitoring`、`monitoringInterval`、`monitoringRoleName` | 拡張モニタリング | `boolean`、秒、`iam.ts` のロール名 | 間隔 `60` | 無効のときは間隔 `0` |
| `enabledCloudwatchLogsExports` | CloudWatch に送るログの種類 | 例: `["postgresql", "upgrade"]` | — | それぞれ、`cloudwatchlogs.ts` に `/aws/rds/instance/<識別子>/<種類>` または `/aws/rds/cluster/<識別子>/<種類>` のロググループが必要 |
| `autoMinorVersionUpgrade` | マイナーバージョンの自動アップグレード | `boolean` | `true` | |
| `multiAz` | マルチ AZ | `boolean` | — | RDS のみ |
| `storageEncrypted` | 暗号化 | `boolean` | — | |
| `tags` | タグ | マップ | — | |

## シークレット（`secrets.ts`、`awsSecretsConfig`、機能 `dbs`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `initialValue` | 作成時に入れるダミーの値 | 文字列 | `CHANGE_ME` | state に残る。本当の値は AWS CLI で入れる（[operations.ja.md](../operations.ja.md) を参照）。その後の値の変更は Terraform が無視する |
| `recoveryWindowInDays` | 削除したシークレットを復元できる日数 | `0`、`7`〜`30` | `0` | `7`〜`30` では、期間が終わるまで同じ名前を再利用できない |
| `secrets[].key` | キー | 文字列 | **必須** | |
| `secrets[].name` | シークレットの名前 | 文字列 | `<PROJECT_NAME>-aws-secret-<key>` | |
| `secrets[].description` | 説明 | 文字列 | **必須** | |

## コンテナ（機能 `containers`）

### ロードバランサー（`alb.ts`、`albConfigs[]`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build` | 作る | `boolean` | **必須** | HTTPS のパターンと HTTP だけのパターンを 2 つの項目として残し、`build` で切り替える |
| `name`、`key` | ALB の名前、Terraform のアドレスのキー | 文字列 | **必須**、key = `name` | |
| `internal` | 内部向けの ALB | `boolean` | **必須** | |
| `securityGroupNames`、`subnetNames` | セキュリティグループとサブネット | 名前 | **必須** | |
| `dnsConfig.subdomain`、`dnsConfig.fqdn` | 公開ゾーンとレコード名 | 文字列 | — | `PUBLIC_DOMAIN` から作る。`features.dns` が有効でゾーンがあるとき、A（エイリアス）レコードを作る |
| `certificateConfig.enabled` | 証明書を使う | `boolean` | — | |
| `certificateConfig.mode` | 証明書の入手方法 | `"AWS_MANAGED"`（ACM、DNS 検証）、`"IMPORT"`（ファイル） | — | |
| `certificateConfig.domains` | ドメイン | 文字列 | — | 最初が主な名前、残りが SAN |
| `certificateConfig.validationZone` | DNS 検証に使う公開ゾーン | ゾーン名 | — | `AWS_MANAGED` のみ。`features.dns` が必要。証明書がないのに HTTPS のリスナーがあると、synth で警告が出て、deploy は失敗する（AWS は HTTPS に証明書を必須とする）。その場合は HTTP のパターン（`build`）か `IMPORT` を使う |
| `certificateConfig.certificatePath`、`privateKeyPath`、`certificateChainPath` | 取り込むファイル | パス | — | `IMPORT` のみ。ファイルがないと警告が出て、証明書は作られない |
| `listenerConfig` | メインのリスナー | `{ name, port, protocol, sslPolicy?, defaultAction }` | **必須** | `protocol` は `HTTP` または `HTTPS`。証明書は自動で付く |
| `additionalListeners[]` | ほかのリスナー（HTTP のリダイレクト、Blue/Green のテスト用リスナー） | `listenerConfig` と同じ形に `key?` を加えたもの | — | |
| `defaultAction` | アクション | `type`: `forward`（`targetGroupName`）、`redirect`（`redirect`）、`fixed-response`（`fixedResponse`） | **必須** | |
| `targetGroups[]` | ターゲットグループ | `{ name, key?, port, protocol, targetType, healthCheckPath }` | **必須** | `targetType`: `ip`、`instance` |
| `listenerRules[]` | ルール | `{ priority, conditions: { pathPatterns?, hostHeaders?, httpHeaders? }, action }` | `[]` | |
| `tags` | タグ | マップ | — | |

### ECS（`ecs.ts`、`awsEcsConfigs[]`、`awsEcsClusterSettings`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build` | 作る | `boolean` | **必須** | |
| `name`、`key` | サービス / タスクファミリーの名前、Terraform のアドレスのキー | 文字列 | **必須**、key = `name` | |
| `clusterName` | クラスター（最初にそれを使うサービスが作る） | 文字列 | **必須** | |
| `cpu`、`memory` | タスクのサイズ | Fargate で有効な文字列（`"256"`、`"512"`） | **必須** | |
| `desiredCount` | タスク数 | 数値 | **必須** | |
| `deploymentStrategy` | デプロイの方式 | `"ROLLING"`、`"BLUE_GREEN"` | `ROLLING` | `BLUE_GREEN`：ECS が ALB のリスナーの優先度 1 のルールを書き換えてトラフィックを切り替えるため、cdktn は作成後にその転送先を変更しない（`alb.ts` の `defaultAction` のターゲットグループを変えても、既存のルールには反映されない） |
| `bakeTime` | Blue/Green のデプロイを安定とみなすまでの分数 | 数値 | — | |
| `enableExec` | ECS Exec | `boolean` | `false` | |
| `autoScaling` | ターゲット追跡 | `{ enabled, minCapacity, maxCapacity, cpuThreshold?, memoryThreshold?, requestCountPerTarget?, scaleInCooldown?, scaleOutCooldown?, cpuPolicyName?, memoryPolicyName?, requestPolicyName? }` | — | `requestCountPerTarget` は `ROLLING` で ALB のターゲットグループがあるときだけ。ポリシー名の既定は `<PROJECT_NAME>-aws-ecs-<cpu\|mem\|req>-scaling-<サービス>` |
| `executionRoleName`、`taskRoleName`、`infraRoleName` | IAM ロール | `iam.ts` の `name` | **必須**。`infraRoleName` は `BLUE_GREEN` のときだけ | |
| `cloudwatchLogGroupName` | ロググループ | `cloudwatchlogs.ts` の名前 | **必須** | |
| `logMode`、`logMaxBufferSize` | awslogs の送り方 | `"blocking"`、`"non-blocking"`、例: `"25m"` | アカウントの設定、`10m` | |
| `containerName`、`image`、`port`、`environment[]` | コンテナ | 文字列、`{ name, value }` | `environment` 以外は**必須** | |
| `securityGroupNames`、`subnetNames` | ネットワーク | 名前 | **必須** | |
| `targetGroupName`、`targetGroupNameGreen`、`listenerName`、`testListenerName` | ALB との関連付け | `alb.ts` で設定した名前 | — | |
| `awsEcsClusterSettings.<クラスター>.containerInsights` | Container Insights | `"enhanced"`、`"enabled"`、`"disabled"` | アカウントの設定 | `enhanced` はメトリクスの料金が増える |
| `tags` | タグ | マップ | — | |

## CI/CD（`cicd/cicdsettings.ts`、`awsCicdConfigs[]`、機能 `cicd`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `build`、`name`、`key` | 作る、ECR / プロジェクトの名前、アドレスのキー | | **必須**、key = `name` | |
| `ecr.imageRetentionInDays` | N 日たったイメージを削除する | 数値 | **必須** | |
| `ecr.scanOnPush` | プッシュ時にスキャンする | `boolean` | **必須** | |
| `ecr.forceDelete` | destroy のときに、リポジトリをイメージごと削除する | `boolean` | `true` | `false`: リポジトリにイメージがある間は destroy が失敗する（CI/CD がイメージを push する） |
| `codebuild.computeType`、`image`、`type`、`privilegedMode` | ビルドの環境 | 例: `BUILD_GENERAL1_SMALL`、イメージ、`LINUX_CONTAINER`、`boolean` | **必須** | Docker のビルドには `privilegedMode` が必要 |
| `codebuild.securityGroupNames`、`subnetNames` | VPC 内の配置 | 名前 | **必須** | |
| `codebuild.repositoryUrl` | ソースのリポジトリ | URL | `appRepositoryUrl`（`config/cicd.ts`） | |
| `codebuild.codeConnectionName` | GitHub への CodeConnections の接続の名前（`AVAILABLE` のもの） | 名前、`byEnv` | `multicloud-github` | deploy の前に作って承認する（[getting-started.ja.md](../getting-started.ja.md)）。ARN は plan のときに名前から引く（その名前の接続がなければ plan が失敗する）。設定すると、ソースをその接続で読み、`cicdTrigger.branches` への push で webhook がビルドを起動し、サービスロールにその接続への `codeconnections:*` が付く。空のときは警告が出て、webhook は作られない |
| `codebuild.environmentVariables` | 平文の変数 | `{ name, value }[]` | — | |
| `codebuild.serviceRoleName` | IAM ロール | `iam.ts` の名前 | **必須** | |
| `codebuild.cloudwatchLogGroupName` | ロググループ | `cloudwatchlogs.ts` の名前 | — | |
| `deployTarget.ecsServiceName` | ビルドがデプロイする ECS のサービス | `ecs.ts` のサービスの `name`（`build: true`） | —（ビルドとプッシュだけ） | ビルドに `ECS_CLUSTER`、`ECS_SERVICE`、`CONTAINER_NAME` を渡し、サービスロールに次の権限を付ける: そのサービスへの `ecs:DescribeServices` / `UpdateService`、`ecs:RegisterTaskDefinition` / `DescribeTaskDefinition`、そのサービスの実行ロールとタスクロールへの `iam:PassRole`。`REPOSITORY_URI` は常に渡す |
| `tags` | タグ | マップ | — | |

## IAM（`iam.ts`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `iamRolesConfig[]` | 先に作り、名前で参照するロール | `{ name, key?, assumeRolePolicy, managedPolicyArns?, inlinePolicies?: [{ name, policy }], customPolicyNames? }` | — | `policy` はただのオブジェクト（内部で JSON にする）。ロール: RDS のモニタリング、ECS の実行 / タスク / インフラストラクチャ、CodeBuild |
| `iamPoliciesConfig[]` | `customPolicyNames` で複数のロールが共有する独立したポリシー | `{ name, key?, policy, description? }` | `[]` | |

## CloudWatch Logs（`cloudwatchlogs.ts`、`cloudwatchLogGroupsConfig[]`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `name` | ロググループの名前 | 文字列 | **必須** | そこに書き込む RDS / ECS / CodeBuild / VPN の設定の名前と一致すること |
| `key` | Terraform のアドレスのキー | 文字列 | `name` | |
| `retentionInDays` | 保存期間 | CloudWatch で有効な日数 | `0`（無期限） | |
| `tags` | タグ | マップ | — | |

## 監視（`monitoring.ts`）

### アラート（機能 `alerting`、`awsAlertingConfig`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `notificationTargets[]` | SNS のトピック | `{ key, name?, emails[], tags? }` | `ALERT_EMAILS` を使う `ops` | `name` の既定は `<PROJECT_NAME>-aws-alerts-<key>`。受信者はそれぞれ、サブスクリプションの確認メールで承認する必要がある |
| `metricFilters[]` | ログのメトリクスフィルター | `{ name, key?, logGroupName, pattern, metricName, metricNamespace, value?, defaultValue? }` | `[]` | `logGroupName` は `cloudwatchlogs.ts` にあること。`value` の既定は `"1"` |
| `alarms[]` | メトリクスのアラーム | `{ alarmName, key?, namespace, metricName, dimensions, statistic, comparisonOperator, threshold, period, evaluationPeriods, notify?, notifyOnOk?, loadBalancer? }` | API のエラー、削除ジョブの失敗、各 ALB の 5xx（[operations.ja.md](../operations.ja.md) の「アラート」） | `loadBalancer`：`alb.ts` の ALB の名前。その ALB が作られているときだけ、`LoadBalancer` のディメンションを付けて作る |
| `buildNotifications` | CI/CD のビルドの結果のメール（作られている CodeBuild のプロジェクトの EventBridge のルールから SNS へ） | `{ states[], notify[] }` または `undefined` | `SUCCEEDED`・`FAILED`・`STOPPED` を `ops` へ | `cicd` が有効なときに作る。EventBridge が送信できるトピックのポリシーを付ける（既定の許可も残すので、CloudWatch のアラームの通知も続く） |

### ログのアーカイブ（機能 `logArchive`、`awsLogArchiveConfig`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `deleteOnDestroy` | destroy のときにバケットとログを削除する | `boolean` | `true` | `false` では残るが、バケットが空でない間は destroy が失敗する |
| `mode` | 送り方 | `"firehose"`（継続的、GB 単位の料金）、`"export"`（Lambda で 1 日 1 回） | `firehose` | 1 つのロググループに付けられるサブスクリプションフィルターは 2 つまで |
| `bucket.name` | S3 バケット | 全世界で一意な文字列 | `logArchive` が有効なときは**必須** | 環境ごとの名前は `byEnv` で書く |
| `bucket.lifecycle` | Glacier への移動 / 削除 | `{ transitionToGlacierDays?, expireDays? }` | `30`、`365` | |
| `logGroups` | アーカイブするロググループ | `cloudwatchlogs.ts` の名前 | api-service | |
| `firehose` | バッファリング | `{ bufferingSizeMb, bufferingIntervalSeconds }` | `5`、`300` | `firehose` のみ |
| `export` | スケジュール | `{ scheduleExpression, scheduleExpressionTimezone?, lambdaLogRetentionDays }` | `cron(0 2 * * ? *)`、`Asia/Tokyo`、`14` | `export` のみ。終わってから 12 時間以上たった直近の UTC の 1 日分をエクスポートする |
| `names` | ロール、Lambda、スケジュール、ストリーム、フィルターの名前 | `monitoring.ts` を参照 | `<PROJECT_NAME>-aws-log-archive-<役割>` | |
| `tags` | タグ | マップ | — | |

## プライベート DNS（`privatezone.ts`、`awsPrivateZoneParams`、`hostZones` が有効なとき）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `enableConditionalForwarding` | ほかのクラウドのプライベートドメインを Route 53 Resolver で転送する | `boolean` | `true` | |
| `resolverSecurityGroupName` | Resolver のエンドポイントのセキュリティグループ | `securityGroups` の名前 | `route53-resolver-sg` | VPC とほかのクラウドに TCP / UDP 53 を開ける |
| `forwardingDomains` | ほかのクラウドに転送するドメイン | 文字列 | Azure の PostgreSQL / Private Link / Azure Files のドメイン、`azure.inner`、`google.inner` | |
| `outboundEndpointName`、`inboundEndpointName` | Resolver のエンドポイントの名前 | 文字列 | | |
| `resolverRuleNames` | 転送するドメインごとのルールの名前 | マップ | `<PROJECT_NAME>-aws-resolver-rule-<ドメイン>` | |
| `rdsInternalZone` | 短い名前のためのプライベートゾーン | `{ zoneName, comment, tags }` | `aws.inner` | |
| `rdsCnameRecords[]` | DB の短い名前 | `{ shortName, dbIdentifier, type: "rds" \| "aurora" }` | — | `dbIdentifier` は `aurorards.ts` と一致すること |
| `privateZoneComments`、`tags` | コメントとタグ | | | |

## VPN（`vpn.ts`、`awsVpnparams`）

| 項目名 | 設定する内容 | 設定できる値 | 指定がない場合のデフォルト値 | 備考 |
|---|---|---|---|---|
| `bgpAwsAsn` | AWS 側の BGP の ASN | 数値 | `64512` | |
| `vpnGatewayName` | 仮想プライベートゲートウェイの名前 | 文字列 | **必須** | |
| `customerGateways.<google\|azure>.customerGatewayNames` | カスタマーゲートウェイの名前。相手のゲートウェイの IP ごとに 1 つ（`singleTunnel`: 1、`haBgp`: 2） | 文字列 | `<PROJECT_NAME>-aws-cgw-<接続先>-<n>` | |
| `...vpnConnectionNames` | VPN 接続の名前 | 文字列 | `<PROJECT_NAME>-aws-vpn-connection-<接続先>-<n>` | |
| `...logGroupName` | トンネルのログのロググループ | `cloudwatchlogs.ts` の名前 | **必須** | |
| `...logs` | トンネルのアクティビティログ | `boolean` | **必須** | |
| `...logOutputFormat` | ログの形式 | `"text"`、`"json"` | AWS の既定 | 変えると各トンネルが数分間切断される |
| `propagateRouteTableNames` | VPN のルートを受け取るルートテーブル | ルートテーブルの `name` | **必須** | |
| `vpnGatewayTags`、`customerGatewayTags` | タグ | マップ | — | |
