# cdktn マルチクラウド構成 再構成プラン

- 作成日: 2026-10-04（旧「VPN構成 再構成計画」を置き換え）
- 対象: `app/` 配下全体
- ステータス: フェーズA〜4 完了（詳細は §5 の状態列と §8）
- 管理方法: 作業時は §5「課題一覧」の `状態` 列を更新する。
  状態 = `未着手` / `要確認` / `承認待ち` / `対応中` / `完了` / `見送り`
- 次回作業時は、このファイルと `AGENTS.md` を読んでから着手すること。

---

## 1. 目的と方針

1. **クラウドを追加しても、既存コードの変更が増えない構造にする。**
   クラウドを1つ足すときに触る場所を「そのクラウド専用のファイル」と
   「接続先ペアごとのファイル」に限定し、既存のオーケストレータや
   Stack の修正を不要にする。
2. 開発 (dev = シングルトンネル) / 本番 (prod = HA) の切り替え
   (`commonsettings.ts` の `env`) は維持する。
3. 変更は段階的に行い、各段階で合成結果（Terraform JSON）が
   変わらないことを確認してから次へ進む（§7）。
4. 過剰な抽象化はしない。VPN や DNS フォワーディングのような
   「ペアごとに本質的に異なる処理」は、ペアごとの明示的なモジュールのまま残す。
   共通化するのは「配線」（どのクラウド・どのペアを有効にするか、
   出力の受け渡し）だけにする。

### 1.1 ユーザー確認済みの方針（2026-10-04）

| 項目 | 方針 |
|---|---|
| 正とするソース | `app/` を正とする（`multicloudContainer/` は正としない） |
| 機能と VPN の関係 | VM / DB / ストレージ / コンテナ等は **VPN に依存させない**。機能ごとの個別フラグで作成可否を決める（VPN を OFF にした状態でも作成するケースがある） |
| プロバイダ | **1か所で宣言**し、すべてのモジュールはそれを受け取って使う |
| リソース名 | コードに直書きせず、**設定ファイルで個別に設定**できるようにする |
| コンテナ | 各クラウドの**マネージドサービス**を使う（AWS: ECS Fargate / Google: Cloud Run / Azure: Container Apps。現状どおり） |
| DB | 将来的に RDS / Cloud SQL / Azure Database 間で**双方向レプリケーション**をしたい（FEAT-01、要調査） |
| CI/CD | Azure でも Azure DevOps による CI/CD を実装したい（FEAT-02、**ユーザー側で検討中のため途中で止まっている**） |
| 監視・オートスケーリング | AWS / Azure / Google の監視を設定で制御できるようにし、監視（メトリクス）に沿ってオートスケーリングできるようにしたい（FEAT-03） |
| プロジェクト名 | `PROJECT_NAME = "multicloud"`（`config/naming.ts` で変更可能） |
| ドキュメント | この機会に整備する。**ドキュメントは英語**で書く（DOC-03） |
| 証明書（SEC-01） | 置き換え可能なものなので重要度は低い（ユーザー判断） |

---

## 2. 現状の構成

### 2.1 レイヤーと呼び出しの流れ

```
app.ts
 └ stacks/MultiCloudBackendStack.ts    … 単一Stack。3クラウド固定で配線
    ├ providers/providers.ts            … 3プロバイダを固定生成（リージョン直書き）
    ├ resources/awsResources.ts    (725行) ┐
    ├ resources/googleResources.ts (594行) ├ クラウド別オーケストレータ
    ├ resources/azureResources.ts  (514行) ┘
    ├ resources/vpnResources.ts + resources/vpn/*   … クラウド間VPN
    └ resources/privateZoneResources.ts (854行)       … クラウド間プライベートDNS
         ↓ 呼び出し
    constructs/<分類>/<クラウド><サービス>.ts      … 実リソース定義（43ファイル）
         ↑ パラメータ
    config/<クラウド>/*.ts, config/commonsettings.ts  … 設定値
```

### 2.2 クラウドを1つ（例: OCI）追加するときに、今の構造で必要な変更

| # | 変更箇所 | 内容 | 既存ファイルの修正 |
|---|---|---|---|
| 1 | `providers/providers.ts` | プロバイダ追加 | 要 |
| 2 | `config/commonsettings.ts` | ペアフラグ追加（`ociToAws`, `ociToAzure`, `ociToGoogle`）。ペア数は N(N-1)/2 で増える（4クラウドで6個、5クラウドで10個） | 要 |
| 3 | `resources/{aws,azure,google}Resources.ts` | 「そのクラウドがどこかと接続しているか」の条件（例: `awsToAzure \|\| awsToGoogle`）を全箇所で書き換え | 要（3ファイル×各6〜7箇所） |
| 4 | `stacks/MultiCloudBackendStack.ts` | オーケストレータ呼び出し追加。VPN（9引数）・プライベートDNS（14引数）の位置引数を追加 | 要 |
| 5 | `resources/vpnResources.ts` | hub gateway / ペア手順の追加 | 要（想定どおり） |
| 6 | `constructs/vpnnetwork/azurevpngw.ts` | VNG のAPIPAが `awsGwIp1ip1` / `googleGWip1` などペア名入りの固定フィールドなので、construct のインターフェース変更が必要 | 要 |
| 7 | `config/azure/vpn.ts` ほか | APIPA/ASN の割り当てがクラウド別 config に分散しており、新ペア分を各所に追記 | 要 |
| 8 | `resources/interfaces.ts` | `VpnResources` のペア別フィールド追加 | 要 |
| 9 | `resources/privateZoneResources.ts` | ペア別のDNSフォワーディング条件（23箇所）を追記 | 要 |

→ 目標（§4）では、#5 のペア手順と、新クラウド専用のファイル追加だけで済むようにする。

---

## 3. 主な指摘（要約）

詳細と対応状況は §5 の表で管理する。

1. **セキュリティ**: `app/` を git 管理に戻したため、秘密鍵・PFX がコミット対象になっている
   （既に push 済みの分はユーザー判断で見送り）。パスワード・事前共有鍵が config に直書きされている。
2. **接続の表現がクラウド数に比例しない**: ペアごとの boolean と、
   それを OR でつないだ「参加判定」が各所に重複している。
3. **配線が3クラウド固定**: Stack・プロバイダ・VPN・DNS の引数が位置引数で、
   クラウドを足すたびに全呼び出しを修正する必要がある。
4. **VPN の Azure 側がペア名に依存**: VNG construct と config が
   AWS / Google 用の固定フィールドを持っている。
5. **オーケストレータが肥大化**: 証明書処理・サブネット検索・待機リソース・
   公開DNSゾーン作成などが直接書かれ、3クラウドで似た処理が重複している。
6. **型が弱い**: `any` が resources に139箇所、constructs に32箇所ある。
   `interfaces.ts` に、外から使われていない型や重複した型がある。
7. **細かな不整合**: 綴りの誤り（`loadbarancer`、ディレクトリ名 `publiczone.ts/` など）、
   リージョンの直書き、存在しないファイルを含む tsconfig、古い `help` / README、
   ルール文書の4重管理。

---

## 4. 目標の構成

### 4.1 ディレクトリ構成（案）

