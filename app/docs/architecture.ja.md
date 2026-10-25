# アーキテクチャ

[English](architecture.md)

各設定の意味は、[設定リファレンス](configuration/README.ja.md)を参照してください。

## 層

```text
app.ts
 └ stacks/MultiCloudBackendStack.ts      唯一のスタック。クラウドの名前を知らない
    ├ providers/providers.ts              provider を作る唯一の場所
    ├ clouds/registry.ts                  登録されたクラウドのモジュールをすべて実行する
    │   └ clouds/<cloud>/index.ts         基盤（ネットワークなど）+ 機能のモジュール
    │       └ clouds/<cloud>/<feature>.ts dns / storage / database / compute / container / cicd
    ├ resources/vpnResources.ts           クラウド間の VPN        (+ resources/vpn/<pair>.ts)
    └ resources/privateZoneResources.ts   クラウド間のプライベート DNS (+ resources/privatezone/<cloud>.ts)
         ↓ 呼び出す
    constructs/<category>/<cloud><service>.ts   リソースの定義
         ↑ 読む
    config/                                  設定（データのみ）
    utils/                                   共通の補助関数（命名、依存関係）
```

## 処理の流れ

1. `createProviders()` が AWS、Google Cloud、Azure の provider を宣言します。補助の provider（null）は、`providers.null(alias)` で必要なときに作られます。
2. `createCloudResources()` が `clouds/registry.ts` の各項目を実行し、出力を `CloudOutputs`（クラウドの ID がキー）に集めます。
3. 各クラウドのモジュールは、`index.ts` で基盤を作ります（VPC / VNet。AWS では CloudWatch のロググループと IAM も、Azure では Azure Monitor も）。その後、機能ごとに 1 つの関数を呼びます。アラート（`monitoring.ts`）は、それより前に作ったリソースを対象にできるよう最後に実行します。機能のモジュールの間で共有する値は、`<Cloud>BuildContext`（`context.ts`）で渡します。
4. スタックは `CloudContext`（`scope`、`providers`、`outputs`）を作り、クラウドをまたぐモジュールに渡します。
   - VPN: `useVpn` が有効なとき。[networking/vpn.ja.md](networking/vpn.ja.md) を参照
   - プライベート DNS: `hostZones` が有効なとき

## 切り替え

| 設定（`config/commonsettings.ts`） | 読み方 | 意味 |
|---|---|---|
| `clouds.<cloud>.enabled` | `isCloudEnabled()`（`config/features.ts`） | そのクラウドを作るかどうか |
| `clouds.<cloud>.features.<feature>` | `isFeatureEnabled()` | 機能を作るかどうか。VPN とは独立 |
| `awsToGoogle`、`awsToAzure`、`googleToAzure` | `isConnected()`、`isCloudConnected()`、`vpnConnections()`（`config/connections.ts`） | ペアごとの直接の VPN 接続 |
| `vpnMode` | `vpnMode === "singleTunnel"` | トンネル 1 本の VPN（`singleTunnel`）/ BGP を使う HA VPN（`haBgp`）。`byEnv` で環境ごとに設定 |

コードはフラグではなく関数を使います。そうすれば、クラウドを追加するときや、ペアのフラグを接続の一覧に置き換えるときに、`config/` だけの変更で済みます。

## 環境

1 つのリポジトリ・1 つのブランチから、`dev`、`stg`、`prod` を別々のクラウドのアカウントに deploy します。環境は `DEPLOY_ENV` で選びます（環境ごとにコンテナを 1 つ）。

| 項目 | 方法 |
|---|---|
| 値の選択 | 設定ファイルの中の `byEnv({...})`（`config/environment.ts`）。環境で違う値だけを環境ごとに書く |
| 一意な名前 | `envScopedName()` が、`dev` 以外で環境名を付ける（Key Vault、ACR、Azure DB のサーバー、ストレージアカウント） |
| 認証情報と秘密の値 | リポジトリ直下の `.env.<環境名>`。`compose.yaml` がその環境のコンテナに読み込む |
| アカウント | `config/commonsettings.ts` の `accounts` と、`config/google/common.ts` の `PROJECT_NAME`。provider はほかのアカウントでの実行を拒否する |
| state | `state/<環境名>/terraform.tfstate`（`stacks/MultiCloudBackendStack.ts` の `LocalBackend`） |
| VPN の方式 | 環境ごとの `vpnMode` |

[configuration/common.ja.md](configuration/common.ja.md) を参照してください。

## 設計のルール

| ルール | 内容 |
|---|---|
| 関心ごとに 1 か所 | provider は `providers/providers.ts`、接続の判定は `config/connections.ts`、VPN の内側のアドレスは `config/vpn/addressPlan.ts`、リージョンは `config/<cloud>/common.ts` |
| 名前は設定から | すべてのリソースとサブリソースの名前は、その機能の設定ファイルに書く。省略した名前は `<PROJECT_NAME>-<cloud>-<type>[-<key>]`（`utils/naming.ts`）になる |
| 変わらない construct ID | construct ID（Terraform のアドレス）は `key ?? name` から `idPart()`（`utils/naming.ts`）で作り、一覧の順番は使わない。そのため、設定の項目を追加・削除・並べ替えても、ほかのリソースは変わらない。リソースを作り直さずに名前を変えるときは、`key` に古い名前を書く |
| 依存関係は明示する | `addTerraformDependency()`（`utils/terraformDependency.ts`）を使う。`node.addDependency()` は cdktn では `depends_on` に出力され**ない** |
| ペアの処理は明示的に | ペアごとの処理（VPN）はペアごとに 1 モジュール。コードで共有するのは、つなぎの部分だけ |
| construct は判断しない | 有効・無効の判断は `clouds/` と `resources/` で行う |

## テスト

| テスト | 確認すること |
|---|---|
| `__tests__/synth-matrix.test.ts` | 2 つの機能の組み合わせ（今の設定、すべて有効）で、`vpnMode` × VPN の接続のすべてのパターンを合成し、次を確認する: 依存関係の循環がない、`depends_on` が正しい、VPN のペアがフラグと一致する、Azure の BGP アドレスがゲートウェイにある |
| `__tests__/addressPlan.test.ts` | VPN の内側のアドレス: /30 のホストアドレス、重なりがない、Azure の APIPA の範囲 |
| `__tests__/construct-ids.test.ts` | 設定の一覧を逆順にしても、すべての Terraform のアドレスが変わらない。`key` に古い名前を書いて名前を変えても、アドレスが変わらない |
| `scripts/dev/synth-matrix.ts` | リファクタリングのための、合成結果の変更前後の比較 |
