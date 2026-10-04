# VPN構成 再構成計画

- 作成日: 2026-09-06
- ステータス: 計画段階（未実施）。次回作業時はこのファイルを読んでから着手すること。
- スコープ: `app/resources/vpnResources.ts`, `app/config/{aws,azure,google}/vpn.ts`,
  `app/constructs/vpnnetwork/*.ts`, `app/resources/interfaces.ts`（VPN関連型のみ）

## 0. 目的

- VPN関連コードの複雑さを低減する。
- 開発(dev=シングルトンネル)/本番(prod=HA)のスイッチ機構
  (`config/commonsettings.ts` の `env` → `isSingleTunnel`)は**維持する**。
- 将来的に別クラウドが増える想定を維持し、拡張しやすい構造にする。
- `commonsettings.ts` の `awsToGoogle` / `awsToAzure` / `googleToAzure` は
  「そのペア間を**直接**接続するかどうか」を文字通り意味する仕様に是正する
  （後述、現状はここが崩れている）。

## 1. 現状分析で判明した事実

### 1.1 ファイル構成

- `resources/vpnResources.ts`（839行）: AWS/Google/Azure 3ペアのVPN配線を
  1ファイルでオーケストレーション。ヘルパー関数群とペアごとのsetup関数が同居し、
  `any` 型が多用されている。直近のコミット `cb741db vpn resource build module refactor`
  で `hubGatewaySteps` / `pairwiseConnectionSteps` という配列駆動構造に整理済み。
- `config/{aws,azure,google}/vpn.ts`: クラウドごとのVPNパラメータ
  （single/HA共通の1オブジェクトに混在）。
- `constructs/vpnnetwork/*.ts`: 実リソース定義。
  - `googlevpngw.ts` / `googletunnels.ts` は既に single用/HA用の内部関数に分離済み
    （`createSingleTunnelVpnGateway`/`createHaVpnGateway`,
    `createSingleTunnel`/`createHaTunnel`）。
  - `azurevpngw.ts` / `azurelocalgwcon.ts` / `awscgw.ts` は
    1関数内に三項演算子・if分岐でsingle/HA両方のロジックが混在（構造が不統一）。
- `constructs/vpnnetwork/azurerouteserver.ts` /
  `constructs/vpnnetwork/azurevirtualwan.ts`: **未結線（デッドコード）**。
  `vpnResources.ts` から一切呼ばれていない。
  `resources/interfaces.ts` 内の `AzureRouteServerConfig` /
  `AzureVirtualWanResources` / `BgpConnectionConfig` /
  `GoogleBgpConnectionConfig` / `NsgRuleConfig` も同様に未使用。

### 1.2 「Azureハブ」構成の既知の問題（重要）

- 2025-08-10 のコミット `6981fcd`（`multicloudvpn` 時代、コミットメッセージ
  「azure hub modified」）で、`awsToGoogle=false, awsToAzure=true,
  googleToAzure=true`（Azureを経由してAWS-Google間を疎通させる「ハブ構成」）
  を試みた形跡がある。
- 同コミットで **Azure→Googleへのルート伝播がうまくいかなかった**
  （ユーザー確認済み。**HA構成の時のみ発生**、dev/シングルトンネルでは
  静的ルート方式のため問題なし）。
- その場当たり的な対策として、`vpnResources.ts` に以下のロジックが追加され、
  現在も残っている:

  ```ts
  const isGoogleToAzureHaEnabled =
    awsToAzure && googleToAzure && !isSingleTunnel && !!googleVpcResources;
  return Boolean(
    isGoogleToAzureHaEnabled || (awsToGoogle && googleVpcResources),
  );
  ```

  この条件により、**`awsToGoogle=false` でも** `awsToAzure && googleToAzure`
  かつHAであれば `setupAwsToGoogleVpn`（AWS-Google間の直接トンネル）が
  強制的に実行される。つまり「ハブ構成」を意図した設定をしても、
  実際には AWS-Google 間が直接メッシュ接続されてしまい、
  ユーザーが意図する「各フラグの意味」と矛盾している。
- `azurerouteserver.ts` / `azurevirtualwan.ts` は、同じルート伝播問題への
  別解決策（Azure Route Server または Virtual WAN経由でのハブ構成）として
  着手されたが、上記のメッシュ化ワークアラウンドを採用したため
  結線されずに残された、と推測される（コミット履歴・コメントに明言はなし）。

### 1.3 Microsoft公式ドキュメント調査結果