```
app/
├ app.ts
├ stacks/MultiCloudBackendStack.ts   … クラウド登録表を回すだけ（クラウド名を書かない）
├ providers/providers.ts             … プロバイダを宣言する唯一の場所（値は config から読む）
├ config/
│  ├ commonsettings.ts               … env と機能フラグ（クラウド別・機能別。VPN とは独立）
│  ├ connections.ts                  … VPN で接続するクラウドペアの一覧（ペアフラグを置き換え）
│  ├ naming.ts                       … 命名規則（プレフィックス・環境名）と、リソースごとの名前の上書き
│  ├ vpn/addressPlan.ts              … ペアごとの APIPA / ASN / PSK 参照を1か所に集約
│  └ <cloud>/…                       … クラウド固有の設定（リージョン等は common.ts に一元化）
├ clouds/                            … クラウド単位のモジュール
│  ├ registry.ts                     … 有効なクラウドの一覧（CloudModule[]）
│  ├ types.ts                        … CloudModule / CloudOutputs / CloudContext
│  └ <cloud>/
│     ├ index.ts                     … CloudModule 実装（宣言済みの provider を受け取り、各機能を呼び出す）
│     ├ network.ts / dns.ts / storage.ts / database.ts / compute.ts / container.ts / cicd.ts
│     └ types.ts                     … そのクラウドの出力型
├ crosscloud/                        … クラウド間の処理
│  ├ connections.ts                  … isConnected(a, b) / isCloudConnected(cloud) などの判定関数
│  ├ vpn/
│  │  ├ index.ts                     … hub gateway とペア手順の登録（現 vpnResources.ts）
│  │  ├ helpers.ts
│  │  └ pairs/awsGoogle.ts, awsAzure.ts, googleAzure.ts
│  └ privatezone/
│     ├ index.ts
│     └ pairs/…                      … ペアごとのDNSフォワーディング
├ constructs/<分類>/<cloud><service>.ts   … 現状のレイヤーを維持（綴りのみ修正）
└ __tests__/
   ├ synth-matrix.test.ts            … env × 接続パターンの合成結果の回帰テスト
   └ addressPlan.test.ts             … APIPA の重複・範囲チェック
```

### 4.2 設計ルール

| ルール | 内容 |
|---|---|
| 接続定義は1か所 | `config/connections.ts` のペア一覧だけを見る。各所で `awsToAzure \|\| awsToGoogle` のように書かず、`isConnected(a, b)` を使う |
| 機能は VPN 非依存 | VM / DB / ストレージ / コンテナ等の作成可否は機能フラグだけで決める。VPN の有無を条件にしない（VPN が必要な処理、たとえば DB レプリケーションは、その機能側で接続を検証する） |
| プロバイダは1か所で宣言 | `providers/providers.ts` で宣言し、`CloudContext` 経由で全モジュールに渡す。モジュール内で provider を new しない |
| 名前は設定から | リソース名は `config/naming.ts` の規則と上書き設定から作る。construct やオーケストレータで名前の文字列を組み立てない |
| Stack はクラウド名を知らない | `registry` の各 `CloudModule` を順に呼び、結果を `CloudOutputs`（クラウドIDをキーにしたマップ）に入れる |
| クラウド間処理はコンテキストで受け取る | VPN / DNS は `CloudContext`（providers と outputs のマップ）を1引数で受け取る。位置引数を増やさない |
| ペア処理は明示的に書く | `crosscloud/<機能>/pairs/<a><B>.ts` に1ペア1ファイル。登録表に1行追加して有効化する |
| construct はペアやクラウドの組み合わせを知らない | 例: Azure VNG はインスタンスごとの APIPA 配列を受け取るだけにする |
| 設定値の直書き禁止 | リージョン・プロジェクト・秘密値は config か環境変数から取る |
| リソースの論理IDを変えない | リファクタ中は construct ID を維持し、合成結果が一致することを確認する（§7） |

### 4.3 目標の構成でクラウド（例: OCI）を追加する手順

1. `config/oci/` を追加する
2. `constructs/<分類>/oci*.ts` を追加する
3. `providers/providers.ts` に OCI プロバイダの宣言を追加し、
   `clouds/oci/` に `CloudModule` を実装して `clouds/registry.ts` に1行追加する
4. 接続するペアごとに `crosscloud/vpn/pairs/ociAws.ts` などを追加し、登録表に1行追加する
5. `config/connections.ts` と `config/vpn/addressPlan.ts` にペアを追加する

既存の Stack、他クラウドのモジュール、construct の修正は不要になる。

---

## 5. 課題一覧

優先度: **P0** = すぐ対応 / **P1** = 拡張性の土台 / **P2** = 構造改善 / **P3** = 整理・美化

