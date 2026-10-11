# VPN

[English](vpn.md)

## 方式

| `vpnMode`（`config/commonsettings.ts`、環境ごと） | トンネル | ルーティング |
|---|---|---|
| `singleTunnel` | 相手のゲートウェイごとにトンネル 1 本（Google は Classic VPN、Azure はアクティブ / スタンバイ） | 静的ルート |
| `haBgp` | HA: AWS の VGW（接続ごとにトンネル 2 本）、Google の HA VPN（インターフェース 2 つ）、Azure の VPN Gateway のアクティブ / アクティブ（インスタンス 2 つ） | BGP |

## 接続の形

ペアのフラグごとに、**直接**の接続が作られます。

| フラグ | 結果 |
|---|---|
| 3 つすべて | フルメッシュ |
| 2 つ（例: `awsToAzure` + `googleToAzure`） | 共通のクラウド（Azure）がハブになります。Azure の VPN Gateway は、ある BGP ピアから学習したルートをほかのピアに再広告するため、AWS と Google は Azure を経由して通信できます（`haBgp` のみ） |
| 1 つ | そのペアだけ |

## コードの構成

| ファイル | 役割 |
|---|---|
| `resources/vpnResources.ts` | 参加する各クラウドのハブのゲートウェイを作り（`hubGatewaySteps`）、有効なペアを順に処理します（`pairwiseConnectionSteps`） |
| `resources/vpn/awsGoogleVpn.ts`、`awsAzureVpn.ts`、`googleAzureVpn.ts` | ペアごとに 1 モジュール。シグネチャはすべて `(ctx: CloudContext, resources: VpnResources, isSingleTunnel: boolean)` |
| `resources/vpn/helpers.ts` | 共通の補助関数（`azureVngApipaAddresses()` など） |
| `config/vpn/addressPlan.ts` | BGP の内側のアドレス（APIPA）と、Google–Azure の事前共有鍵 |
| `config/<cloud>/vpn.ts` | クラウドごとのゲートウェイの設定、ASN、リソースの名前 |

ASN: AWS 64512、Google Cloud 65000、Azure 65515。

## BGP の内側のアドレス（haBgp）

各トンネルは /30 を 1 つ使い、両側に 1 つずつアドレスを割り当てます。`config/vpn/addressPlan.ts` に書きます。

| ペア | 並び |
|---|---|
| AWS–Azure | `tunnels[i][t]`: Azure のゲートウェイのインスタンス `i`（= AWS の VPN 接続 `i`）、AWS のトンネル `t` |
| Google–Azure | `tunnels[i]`: Azure のゲートウェイのインスタンス `i`（= Google の HA VPN のインターフェース `i`） |

AWS–Google は、AWS が割り当てる内側のアドレスを使います。

ルール（`__tests__/addressPlan.test.ts` で確認します）: 両方のアドレスが /30 のホストアドレスであること、範囲が重ならないこと、Azure 側のアドレスが 169.254.21.0〜169.254.22.255 の中にあること。

## ハブ構成が動くための条件

以下は、Azure をハブにしたときにルートが伝わらなかった原因です。今はコードとテストで守られています。

1. **Azure の接続は、使う APIPA アドレスを固定する必要があります。** Azure の VPN Gateway は、インスタンスごとに複数のカスタム APIPA アドレスを持ちます（AWS のトンネルごとに 1 つと、Google 用に 1 つ）。各接続は `custom_bgp_addresses`（プライマリ: インスタンス 1、セカンダリ: インスタンス 2）を設定します。設定しないと、Azure はすべての接続で最初の APIPA アドレスを使い、Google との BGP セッションが確立しません（[Microsoft のドキュメント](https://learn.microsoft.com/azure/vpn-gateway/vpn-gateway-howto-aws-bgp)）。
2. **Google の HA トンネルは、自分の BGP アドレスを持つ Azure のインスタンスで終端する必要があります。** トンネル `i` は Azure のパブリック IP `i` に向かい、その BGP ピアは同じインスタンスの `tunnels[i].azureIp` です。
3. **Azure のゲートウェイは、有効なすべてのペアの Azure 側のアドレスを持つ必要があります。** `azureVngApipaAddresses()` が、有効なペアから集めます（`AZURE_APIPA_SOURCES`）。

注意: AWS–Google を直接つないでいる場合、AWS VPN CloudHub が AWS の VGW を通して Azure と Google の間のルートを再広告することがあります。そのため、Azure–Google の BGP セッションが壊れていても気づきにくくなります。

## deploy 後の BGP の確認

- Azure ポータル: VPN Gateway → BGP ピア（すべて「接続済み」）と、学習したルート
- Google Cloud コンソール: Cloud Router → BGP セッション（「確立」）と、学習したルート
- AWS: VGW のルート伝播を有効にしたルートテーブルに、相手の CIDR があること

セキュリティグループ、NSG、Google Cloud のファイアウォールルールでも、相手の CIDR を許可してください。