- Azure VPN Gateway（Route-based、BGP有効）は、**同一ゲートウェイ上の
  複数サイト間接続でBGPルートを自動的に中継（トランジット）する機能を
  標準サポートしている**。Route ServerやVirtual WANは本来不要。
  - 出典: [About BGP with VPN Gateway](https://learn.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-bgp-overview)
    "BGP can enable transit routing among multiple networks by propagating
    routes a BGP gateway learns from one BGP peer to all other BGP peers."
  - 出典: [Azure VPN Gateway FAQ](https://learn.microsoft.com/en-us/azure/vpn-gateway/vpn-gateway-vpn-faq)
    "What address prefixes do Azure VPN gateways advertise to me? ...
    Routes learned from other BGP peering sessions connected to the VPN
    gateway, except for the default route or routes that overlap with any
    virtual network prefix"
- Route Serverが必要になるのは「ExpressRouteとVPNの共存」や
  「NVA（サードパーティアプライアンス）とのBGP交換」のケース
  （[Azure Route Server support for ExpressRoute and Azure VPN](https://learn.microsoft.com/en-us/azure/route-server/expressroute-vpn-support)）。
  今回の「同一VNGに複数S2S(BGP)接続がある」構成には該当しない。
- コードレビューでは、Azure/AWS/Google間のAPIPAアドレス割当・ASN設定に
  明らかな矛盾は見つからなかった（`/30`ペアリングは整合していた）。
- **結論（未確定）**: ルート伝播失敗はAzureのプラットフォーム制約ではなく、
  設定または実装の不備である可能性が高い。ただし実機検証
  （BGPセッション状態、Azure/Google双方のlearned/advertised routes）を
  行っていないため断定はできない。

## 2. 目指す仕様（ユーザー確認済み）

- `awsToGoogle` / `awsToAzure` / `googleToAzure` の各フラグは文字通りの意味を持つ。
  `false` のペアは直接トンネルを張らない。
- 3つとも `true` → フルメッシュ（3ペア全部直接接続）。
- 2つ `true`、1つ `false`（例: `awsToGoogle=false`,
  `awsToAzure=true`, `googleToAzure=true`）→ `false`のペアは直接接続せず、
  共通の接続先（この例ではAzure）をハブとしたBGPルート伝播で
  三者間通信が成立すること。

## 3. 実施方針（段階的。フェーズごとに検証・承認を挟む）

### フェーズA: ルート伝播の実機検証・是正（最優先、機能修正）

ユーザー方針: 「今回の再構成の過程で確認していく」→ 単純化作業と並行して進める。

1. 現行の強制メッシュ化ロジック（`isGoogleToAzureHaEnabled`）は
   **一旦そのまま残す**（現状の疎通を壊さないため）。
2. `awsToGoogle=false, awsToAzure=true, googleToAzure=true`, HA環境で
   実際にデプロイし、以下を確認する（ユーザー側での実施が必要）:
   - Azure Portal: 各 Virtual Network Gateway Connection
     （Azure-AWS用、Azure-Google用）の「学習したルート」「アドバタイズされた
     ルート」タブで、AWSのCIDRがGoogle向け接続にも伝播しているか。
   - Google Cloud Console: Cloud RouterのBGPセッションステータス
     （Established か）、学習ルート一覧にAzure経由のAWS CIDRがあるか。
   - AWS側: VGWのRoute Propagationが有効なルートテーブルに
     Azure/Google双方のCIDRが反映されているか。
3. 原因が判明したら、最小限の設定修正を提案し、承認を得てから実施する。
   疑わしい箇所（要検証、断定はしていない）:
   - `constructs/vpnnetwork/googlevpngw.ts` の Cloud Router
     `advertiseMode` 設定（`customIpRanges` 設定時のみ `CUSTOM`、
     それ以外はデフォルト。この違いが影響していないか）。
   - Azure側 `peeringAddresses` とローカルネットワークゲートウェイの
     `bgpPeeringAddress` の対応関係（現状レビューでは整合していたが、
     実機のBGPセッション確立状況と突き合わせる）。
4. 修正後、`awsToGoogle=false` で三者間疎通が確認できた場合:
   - `isGoogleToAzureHaEnabled` による強制メッシュ化ロジックを削除し、
     各フラグ本来の意味（直接接続の有無）に是正する。
   - `azurerouteserver.ts` / `azurevirtualwan.ts` は不要と確定し、削除する
     （フェーズ0で実施）。
5. 確認の結果、pure VNGでは伝播不可能と判明した場合:
   - `azurerouteserver.ts` / `azurevirtualwan.ts` を正式に完成させ、
     `vpnResources.ts` に結線する対応に切り替える。この場合は別途詳細設計・
     承認が必要（インターフェース設計、hubGatewaySteps への追加方法など）。

**リスク**: 高（実インフラの動作検証を伴う。本番相当のVPN接続に影響し得るため、
必ず検証用スタック/非本番環境で先に確認すること）。

### フェーズ0: デッドコード整理（フェーズA完了後に実施）

- `azurerouteserver.ts` / `azurevirtualwan.ts` の要否がフェーズAで確定してから、
  削除（不要と確定した場合）または正式統合（必要と確定した場合）を行う。
- 関連する `resources/interfaces.ts` 内の未使用型
  （`AzureRouteServerConfig`, `AzureVirtualWanResources`,
  `BgpConnectionConfig`, `GoogleBgpConnectionConfig`, `NsgRuleConfig`）も
  同様に整理する。

### フェーズ1: construct単位でのsingle/HA分離の統一

- 対象: `azurevpngw.ts`, `azurelocalgwcon.ts`, `awscgw.ts`
- 内容: `googlevpngw.ts`/`googletunnels.ts` に倣い、single用/HA用の
  内部関数に分離する（**ロジックは変更せず、構造整理のみ**）。
- 検証: リファクタ前後で `cdktf synth` 相当の差分が出ないことを確認
  （ユーザーに `cdktf diff` 実行を依頼）。

### フェーズ2: `vpnResources.ts` の分割

- クラウドペアごとにファイル分割する（例:
  `resources/vpn/awsGoogleVpn.ts`, `awsAzureVpn.ts`, `googleAzureVpn.ts`）。
- 共通ヘルパー（`getVpnGatewayIpAddresses`, `getCloudRouter`,
  `extractAwsVpnTunnels`, `getCgwLogGroupArn` 等）を
  `resources/vpn/helpers.ts` 等に集約する。
- `createVpnResources()` のエントリポイントは `resources/vpnResources.ts` に
  残し、分割したモジュールをimportして `hubGatewaySteps` /
  `pairwiseConnectionSteps` の構成は維持する。
- 将来のクラウド追加のしやすさ（現状のファイル内コメント
  「How to add a new cloud provider」の手順）を維持・強化する。
  各 `setup<Cloud>To<Cloud>Vpn` 関数のシグネチャの一貫性を保つ。
- 検証: snapshotテスト（`__tests__/__snapshots__/app-test.ts.snap`）比較。

### フェーズ3（保留、要相談）

- config層でsingle/HA専用フィールドを分離する等、データモデル自体の見直し。
- 今回はスコープ外。必要になった時点で改めて提案する。

## 4. 開発/本番スイッチの扱い

- `config/commonsettings.ts` の `env` → `isSingleTunnel` の導出ロジックは
  **変更しない**。
- 各フェーズはこのスイッチの機能を損なわないことを、snapshotテスト等で
  確認しながら進める。

## 5. 検証方法まとめ

- フェーズ1・2: `cdktf synth` 相当の差分確認、snapshotテスト比較
  （ユーザー側で `cdktf diff` 等を実行）。
- フェーズA: 実インフラでの検証が必須（BGPセッション状態、
  learned/advertised routesの確認）。ユーザー側で実施。
- `npm run build` の実行は禁止（AGENTS.md）。TypeScript診断が必要な場合は
  代替コマンドをユーザーに確認する。

## 6. 未解決・要確認事項

- Azure→Google ルート伝播失敗の具体的原因（フェーズAで調査予定、未確定）。
- `azurerouteserver.ts`/`azurevirtualwan.ts` の最終的な要否
  （フェーズA完了後に確定）。

## 7. 参考: 関連コミット

- `6981fcd` "azure hub modified"（2025-08-10）:
  `isGoogleToAzureHaEnabled` ロジックと `azurerouteserver.ts` /
  `azurevirtualwan.ts` が同時に追加されたコミット。
- `cb741db` "vpn resource build module refactor": `hubGatewaySteps` /
  `pairwiseConnectionSteps` 配列駆動構造への整理。

## 8. 補足: リポジトリ構成についての観察

- `app/` はGit管理外（リポジトリルートの `.gitignore` に `app` が
  指定されている）。実際にGit追跡されているソースは
  `multicloudContainer/` 配下（`multicloudContainer/resources/vpnResources.ts`
  等）。両者には差分があり、`app/` の方がやや新しい
  （`app/CLAUDE.md` に「作業ディレクトリは `app`」と明示されている）。
  今回の再構成は `app/` 配下のみを対象とし、`multicloudContainer/` への
  反映要否は別途ユーザーに確認すること。