| ID | 区分 | 優先度 | 内容 | 根拠（ファイル） | 対応案 | 影響・リスク | 承認 | 状態 |
|---|---|---|---|---|---|---|---|---|
| SEC-01 | セキュリティ | P3 | 秘密鍵と PFX が GitHub（origin/main）に push 済み | `multicloudContainer/sslcerts/openssl/server.key`, `multicloudContainer/sslcerts/pfx/azureappgw_certificate.pfx`（コミット `c345854`） | 証明書は置き換え可能なため、必要になった時点で再発行する。履歴の書き換えは行わない | — | — | 見送り（ユーザー判断） |
| SEC-02 | セキュリティ | P1 | `app/` を git 管理に戻したため、秘密鍵・PFX・公開鍵がコミット対象になっている | `app/sslcerts/openssl/server.key`, `app/sslcerts/pfx/*.pfx`, `app/pubkey/*.pub`（`app/.gitignore` に記載なし） | 今後これ以上 push しないよう、`.gitignore` に `sslcerts/`, `pubkey/`, `authfiles/` を追加し、`.sample` や手順書で代わりに案内する（SEC-01 は見送りでも、増やさない対策として推奨） | なし | 要 | 完了（`app/.gitignore` に追加） |
| SEC-03 | セキュリティ | P0 | 秘密値が config に直書きされている | `config/azure/applicationgateway.ts:52`（証明書パスワード）、`config/azure/vpn.ts:50`（Google–Azure の PSK） | `.env`（`process.env`）から読む形に変える | `.env.sample` の更新が必要 | 要 | 完了（`.env` 化） |
| SEC-05 | セキュリティ | P1 | ECS のコンテナ環境変数にパスワードが直書きされている（`POSTGRES_PASSWORD`） | `config/aws/ecs.ts`（worker-service の environment） | `.env`（`process.env`）から読む形にする。本番では Secrets Manager / SSM Parameter Store の `secrets` で渡すことを検討 | Secrets Manager 利用は構成変更・コスト増 | 要 | 完了（`ECS_WORKER_POSTGRES_PASSWORD` として `config/.env` へ。Secrets Manager 化は未検討） |
| SEC-04 | セキュリティ/運用 | P2 | state がローカル保存されている（平文の秘密値を含み、ロックもない） | `app/terraform.app.tfstate`（backend 未定義） | リモート backend（S3 + DynamoDB / GCS / Azure Blob のいずれか）へ移行する | state 移行作業が必要。わずかにコスト増 | 要 | 見送り（当面 local 管理。ユーザー判断） |
| REPO-01 | リポジトリ | P0 | `app/` と `multicloudContainer/` にソースが二重にある | リポジトリルート | **`app/` を正とする（決定）**。`app/` のコミット後に `multicloudContainer/` の扱い（削除するか、バックアップとして残すか）を決める | 誤った方を編集し続ける事故の防止 | 要（削除時） | 方針決定 |
| TST-01 | テスト | P1 | リファクタの回帰検知手段がない（snapshot は古く、git 管理外） | `__tests__/app-test.ts`, `__tests__/__snapshots__/` | env × 接続パターン（16通り）の合成結果を比較する matrix テストを追加する（今回の作業で使った検証スクリプトをテスト化） | テストの追加のみ | 要 | 完了（`__tests__/synth-matrix.test.ts`, `scripts/dev/`） |
| ARC-01 | 拡張性 | P1 | 接続がペア boolean で表されている。「参加判定」の OR 条件が各所に重複している | `commonsettings.ts`、`resources/*Resources.ts`（各6〜7箇所）、`privateZoneResources.ts`（23箇所）、`vpnResources.ts` | `config/connections.ts`（ペア一覧）と、判定関数 `isConnected` / `isCloudConnected` に一元化する。最初は既存の3フラグからペア一覧を作り、互換性を保つ | 判定ロジックの置き換えのみ。合成結果は変えない | 要 | 一部完了（判定関数 `config/connections.ts` に一元化。ペアフラグ→接続一覧への置き換えは未着手） |
| ARC-02 | 拡張性 | P1 | Stack が3クラウド固定で配線し、VPN（9引数）・DNS（14引数）に位置引数で渡している | `stacks/MultiCloudBackendStack.ts`, `resources/privateZoneResources.ts:706` | `CloudOutputs` / `CloudContext` を導入し、1引数で渡す | 関数の引数（インターフェース）が変わる | 要 | 完了（`clouds/types.ts` の `CloudOutputs` / `CloudContext`、`clouds/registry.ts`） |
| ARC-03 | 拡張性 | P1 | プロバイダのリージョン・プロジェクトが config と重複して直書きされている。一部の construct が独自に provider を生成している（例: `awsvpngw.ts` / `googleResources.ts` の `NullProvider`） | `providers/providers.ts`, `config/google/common.ts`, `constructs/vpnnetwork/awsvpngw.ts`, `resources/googleResources.ts:323` | **`providers/providers.ts` を唯一の宣言場所にする（決定）**。値は config から読み、`CloudContext` 経由で渡す。null などの補助プロバイダもここで宣言する | provider の construct ID（`aws` / `google` / `azure` など）は維持する | 要 | 完了（null provider も `providers.null(alias)` 経由に集約） |
| ARC-04 | 拡張性（VPN） | P1 | Azure VNG construct がペア名入りの固定フィールドを持つ。Azure 側に渡しているフラグは使われていない | `constructs/vpnnetwork/azurevpngw.ts`（`awsGwIp1ip1`, `googleGWip1` など）、`resources/vpnResources.ts` の `createAzureVpnGatewayConfig`、`config/azure/vpn.ts` の `createLocalGatewayParams`（construct が受け取らない `awsToAzure` などを渡している） | VNG はインスタンスごとの `apipaAddresses: string[][]` を受け取るだけにし、有効なペアから組み立てる。使われていない引数は削除する | construct のインターフェース変更。合成結果は維持する | 要 | 完了（VNG は `apipaAddresses: string[][]` を受け取る。有効なペアから `azureVngApipaAddresses()` で組み立て。未使用引数を削除） |
| ARC-05 | 拡張性（VPN） | P1 | APIPA / ASN / PSK の割り当てが、クラウド別 config に分散している（Google–Azure 用の値が `azure/vpn.ts` にあるなど） | `config/{aws,azure,google}/vpn.ts` | `config/vpn/addressPlan.ts` にペア単位で集約し、重複と Azure の許可範囲（169.254.21.0〜22.255）をテストで検証する | config のデータ構造の変更 | 要 | 完了（`config/vpn/addressPlan.ts` に集約、`__tests__/addressPlan.test.ts` で検証。ASN は各クラウドの vpn.ts に残置） |
| ARC-06 | 拡張性（VPN） | P2 | `VpnResources` がペア別のフィールドを持つ | `resources/interfaces.ts:86` | ペアIDをキーにしたマップにする | 参照箇所の修正 | 要 | 完了（`gateways` / `connections[ペアID]` に再構成） |
| ARC-07 | 一貫性（VPN） | P2 | setup 関数のシグネチャが不統一（フラグを直接 import する関数と、引数で受け取る関数がある） | `resources/vpn/awsAzureVpn.ts`, `resources/vpn/googleAzureVpn.ts` | ARC-02 の `CloudContext` にそろえる | なし | 要 | 完了（`(ctx, resources, isSingleTunnel)` に統一） |
| ARC-08 | 拡張性（DNS） | P2 | プライベートDNSのペア別フォワーディングが1ファイル（854行）にベタ書きされている | `resources/privateZoneResources.ts` | VPN と同じく `crosscloud/privatezone/pairs/` に分割する | 規模が大きい。合成結果の一致確認が必須 | 要 | 完了（ペア別ではなくクラウド別に分割: `resources/privatezone/{helpers,aws,google,azure}.ts`。ペア別は処理の作り直しが必要なため。`cdktn diff` 確認待ち） |
| ARC-09 | 構造 | P2 | オーケストレータが肥大化している（証明書処理・サブネット検索・NullResource 待機・公開DNSゾーン + Output 作成が直接書かれ、3クラウドで重複） | `resources/awsResources.ts:422-660` ほか | `clouds/<cloud>/<機能>.ts` に分割し、公開DNSゾーンなど共通の流れはヘルパーにする | 規模が大きい | 要 | 完了（`clouds/<cloud>/{index,context,dns,storage,database,compute,container,cicd}.ts`。`cdktn diff` 確認待ち） |
| ARC-10 | 仕様 | P1 | VM / DB / ストレージ / コンテナの作成が「VPN接続があること」に依存している（例: `useVms && (awsToAzure \|\| awsToGoogle)`） | `resources/*Resources.ts` | **VPN 非依存にする（決定）**。作成可否は機能ごとの個別フラグだけで決める | **合成結果が変わる**（今は VPN 接続のないクラウドでは作られないリソースが、フラグしだいで作られるようになる）。現行の設定値で `cdktn diff` を確認する | 要 | 完了（`cdktn diff` 確認待ち） |
| ARC-11 | 一貫性 | P1 | 有効化のスイッチが2層あり（`commonsettings` の `use*` と各 VPC config の `isEnabled`）、条件もばらばら（Azure の CI/CD だけ接続を要求する） | `resources/azureResources.ts:280`、`config/*/vpc*/…isEnabled` | クラウドの有効化と、クラウド別・機能別のフラグを `commonsettings.ts` に整理する（例: `clouds.aws.enabled`, `clouds.aws.features.vms`） | config のデータ構造の変更 | 要 | 完了（`clouds.<cloud>.enabled/features` に整理。`cdktn diff` 確認待ち） |
| ARC-12 | 構造 | P2 | 全リソースが単一 Stack にあり、変更の影響範囲が広く、plan にも時間がかかる。destroy を段階に分けられない（DEL-03） | `stacks/MultiCloudBackendStack.ts` | ネットワーク/VPN と、ワークロードの Stack 分割を検討する（DEL-03 の中期策にもなる） | state の移行が必要 | 要 | 要検討 |
| DEL-01 | destroy（不具合） | P0 | **`node.addDependency()` が Terraform の `depends_on` に出力されない**。そのため、削除順を制御するための指定（51か所）がすべて効いていない | `resources/awsResources.ts`（18）, `resources/googleResources.ts`（13）, `resources/azureResources.ts`（11）, `constructs/*`（9）。最小構成の合成でも `addDependency` → `[]`、`dependsOn` プロパティ → `["null_resource.a"]` を確認（§5.4） | `dependsOn` に追加する共通ヘルパー（例: `addTerraformDependency(resource, ...deps)`）に置き換える | 合成結果に `depends_on` が増える（リソースの作り直しは起きない）。循環依存が出ないか `cdktn synth` で確認が必要 | 要 | 実装済み（`cdktn synth/diff` 確認待ち） |
| DEL-02 | destroy（不具合） | P0 | リージョナル LB とプロキシ専用サブネットの依存が張られていない。サブネットの `region`（トークン）と config の文字列を比較しているため、一致せず `dependsOn` が空になる | `resources/googleResources.ts:455-463`（`ps.region === config.region`）, `constructs/loadbarancer/googlelb.ts:340` | config のリージョン（文字列）で対応付ける。DEL-01 のヘルパーで「転送ルール → 待機 → プロキシサブネット」の順を確実にする | 合成結果に `depends_on` が増える | 要 | 実装済み（`cdktn synth/diff` 確認待ち） |
| DEL-03 | destroy（仕様上の制約） | P1 | Cloud Run の Direct VPC egress が確保する IP（`serverless-ipv4-…`）は、サービス削除後 **1〜2時間** 解放されない（Google 公式）。その間はサブネットを削除できない。今の待機（240秒）では足りない | `resources/googleResources.ts:359-420`, Cloud Run 設定の `subnetworkName` | 短期: Cloud Run 専用のサブネットに分け、「1回目の destroy の 1〜2時間後に、もう一度 destroy する」手順を文書化する（効かない240秒待機は整理する）。中期: ネットワーク層を別 Stack にして段階的に destroy する（ARC-12）。代替: Serverless VPC Access コネクタ（常時課金で**コスト増**） | 方式によりネットワーク構成・コストが変わる | 要 | 案Aで実装済み（案Bは ARC-12 で対応） |
| DEL-04 | destroy | P1 | Cloud SQL 削除時の PSA（Service Networking 接続）の削除エラー（README 記載、provider issue #16275） | `constructs/vpcnetwork/googlepsa.ts:139`（`deletionPolicy` 未設定） | DEL-01 を直した後に再確認する。解消しなければ `deletion_policy = "ABANDON"` を検討する（接続を削除せず state から外すだけなので、ネットワーク削除への影響を要検証） | 残留リソースが出る可能性 | 要 | DEL-01 後に再確認 |
| DEL-05 | destroy | P2 | Azure Container Apps の destroy が1回目に失敗する（README 記載） | `constructs/container/azureaca.ts` | DEL-01 の修正後に再現するか確認し、エラー内容から原因を調べる | — | — | DEL-01 後に再確認 |
| DEL-06 | destroy | P2 | Aurora / RDS の CloudWatch ロググループが destroy 後に再作成されて残る（README 記載） | `constructs/relationaldatabase/awsrelationaldatabase.ts`, `config/aws/cloudwatchlogs.ts` | 削除中に RDS がログを書き出して再作成する動作の可能性。ロググループをクラスタより後に削除する依存（DEL-01）で解消するか確認し、しなければ後片付け手順を文書化する | — | — | DEL-01 後に再確認 |
| DEL-07 | destroy | P1 | 上記以外に、cdktn から削除できないリソースがある（ユーザー報告） | — | エラー全文を収集し、本表に個別の項目として登録する | — | — | テスト時に再確認（ユーザー） |
| TYP-01 | 型 | P2 | `any` が多い（resources に139、constructs に32） | 全体 | ARC-02 / 09 と合わせて、出力型を `clouds/<cloud>/types.ts` に定義する | なし | 不要 | 一部完了（resources 63→21、clouds 61→46。残りの多くは型のない設定配列による `(config as any)`（TYP-04）と constructs 内（37）） |
| TYP-02 | 型 | P2 | `interfaces.ts`（525行）にすべての型が集中している。外から参照されていない型が22個（ファイル内の継承元を含むため要精査）。`PrivateZoneResources` が2か所に重複定義されている | `resources/interfaces.ts`, `resources/privateZoneResources.ts:46` | 使われていない型を削除し、クラウド別・機能別に分割する | なし | 要 | 完了（`interfaces.ts` を `clouds/{aws,google,azure}/types.ts`・`resources/vpn/types.ts`・`clouds/common.ts` に分割。未使用19型と重複定義を削除） |
| TYP-03 | 型 | P2 | 設定値をキー名の文字列組み立てと `as any` で読んでいる | `resources/vpn/awsAzureVpn.ts`（`awsGwIp1ip${n}` など） | ARC-05 で配列化して型安全にする | なし | 要 | 完了（アドレスは配列から参照） |
| TYP-04 | 型 | P2 | 設定ファイルの配列（`albConfigs`, `ecsConfigs`, `azureAcaConfigs` など）に型がなく、エントリーごとに項目が異なるため、`(config as any).listenerName` のようなキャストが `clouds/` に多数残っている | `config/<cloud>/*.ts`, `clouds/*/container.ts` ほか | 設定配列に construct のインターフェース型（または設定用の型）を付ける（例: `export const albConfigs: AwsAlbConfig[] = [...]`） | 設定ファイルの書き方は変わらない（型注釈の追加のみ）。型の不一致が見つかった場合は個別に修正 | 要 | 完了（`albConfigs: AwsAlbSettings[]`、`azureAppGwConfigs: AzureAppGwSettings[]` を追加。他は推論で解消。clouds の any 0） |
| NAM-04 | 命名 | P2 | AWS IAM のロール・ポリシー・付与の construct ID に一覧の順番（index）が含まれ、途中に追加・削除すると後ろのリソースが作り直しになる | `constructs/iam/awsiam.ts` | ID を `key ?? name`（付与・インラインはロールのキー＋ポリシー名）から作る | 既存 IAM リソースのアドレスが変わる（ユーザー確認: まだ作成していないため影響なし） | 済 | 完了 |
| DEAD-02 | 不要コード | P3 | Google IAM の construct（`GcpIamResources`）がどこからも使われていない | `constructs/iam/googleiam.ts` | 現状維持（ユーザー判断: いったん残す）。将来の選択肢: Cloud Run / GCE / Cloud Build 用の専用サービスアカウント（最小権限）を作って結線する。現状これらは既定のサービスアカウント（Editor ロールが自動付与されている場合がある）で動いている。結線時は construct ID の index を外す（NAM-04 と同様） | なし | 要 | 見送り（当面） |
| CON-01 | 規約 | P3 | construct の書き方が混在している（class 7、関数 36） | `constructs/iam/*`, `constructs/observability/*`, `constructs/vpcnetwork/googlepsa.ts` | 規約を決めて `AGENTS.md` に明記し、触るときに順次合わせる | 論理IDが変わらないよう注意 | 要 | 完了（`AGENTS.md` §9.1 に規約を明記。既存の class 形式は論理IDが変わるため変換しない） |
| CON-02 | 規約 | P2 | リージョン・ロケーションが直書きされている（`asia-northeast1` が10箇所以上） | `config/google/*`, `providers/providers.ts`, `constructs/loadbarancer/googlelb.ts:119`, `resources/privateZoneResources.ts:177` | `config/<cloud>/common.ts` を唯一の参照元にする | なし | 不要 | 一部完了（config・providers・resources は `config/<cloud>/common.ts` に一元化。`constructs/loadbarancer/googlelb.ts` の既定値 `"asia-northeast1"` は construct のため残置） |
| CON-04 | 規約 | P3 | null provider が3つ宣言されている（`null-vpc` / `null-vpn` / `null-gcp-wait`）。`null-vpc` / `null-vpn` はどのリソースからも使われていないが、宣言があることで `required_providers` に null（3.3.1）が入り、alias なしの `null_resource`（`ec2-connect-rule-guard`）が依存している | `providers/providers.ts` | alias なしの null provider 1つに統一する | 合成結果の `provider` 部分と、待機リソースの `provider` 指定が変わる（リソースの作り直しは起きない見込み） | 要 | 完了（alias なしの null provider 1つに統一。`cdktn diff` 確認待ち） |
| CON-03 | 規約 | P2 | 設定ミスを `console.warn` で流して処理を続けている（14箇所。例: 証明書ファイルが見つからないと HTTPS なしで続行） | `resources/awsResources.ts:440` 付近ほか | 例外で止めるか、合成前の設定チェックにまとめる | 挙動が変わる | 要 | 完了（ユーザー判断: #1 セキュリティグループ名が見つからない場合をエラーに。#2〜#6 は現状維持。進捗表示の console.log も現状維持） |
| NAM-02 | 命名 | P1 | リソース名がコードに直書きされている（resources / constructs で名前の文字列組み立てが約90箇所）。config 内でも、名前を作る関数にプレフィックスが固定で書かれ、しかも不統一（`my-aws-vpc-…`, `multicloud-gcp-vpc-…`, `my-azure-vnet`） | `config/aws/vpn.ts:28-29`, `config/google/vpn.ts:30-32`, `resources/vpnResources.ts:196`, `constructs/cicd/azuredevopsacr.ts:62-74` ほか | **`config/naming.ts` で命名規則（プレフィックス・環境名）とリソースごとの上書きを設定できるようにする（決定）**。既定値は現在の名前を再現するようにする | 名前が変わると、Azure / Google の多くのリソースは作り直しになる。既定値で `cdktn diff` が差分なしになることを確認しながら進める | 要 | 完了（各機能の設定ファイルで全リソース名・内部要素名を指定可能。既定名は `config/naming.ts` + `utils/naming.ts`。`cdktn diff` 確認待ち） |
| NAM-03 | 命名 | P2 | 既存の設定エントリーでは、`name`（設定のキー）が実際の名前と construct ID の両方を兼ねている箇所が残っている（例: `alb-${config.name}`、`cert-${config.name}`）。このような名前を変えると Terraform 上のアドレスも変わる | constructs の construct ID 生成箇所（約57箇所。NAM-02 で新たに設定化した名前は construct ID と切り離し済み） | エントリーにキー（`key`）を導入し、construct ID はキーから作る（既定値は今の `name`） | 設定のデータ構造の変更 | 要 | 完了（66箇所の construct ID を `key ?? name` に。22インターフェースに `key` を追加。ドメイン由来・切り離し済み・index を含む ID（IAM、VPN ゲートウェイの IP 等）は対象外） |
| DEAD-01 | 不要コード | P3 | どこからも使われていないコードがある | `constructs/dns/publiczone.ts/`（3ファイルすべて）、`constructs/observability/googlecloudMonitoring.ts`（`GcpMonitoringResources`）、`constructs/iam/azurerbac.ts`（`AzureIamResources`）、`constructs/dns/privatezone/googleprivatezone.ts` の4関数（`createGoogleCnameRecords` / `createGoogleDbCnameRecords` / `createGoogleDnsInboundAndCloudSql` / `createGoogleCloudSqlCnameRecords`）、`config/google/privatezone.ts` の `outboundForwardingZonePrefix` | 削除する（または今後使う予定があれば結線する） | なし | 要 | 完了（`constructs/dns/publiczone/`、`constructs/iam/azurerbac.ts`、googleprivatezone の4関数、`outboundForwardingZonePrefix` を削除。`GcpMonitoringResources` は FEAT-03 で使うため残置） |
| NAM-01 | 命名 | P3 | 綴りの誤り: ディレクトリ `loadbarancer`、`constructs/dns/publiczone.ts/`（ディレクトリ名が .ts）、`googlemanegedssl.ts`、`cloudloadbarancing.ts`、識別子 `conneectDestination`、`propageteRouteTableNames`、`vpnTnnelname` | 各所 | 名前を変更する（値・論理IDは変えない） | import の一括修正 | 要 | 完了（`loadbarancer`→`loadbalancer`、`publiczone.ts/`→`publiczone/`、`googlemanegedssl`→`googlemanagedssl`、`cloudloadbarancing`→`cloudloadbalancing`、`googlecloudMonitoring`→`googlecloudmonitoring`、`conneectDestination`→`connectDestination`、`propageteRouteTableNames`→`propagateRouteTableNames`） |
| CFG-01 | 設定 | P0 | tsconfig の `include` に存在しないファイルがある | `tsconfig.json`（`outputs/pemkey-extraction.js`, `config/azure/sqldatabase/databases.ts`） | 削除する | なし | 要 | 完了 |
| CFG-02 | 依存関係 | P3 | `npm` が実行時依存に入っている。`cdktn-cli` が dependencies にある。`main` / `types` が存在しないファイルを指している | `package.json` | 整理する | 依存関係の変更 | 要 | 完了（`main` / `types` 削除。依存関係はユーザーが整理: `npm` を削除、`cdktn-cli` を devDependencies へ） |
| DOC-01 | 文書 | P3 | ルール文書が4重管理になっている | `AGENTS.md`, `CLAUDE.md`, `.clinerules/00-project-rules.md`, `docs/ai/PROJECT_RULES.md` | `AGENTS.md` を正とし、他は参照だけにする | なし | 要 | 完了（`AGENTS.md` を正とし、構成の説明と設定ルールを更新。`.clinerules/00-project-rules.md` と `docs/ai/PROJECT_RULES.md` は参照のみに。PROJECT_RULES 固有の「変更履歴への記録」ルールは `AGENTS.md` §20 に移設） |
| DOC-02 | 文書 | P3 | `help` が cdktf テンプレートのまま | `help` | 削除する（内容は DOC-03 の README に統合） | なし | 要 | 完了（`help` 削除） |
| DOC-03 | 文書 | P1 | README が「サービス別の注意事項の寄せ集め」になっている（§5.1）。概要・前提条件・設定方法・デプロイ手順・構成説明がない | `README.md` | **英語で**ドキュメント一式を整備する（§5.2）。README の修正（DOC-03a）は早めに、構成に関する文書（DOC-03b）は構造が固まってから書く | なし | 要 | 完了（03a: README / getting-started / operations、03b: architecture / networking/vpn / adding-a-cloud） |
| FEAT-02 | 機能 | P2 | Azure DevOps による CI/CD が未実装。今あるのは ACR（プライベートエンドポイント付き）だけで、設定名・関数名が `azureDevOpsAcr…` になっている | `config/azure/devops_acr_config.ts`, `constructs/cicd/azuredevopsacr.ts`, `resources/azureResources.ts:278` | ユーザーの検討結果を待って設計する。AWS（CodeBuild + ECR）/ Google（Cloud Build + Artifact Registry）と同じく「リポジトリ → ビルド → レジストリ」の流れにそろえるか、などを決める。実装には Azure DevOps 用の Terraform プロバイダ（`microsoft/azuredevops`）の追加が必要になる見込み | 依存関係の追加。DevOps 組織と認証情報（PAT 等）が必要 | 要 | 検討中（ユーザー）。FEAT-01 で Azure の CI/CD を ACR Tasks にするか Azure DevOps にするかの判断と関連 |
| FEAT-03 | 機能 | P2 | 監視とオートスケーリングを、全クラウドで設定から制御できるようにしたい。現状: AWS は CloudWatch ロググループのみ（メトリクスフィルター・アラームの設定は空）、オートスケーリングは ECS のみ（EC2 は単体インスタンス）。Azure は Azure Monitor（Log Analytics・アクショングループ・アラート）があるが `useVpn` が ON のときしか作られない（ARC-10 の方針と矛盾）。Container Apps は最小/最大レプリカのみでスケールルールなし、VM にスケールセットなし。Google は監視 construct が未使用（DEAD-01）、Cloud Run は最小/最大インスタンスのみ、GCE にマネージドインスタンスグループなし | `config/aws/cloudwatchlogs.ts`, `config/aws/ecs.ts`, `config/azure/azuremonitor.ts`, `resources/azureResources.ts:104`, `constructs/observability/*`, `constructs/container/*`, `constructs/vmresources/*` | 設計してから実装する。案: `clouds.<cloud>.features.monitoring` の追加（Azure Monitor の VPN 依存を解消）、クラウド共通の監視設定の形（アラーム・通知先）、メトリクス連動のスケーリング（ECS / Cloud Run / Container Apps のスケールルール、VM はスケールグループ化の要否を含めて検討） | VM のスケールグループ化は構成変更・コスト増を伴う | 要 | 設計方針の案を作成（`docs/ai/feat03_monitoring_design.md`）。ユーザー判断待ち |
| FEAT-01 | 機能 | P2 | RDS / Cloud SQL / Azure Database 間の双方向レプリケーションに対応したい。今はレプリケーションの仕組みがない（パラメータに `binlog_format` / `wal_level` があるだけ） | `config/*/aurorards`, `config/google/cloudsql`, `config/azure/azuredatabase` | **まず方式の調査と設計を行う**（§5.3）。構造改善の後に着手する | 書き込みの競合解決、ID の衝突、レイテンシ、コスト。VPN 接続が前提になる | 要 | 方針確定（PostgreSQL、アクティブ / アクティブ、競合はアプリ側、CI/CD は各クラウドの仕組み、シークレットは初期値のみ cdktn）。cdktn 側の作業の承認待ち（`docs/ai/feat01_active_active_design.md` §9・§10） |

