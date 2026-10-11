# クラウドの追加

[English](adding-a-cloud.md)

この手順では、仮のクラウド `oci` を例にします。既存のクラウドのモジュール、スタック、ほかのクラウドの construct は変更不要です。

## 1. 設定

1. `config/commonsettings.ts`
   - `CloudId` に `"oci"` を追加します。
   - `clouds` に `oci` の項目（`enabled`、`features`）を追加します。
   - 既存のクラウドとのペアごとに、ペアのフラグ（例: `ociToAzure`）を追加します。
2. `config/connections.ts`: ペアのフラグを `connectionFlags` に追加します。
3. `config/oci/`: クラウドごとの設定。`common.ts`（リージョン）と、リソースの名前を含みます（[getting-started.ja.md](getting-started.ja.md#リソースの名前) の「リソースの名前」を参照）。

## 2. Provider

`providers/providers.ts`: provider を宣言し、`Providers` に追加します。

## 3. Construct

`constructs/<カテゴリ>/oci<サービス>.ts`。`AGENTS.md` の §9.1 に従います。関数は `createOci<対象>(scope, provider, params)` の形にし、名前はパラメータから受け取り（省略時は `resourceName()`）、順序は `addTerraformDependency()` で指定します。

## 4. クラウドのモジュール

1. `clouds/oci/types.ts`: モジュールの出力（`OciResourcesOutput`）とそのほかの型。
2. `clouds/oci/context.ts`: 機能のモジュールの間で共有する値。
3. `clouds/oci/index.ts`: 基盤（ネットワーク）と、機能ごとの呼び出し。`isCloudEnabled("oci")` / `isFeatureEnabled("oci", ...)` で判定します。
4. `clouds/oci/<機能>.ts`: 機能ごとに 1 ファイル。
5. 登録します。
   - `clouds/types.ts`: `CloudOutputs` に `oci: OciResourcesOutput` を追加します。
   - `clouds/registry.ts`: `oci: createOciResources` を追加します。

## 5. VPN（ほかのクラウドとつなぐ場合）

1. `resources/vpnResources.ts`: OCI のゲートウェイを `hubGatewaySteps` に追加します（`isCloudConnected("oci")` で判定）。
2. `resources/vpn/<ペア>.ts`: ペアごとに 1 モジュール（例: `ociAzureVpn.ts`）。シグネチャは `(ctx, resources, isSingleTunnel)` です。`pairwiseConnectionSteps` に登録します。
3. `config/vpn/addressPlan.ts`: ペアの BGP の内側のアドレス。Azure とつなぐペアの場合は、`AZURE_APIPA_SOURCES`（`resources/vpn/helpers.ts`）に項目を追加します。
4. `resources/vpn/types.ts`: `VpnResources.gateways` にゲートウェイを追加し、必要なら `VpnConnectionResources` にリソースの種類を追加します。

[networking/vpn.ja.md](networking/vpn.ja.md) を参照してください。

## 6. プライベート DNS（必要な場合）

OCI 側の `resources/privatezone/oci.ts` を追加し、`resources/privateZoneResources.ts` から呼び出します。

## 7. テストと確認

1. `scripts/dev/synthMatrix.ts`: `FEATURE_SETS.allOn.clouds` に `oci` を、マトリクスに新しいペアのフラグを追加します。
2. `__tests__/synth-matrix.test.ts`: 新しいペアの VPN の確認を追加します。
3. `npx tsc --noEmit -p .`、`npx jest __tests__/synth-matrix.test.ts __tests__/addressPlan.test.ts` を実行し、その後 `cdktn diff` を確認します。
