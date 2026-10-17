# Multi-Cloud Backend

[English](README.md)

**AWS、Google Cloud、Azure** にまたがるバックエンドを、[CDK Terrain (cdktn)](https://github.com/open-constructs/cdk-terrain) と TypeScript でコード化したものです。

- クラウド間のサイト間 VPN（フルメッシュ、または 1 つのクラウドを経由するハブ & スポーク）
- クラウドごとのネットワーク、VM、マネージド DB、ファイルストレージ、マネージドコンテナ、ロードバランサー、公開 / プライベート DNS、CI/CD。どれもフラグで ON/OFF できます
- 環境（`dev`、`stg`、`prod`）ごとに別のクラウドのアカウントを使い、`DEPLOY_ENV` で選びます
- トンネル 1 本の VPN と、HA（BGP）の VPN を選べます

## リポジトリの構成

| パス | 内容 |
|---|---|
| `app/` | cdktn のアプリケーション（正となるソース）。[app/README.ja.md](app/README.ja.md) を参照 |
| `Dockerfile`、`compose.yaml` | Node.js、cdktn CLI、Terraform、OpenTofu の入ったコンテナ |
| `.env.sample` | ツールのバージョンのテンプレート（`.env`） |
| `.env.ENV.sample` | 1 つの環境の認証情報と秘密の値のテンプレート（`.env.<環境名>`） |

## クイックスタート

必要なもの: Docker と Docker Compose、deploy 先のクラウドのアカウント。

```bash
git clone https://github.com/Otazoman/cdktn_multicloud_backend.git
cd cdktn_multicloud_backend

cp .env.sample .env            # ツールのバージョン
cp .env.ENV.sample .env.dev    # dev 環境の認証情報と秘密の値
DEPLOY_ENV=dev docker compose -p cdktn-dev up -d --build
docker compose -p cdktn-dev exec cdktn-backend bash

# コンテナの中（作業ディレクトリ: /app）
npm install
cdktn diff                     # plan を確認する
cdktn deploy                   # リソースを作る
```

最初の deploy の前に、クラウド側の準備（必要な API、IAM の権限、証明書と鍵）を済ませてください。手順は [app/docs/getting-started.ja.md](app/docs/getting-started.ja.md) にあります。

すべてを削除するには `cdktn destroy` を実行します。サービスによっては追加の作業や 2 回目の実行が必要です。[app/docs/operations.ja.md](app/docs/operations.ja.md) を参照してください。

## ドキュメント

- [はじめに](app/docs/getting-started.ja.md) — 前提、認証情報、設定、初回の deploy
- [運用](app/docs/operations.ja.md) — deploy / destroy の手順と、サービスごとの既知の問題
- [アーキテクチャ](app/docs/architecture.ja.md) — 層、処理の流れ、設計のルール
- [VPN](app/docs/networking/vpn.ja.md) — 接続の形、BGP / APIPA の設計
- [クラウドの追加](app/docs/adding-a-cloud.ja.md) — 手順
- [設定リファレンス](app/docs/configuration/README.ja.md) — すべての設定項目
- [アプリケーションの概要](app/README.ja.md) — ディレクトリ構成と開発用のコマンド

## ライセンス

[MIT](LICENSE)