### 5.1 現在の README の問題点（DOC-03）

| # | 問題 | 例 |
|---|---|---|
| 1 | 概要・構成図・前提条件・セットアップ・デプロイ手順がなく、サービス別の注意事項だけが並んでいる | 冒頭が `# MultiCloud Container` → `# Description`（本文なし） |
| 2 | 同じ見出しが重複している | `## AWS ECS Note:` が2回 |
| 3 | コード例がそのままでは動かない | JSON に全角の引用符（`“Effect”`）、シェルに全角の `＄PROJECT`、プロジェクト名 `multicloud-sitevpn-project` の直書き |
| 4 | 古い情報・誤りがある | `cdktf destroy`（現在は cdktn）、`Aurura`、Filestore の節で「CloudFireStore API」（Filestore と Firestore の混同の可能性） |
| 5 | 書きかけの節がある | `- When calling \`destroy\`` の後が空 |
| 6 | 設定方法の説明がない | `commonsettings.ts` のフラグ、`.env`、証明書・鍵ファイルの置き場所 |
| 7 | 参照リンクが日本語ページ（`hl=ja`）で、英語の文書と合わない | Google Cloud のリンク |

### 5.2 ドキュメント構成案（英語）

| ファイル | 内容 | 時期 |
|---|---|---|
| `README.md` | Overview / features / supported services / quick start / links | DOC-03a（早め） |
| `docs/getting-started.md` | Prerequisites (CLI, credentials, required APIs and IAM permissions per cloud), `.env` setup, first deploy | DOC-03a |
| `docs/configuration.md` | All settings: feature flags, connections, naming, VPN address plan, secrets | 構造変更のフェーズごとに更新 |
| `docs/operations.md` | Deploy / diff / destroy procedures, and known issues per service (the current "Notes" sections, verified and deduplicated) | DOC-03a |
| `docs/architecture.md` | Layers (config → clouds/crosscloud → constructs), data flow, design rules | DOC-03b |
| `docs/networking/vpn.md` | Topologies (full mesh / hub), BGP & APIPA design, the `custom_bgp_addresses` lesson | DOC-03b |
| `docs/adding-a-cloud.md` | Step-by-step guide for adding a new cloud | DOC-03b |
| `docs/ai/` | AI 作業用の文書（このプランなど。日本語のまま） | 現状維持 |

