# Multi-Cloud Backend — cdktn アプリケーション

[English](README.md)

このディレクトリには、AWS、Google Cloud、Azure にマルチクラウドのバックエンドを構築する cdktn（CDK Terrain）のアプリケーションがあります。

- 準備: [docs/getting-started.ja.md](docs/getting-started.ja.md)
- deploy / destroy の手順と既知の問題: [docs/operations.ja.md](docs/operations.ja.md)
- すべての設定項目（項目、設定できる値、既定値）: [docs/configuration/](docs/configuration/README.ja.md)
- 設計: [docs/architecture.ja.md](docs/architecture.ja.md)、[docs/networking/vpn.ja.md](docs/networking/vpn.ja.md)、[docs/adding-a-cloud.ja.md](docs/adding-a-cloud.ja.md)

## ディレクトリ構成

| パス | 内容 |
|---|---|
| `app.ts` | エントリーポイント |
| `stacks/` | すべてをつなぐ唯一のスタック `MultiCloudBackendStack` |
| `providers/` | Terraform の provider の宣言（provider を作る唯一の場所） |
| `clouds/` | クラウドの登録（`registry.ts`）、共通の型（`types.ts`: クラウドごとの出力と、クラウドをまたぐモジュールに渡す `CloudContext`）、クラウドごとのモジュール（`aws/`、`azure/`、`google/`: 基盤の `index.ts`、機能ごとに 1 ファイル、クラウドの型の `types.ts`） |
| `config/` | すべての設定（リファレンス: [docs/configuration/](docs/configuration/README.ja.md)）。`commonsettings.ts` は全体の切り替え（`features.ts` / `connections.ts` を通して読む）。`aws/`、`azure/`、`google/` はクラウドごとの設定（リージョンは `common.ts`） |
| `resources/` | クラウドをまたぐ処理: VPN（`vpnResources.ts` + `vpn/`、クラウドのペアごとに 1 モジュール）とプライベート DNS（`privateZoneResources.ts` + `privatezone/`、クラウドごとに 1 モジュール） |
| `constructs/` | 種類ごと（ネットワーク、VPN、DB、ストレージ、コンテナなど）のリソース定義 |
| `utils/` | 共通の補助関数（`addTerraformDependency` など） |
| `scripts/` | VM の起動スクリプトと開発用のツール（`scripts/dev/`） |
| `__tests__/` | テスト |
| `docs/` | ドキュメント（`docs/ai/` は内部の作業メモ） |

データは一方向に流れます: `config` → `clouds` / `resources` → `constructs`。

## 対応しているサービス

| 分野 | AWS | Google Cloud | Azure |
|---|---|---|---|
| ネットワーク | VPC | VPC | Virtual Network |
| VPN | 仮想プライベートゲートウェイ | HA VPN / Classic VPN + Cloud Router | VPN Gateway |
| VM | EC2 | Compute Engine | Virtual Machines |
| データベース（PostgreSQL） | RDS / Aurora | Cloud SQL | Azure Database for PostgreSQL（フレキシブル サーバー） |
| ファイルストレージ | EFS | Filestore | Azure Files |
| コンテナ | ECS（Fargate） | Cloud Run | Container Apps |
| ロードバランサー | ALB | Cloud Load Balancing | Application Gateway |
| DNS | Route 53 | Cloud DNS | Azure DNS / Private DNS |
| CI/CD | CodeBuild + ECR | Cloud Build + Artifact Registry | Container Registry（ACR、プライベートエンドポイント）。Azure DevOps のパイプラインは予定 |
| 監視 | CloudWatch | Cloud Monitoring | Azure Monitor |

## コマンド

コンテナの中で、このディレクトリから実行します。

| コマンド | 内容 |
|---|---|
| `npm install` | 依存パッケージをインストールする |
| `cdktn get` | `cdktf.json` の provider のコードを `.gen/` に生成する（Azure DevOps）。`npm install` の後と、`cdktf.json` を変えた後に実行する |
| `cdktn synth` | Terraform の設定を `cdktf.out/` に生成する |
| `cdktn diff` | plan を表示する |
| `cdktn deploy` | 適用する |
| `cdktn destroy` | すべてのリソースを削除する（[docs/operations.ja.md](docs/operations.ja.md) を参照） |
| `npx tsc --noEmit -p .` | 型チェック |
| `npx jest __tests__/synth-matrix.test.ts` | 回帰テスト: 環境 × VPN の接続のすべてのパターンを合成し、守るべき条件を確認する |

`__tests__/app-test.ts` は古いスナップショットと比べるテストで、今は失敗します。参考のために残しています。

### 合成結果の比較（リファクタリング時）

```bash
npx ts-node scripts/dev/synth-matrix.ts synth cdktf.out/before.json
# ...変更する...
npx ts-node scripts/dev/synth-matrix.ts synth cdktf.out/after.json
npx ts-node scripts/dev/synth-matrix.ts compare cdktf.out/before.json cdktf.out/after.json
```

出力ファイルには、環境変数（`.env.<環境名>`）の秘密の値が含まれます。`cdktf.out/`（Git の管理外）に置き、コミットしないでください。

## Terraform の state

state は環境ごとにローカルに保存します（`state/<環境名>/terraform.tfstate`、Git の管理外。古い `terraform.app.tfstate` を移す手順は docs/operations.ja.md を参照）。state には秘密の値が平文で含まれます。バージョン管理に入れず、安全な場所にバックアップしてください。