### 5.3 FEAT-01（DB 双方向レプリケーション）の調査メモ

現時点での調査結果です（設計前のため、断定ではありません）。

- 各クラウドとも、外部の MySQL を**レプリケーション元にする片方向のレプリケーション**には対応している（Azure: Data-in Replication、Google: Cloud SQL の外部ソースからのレプリケーション、AWS: RDS の外部ソース設定）。
- RDS for MySQL の Group Replication（アクティブ/アクティブ）は、RDS インスタンス同士が対象。
- 異なるクラウドのマネージド DB 間で、すべてのノードに書き込めるマルチプライマリ構成は、MySQL / PostgreSQL の標準機能では難しい。書き込みの競合解決とレイテンシが課題になる。
- 調査・決定すべき事項:
  1. 本当に双方向（全ノード書き込み可）が必要か。片方向＋フェイルオーバーで要件を満たせないか
  2. エンジン（MySQL / PostgreSQL）
  3. 方式（ネイティブのレプリケーション / CDC ツール / マネージドの移行サービス / サードパーティ製品）
  4. 競合解決と主キーの採番方針
  5. コストとネットワーク要件（VPN 前提）

参考:
[RDS for MySQL Group Replication](https://aws.amazon.com/about-aws/whats-new/2023/11/amazon-rds-mysql-group-replication-plugin-active-active-replication/)、
[Relational Databases in Multi-Cloud](https://www.rapydo.io/blog/relational-databases-in-multi-cloud-across-aws-azure-and-gcp)

### 5.4 destroy の問題の調査結果（DEL-01〜03、2026-10-04）

ユーザー報告のエラー（destroy を再実行しても同じエラー）:

```
Error 400: The subnetwork resource '.../subnetworks/multicloud-gcp-vpc-proxy-subnet' is already
being used by '.../forwardingRules/run-regional-http-lb-http-fw', resourceInUseByAnotherResource

Error 400: The subnetwork resource '.../subnetworks/multicloud-gcp-vpc-app-subnet' is already
being used by '.../addresses/serverless-ipv4-1780124105971688226', resourceInUseByAnotherResource
```

| エラー | 原因 | 確認方法 |
|---|---|---|
| proxy-subnet が転送ルールに使われている | ① 転送ルールはプロキシ専用サブネットを属性で参照しないため、明示的な依存がないと Terraform が並行して削除する。② コードは依存を張るつもりだったが、`node.addDependency` が出力されず（DEL-01）、`dependsOn` もリージョンの比較が一致せず空だった（DEL-02） | `useContainers=true` で合成し、`google_compute_forwarding_rule.fw-run-regional-http-lb` と `null_resource.wait-destroy-*` の `depends_on` がすべて `[]` であることを確認。サブネットの `region` getter は `${TfToken[...]}` を返し、`"asia-northeast1"` と一致しない |
| app-subnet が `serverless-ipv4-…` に使われている | Cloud Run の Direct VPC egress が確保した IP は、サービス削除後 1〜2時間解放されない（[Google 公式](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc)）。依存順は正しくても、待機（240秒）では足りない。待機自体も DEL-01 により効いていなかった | 公式ドキュメント: "After you delete or move your Cloud Run resources, wait 1-2 hours for Cloud Run to release the IP addresses before you delete the subnet." |

---

## 6. 進め方（フェーズ）

各フェーズの終わりに §7 の検証を行い、ユーザーに `cdktn diff` を依頼する。

| フェーズ | 内容 | 対象ID | 合成結果 |
|---|---|---|---|
| 0 | 前提の整理と destroy の不具合修正 | SEC-02, SEC-03, REPO-01, CFG-01, DEL-01, DEL-02（DEL-03〜06 は修正後に再確認） | DEL-01/02 で `depends_on` が増える |
| 1 | 安全網とドキュメント（第1弾） | TST-01, DOC-03a, DOC-02 | 変化なし |
| 2 | 接続モデルの一元化と、機能の VPN 非依存化 | ARC-01, ARC-10, ARC-11 | **ARC-10 で変化あり**（意図した変化か `cdktn diff` で確認） |
| 3 | プロバイダ・クラウド登録表・コンテキスト | ARC-02, ARC-03, ARC-07, CON-02 | 変化なし |
| 4 | 命名の設定化 | NAM-02 | 変化なし（既定値で現在の名前を再現する） |
| 5 | VPN の汎用化 | ARC-04, ARC-05, ARC-06, TYP-03 | 変化なし |
| 6 | プライベートDNS のペア分割 | ARC-08 | 変化なし |
| 7 | オーケストレータの分割と型 | ARC-09, TYP-01, TYP-02, CON-03 | CON-03 のみ挙動変更 |
| 8 | 規約・綴り・ドキュメント（第2弾） | NAM-01, CON-01, CFG-02, DOC-01, DOC-03b | 変化なし |
| 9 | 新機能 | FEAT-03（監視・オートスケーリング、設計から）、FEAT-01（調査・設計から）、FEAT-02（ユーザーの検討結果を待って） | 設計しだい |
| 保留 | 運用基盤 | SEC-04, ARC-12 | 個別に設計する |

---

## 7. 検証方法

| 方法 | 内容 | 実行者 |
|---|---|---|
| 型チェック | `npx tsc --noEmit -p .` | Claude（承認済み） |
| 合成結果の比較 | `Testing.synth` でスタック全体を合成し、`env` × 3つの接続フラグの全16通りを変更前後で比較する（TST-01 でテスト化予定） | Claude |
| construct 単体の比較 | 対象 construct を直接合成し、変更前後で比較する | Claude |
| `cdktn synth` / `cdktn diff` | 実際の差分確認 | **ユーザー**（AGENTS.md §14） |
| `npm run build` | 実行禁止（AGENTS.md） | — |

---

## 8. 完了済みの作業（旧VPN再構成プラン）

| 内容 | 完了日 | 備考 |
|---|---|---|
| Azure をハブにした VPN のルート伝播を修正 | 2026-10-04 | 原因: Azure 接続の `custom_bgp_addresses` が未指定だったこと、および Google–Azure HA トンネルの対向インスタンスの不整合。実機で確認済み |
| AWS–Google の強制メッシュ化ロジックを削除 | 2026-10-04 | `awsToGoogle` を「直接接続するかどうか」の意味に是正 |
| デッドコード削除（Route Server / Virtual WAN と関連型） | 2026-10-04 | |
| construct の single / HA 関数分離（`azurevpngw.ts`, `azurelocalgwcon.ts`） | 2026-10-04 | `cdktn diff` 差分なし |
| `vpnResources.ts` をペア別モジュールに分割（`resources/vpn/`） | 2026-10-04 | `cdktn diff` 差分なし |
| destroy 順序の不具合修正（DEL-01/02）と Cloud Run の削除手順（DEL-03 案A） | 2026-10-04 | `utils/terraformDependency.ts` の `addTerraformDependency` に置き換え（50箇所）。プロキシサブネットを config のリージョンで対応付け。効かない app-subnet 待機を削除し、README に2回 destroy の手順を記載。全32パターン（env × 接続 × 機能セット）で `depends_on` 以外の差分なし・循環依存なしを確認。`cdktn synth/diff` はユーザー確認待ち |
| フェーズ0・1（SEC-02/03, CFG-01, TST-01, DOC-02, DOC-03a） | 2026-10-04 | `.gitignore` に秘密鍵・PFX・公開鍵・`.env`・Jest snapshot（DB パスワードを含むため）を追加。証明書パスワードと Google–Azure PSK を `config/.env` へ移動（値は同一、合成結果は全32パターン一致）。tsconfig の存在しない include を削除。回帰テスト（32パターン×4項目=128件）と比較スクリプトを追加。README（ルート・app）を英語で再構成し、`docs/getting-started.md` / `docs/operations.md` を新設 |
| フェーズ2（ARC-01 一部, ARC-10, ARC-11） | 2026-10-04 | `commonsettings.ts` を再構成（クラウド別の `clouds.<cloud>.enabled` / `features`。グローバルの `use*` フラグと VPC 設定の `isEnabled` を廃止）。判定関数 `config/features.ts`（`isCloudEnabled` / `isFeatureEnabled`）と `config/connections.ts`（`vpnConnections` / `isConnected` / `isCloudConnected`）を追加し、オーケストレータ・プライベートDNS・VPN の判定を置き換え。機能を VPN 非依存化。合成結果: 全クラウドが接続に参加する16パターンは完全一致、それ以外は非参加クラウドの機能リソースの追加のみ（削除・変更 0）。テスト128件成功 |
| フェーズ3（ARC-02, ARC-03, ARC-07, CON-02 一部） | 2026-10-04 | `providers/providers.ts` を唯一のプロバイダ宣言場所に（リージョン等は `config/<cloud>/common.ts` から。null provider は `providers.null(alias)` で必要時に生成し、construct 内の生成を削除）。`clouds/types.ts`（`CloudOutputs` / `CloudModule` / `CloudContext`）と `clouds/registry.ts` を追加し、Stack はクラウド名を持たない形に。VPN（9引数）・プライベートDNS（15引数）を `CloudContext` 1引数に。VPN のペア関数を `(ctx, resources, isSingleTunnel)` に統一。Google 設定の `"asia-northeast1"` 直書き9箇所を `LOCATION` 参照に。合成結果は全32パターン完全一致、テスト128件成功 |
| フェーズ4（NAM-02） | 2026-10-04 | 全リソース名・内部要素名を各機能の設定ファイルで指定可能に（AWS 10種、Google 7グループ、Azure 7グループ）。名前省略時は `<PROJECT_NAME>-<cloud>-<type>[-<key>]`（`config/naming.ts` の `PROJECT_NAME` は仮に `multicloud`）。現在の名前はすべて設定ファイルに明示したため実際の名前は不変。合成結果: 他リソース属性への参照式だった名前204件（Google 単一トンネル転送ルール、Azure LNG/接続/診断設定）が文字列になったが、解決後の値はすべて一致。それ以外は完全一致、テスト128件成功。対象外: クラウド側で固定の名前、DNS レコード名、construct ID 用の値、未使用コード（DEAD-01） |
| フェーズ5（ARC-04, ARC-05, ARC-06, TYP-03） | 2026-10-04 | APIPA と Google–Azure PSK を `config/vpn/addressPlan.ts` に集約（「どちら側のアドレスか」が分かる形に）。Azure VNG construct からペア名入りの固定項目を除去し、インスタンスごとの APIPA 配列を受け取る形に（有効ペアから `resources/vpn/helpers.ts` の `azureVngApipaAddresses()` で組み立て、順序は従来どおり AWS→Google）。旧設定 `azureAwsVpnparams` / `azureGoogleVpnparams` / `azureVpnGatewayParams` と `createLocalGatewayParams` の未使用引数を削除（VNG 名は `azureVpnparams.vpnGatewayName` へ）。`VpnResources` を `gateways` / `connections` に再構成。合成結果は全32パターン完全一致、テスト137件成功 |
| フェーズ6（ARC-08） | 2026-10-04 | `privateZoneResources.ts`（884行）を `resources/privatezone/` に分割: `helpers.ts`（共通関数）、`aws.ts` / `google.ts` / `azure.ts`（各クラウド側の DNS）。エントリポイントは呼び出し順だけを残す（約200行）。既存コードがクラウド単位の関数で構成されており、ペア単位に分けるには「複数ペアの転送ルールを1つのエンドポイントにまとめる」などの処理の作り直しが必要なため、移動のみで済むクラウド単位を採用。関数本体は変更なし。合成結果は全32パターン完全一致、テスト137件成功 |
| フェーズ7（ARC-09, TYP-02 一部） | 2026-10-04 | 3つのオーケストレータ（514〜725行）を `clouds/<cloud>/` に分割: `index.ts`（土台: VPC 等。AWS は CloudWatch/IAM、Azure は Monitor も）と機能ごとのファイル（dns / storage / database / compute / container / cicd）。セクション間で受け渡す値は `context.ts` の `<Cloud>BuildContext` にまとめた（Google の `psaDependencies` は書き換え可能な項目として `ctx.psaDependencies` で参照）。セクションの中身は変更なし。`resources/{aws,google,azure}Resources.ts` を削除し、登録表の参照先を変更。`interfaces.ts` から未使用の型19個と重複定義を削除（39→20型）。合成結果は全32パターン完全一致、テスト137件成功。CON-03 は対象一覧を作成しユーザー判断待ち: (1) `clouds/aws/index.ts` getSecurityGroupId: 未知の SG 名で警告し不正な値 `default-security-group-id` を返す → エラー推奨 (2) `clouds/azure/database.ts`: VNet 未初期化で警告し DB をスキップ（実質起きない条件） (3)(4) `clouds/aws/container.ts`: 証明書 IMPORT のパス未指定 / ファイルなしで警告し証明書なしで続行 → エラー推奨 (5) 同: AWS_MANAGED の検証用 DNS ゾーンなし（dns 機能 OFF）で警告し証明書なしで続行 → 要判断 (6) `googleprivatezone.ts`: 転送先がない場合にプライベートゾーンへ切り替え（意図した代替動作）→ 警告のまま推奨。ほかに進捗表示の `console.log` が6箇所 |
| CON-03 / TYP-01 / TYP-02 | 2026-10-04 | CON-03: `clouds/aws/index.ts` の getSecurityGroupId を、未知の名前でエラーにする形に変更（他は現状維持）。TYP-02: `interfaces.ts` を `clouds/{aws,google,azure}/types.ts`・`resources/vpn/types.ts`・`clouds/common.ts` に分割し、22ファイルの import を更新。TYP-01: 型定義（AWS VPC のサブネット・ルートテーブル、ALB のリスナールール、Azure の VNet・DB・Log Analytics、VPN の gateways / connections）とコンテキスト（Google subnetsByName・psaDependencies、Azure acrRegistryMap）を具体的な型に。Azure VNet の不要な `{ name }` 型を削除。VPN ヘルパーを Google ゲートウェイの実型で受け取る形にし、ゲートウェイの存在確認 `requireGateway()` と AWS トンネル属性の取得 `awsTunnel()` を追加（文字列でキー名を組み立てる読み方を廃止）。AWS の EFS / EC2 / RDS construct のサブネット引数を `{ id }` に緩和（`id` のみ使用）。`any`: resources 63→21、clouds 61→46。合成結果は全32パターン完全一致、テスト137件成功 |
| TYP-04 / フェーズ8（NAM-01, CON-01, CFG-02 一部, DOC-01, DOC-03b） | 2026-10-04 | TYP-04: `clouds/` の `(config as any)` を除去（多くは推論で解消、ALB / Application Gateway の設定配列に `AwsAlbSettings` / `AzureAppGwSettings` 型を追加、`securityGroupMapping` を `Record<string, string>` に修正、Container Apps のサブネット ID を任意項目に、Google リージョナル LB のバックエンド型を修正）。clouds の any 0。NAM-01: 綴り誤りのファイル・ディレクトリ5件と識別子2種を修正。CON-01 / DOC-01: `AGENTS.md` を更新（構成・設定ルール・construct 規約・変更履歴ルール）し、重複ルール文書を参照のみに。CFG-02: package.json の `main` / `types` を削除。DOC-03b: `docs/architecture.md`、`docs/networking/vpn.md`、`docs/adding-a-cloud.md` を新設。合成結果は全32パターン完全一致、テスト137件成功。新規課題 SEC-05（ECS 設定のパスワード直書き） |
| CON-04 / SEC-05 / DEAD-01 / NAM-03 | 2026-10-04 | CON-04: null provider を alias なしの1つ（`providers.null()`）に統一。合成結果は provider ブロック（2個→1個、alias 削除）と Cloud Run 削除待ちリソースの `provider`（`null.null-gcp-wait`→`null`）のみ変化。SEC-05: ECS worker-service の `POSTGRES_PASSWORD` を `ECS_WORKER_POSTGRES_PASSWORD` として `.env` へ（値は同一）。DEAD-01: 未使用コードを削除（`GcpMonitoringResources` は FEAT-03 用に残置）。NAM-03: construct ID を `key ?? name` に（66箇所、22インターフェース）。名前変更時に `key` へ旧名を書けばアドレスが保たれることを確認。CON-04 以外は合成結果完全一致、テスト137件成功 |
| NAM-04 | 2026-10-04 | AWS IAM のロール・ポリシー・インラインポリシー・ポリシー付与の construct ID から一覧の順番を外し、`key ?? name` から作る形に（IAM の名前は一意のため衝突しない。重複すると合成時にエラー）。合成結果は IAM リソースのアドレス（1パターンあたり15個）とその参照のみ変化し、それ以外は全32パターン一致。テスト137件成功 |
