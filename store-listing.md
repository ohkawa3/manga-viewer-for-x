# Chrome ウェブストア 提出用の文面（下書き）

ストアのダッシュボードに貼り付けるための下書きです。拡張機能そのものには含まれません（zip には入りません）。

## 1. 掲載情報

### 名前
Manga Viewer for X

### 概要（132文字以内。manifest の説明と同じ）
- ja: X（旧Twitter）の画像をクリックすると、最高画質・縦連結・同一投稿者のスレッド通しで表示するビューアを開きます（非公式）。
- en: Click an image on X (Twitter) to read it in a vertical manga viewer: original quality, same-author threads in order. Unofficial.

### 詳細な説明（日本語）
X（旧Twitter）に投稿された漫画を、ページをめくるように縦につなげて読めるビューアです。

■ できること
・ツイートの画像をクリックすると、全画面のビューアが開きます
・同じ投稿者のスレッド（連続返信）の画像を、投稿順に縦に連結して表示
・常に最高画質（元画像）で表示
・タイムラインや検索から開いても、裏で詳細ページへ移動してスレッド全体を読み込み、閉じると元の画面に戻ります
・中クリック / Ctrl(⌘)+クリックで、新しいタブにビューアを開く

■ 表示モード（キー 1〜6 でも切り替え）
同幅 / 同倍 / 横幅 / 高さ / 自動 / 原寸
・同幅：すべての画像を同じ幅にそろえて読む
・同倍：同じ解像度で描かれた連続投稿を、同じ倍率で表示（画像の大きさの違いがそのまま出る）

■ 操作
クリックで次の画像、Shift+クリックで前の画像、Ctrl+ホイールで拡大縮小、Escで閉じる。右上のツールバーは普段は透明で、マウスを乗せたときだけ表示されます。

■ 設定
拡張機能のオプションで、起動時の表示モードと基準幅を変えられます。

■ プライバシー
個人情報や利用状況を収集・送信しません。権限は設定の保存（storage）だけです。画像は X が表示しているのと同じ場所から読み込みます。

■ ご注意
・X社とは無関係の非公式ツールです。無料で、広告はありません
・スレッドを読み込むため、ビューアを開くとページを自動でスクロールします（最大約35秒）。X 側では通常の閲覧と同じ表示として記録される場合があります
・X の画面構造が変わると、動かなくなることがあります
・ソースコード（MIT ライセンス）: https://github.com/ohkawa3/manga-viewer-for-x

### Detailed description (English)
A viewer that lets you read manga posted on X (formerly Twitter) by stitching images vertically.

FEATURES
- Click an image in a tweet to open a full-screen viewer
- Images from the same author's thread (consecutive replies) are stitched vertically in posting order
- Always the original, best-quality image
- Opened from the timeline or search, it loads the whole thread via the tweet page in the background and returns you to where you were when you close it
- Middle-click / Ctrl(⌘)+click opens the viewer in a new tab

VIEW MODES (also keys 1–6)
Equal / Scale / Width / Height / Auto / Orig
- Equal: scale every image to the same width
- Scale: apply one scale to a series drawn at the same resolution (size differences are kept)

CONTROLS
Click: next image. Shift+click: previous. Ctrl+wheel: zoom. Esc: close. The toolbar at the top right is transparent until you hover over it.

SETTINGS
In the extension options you can choose the view mode used on open and the base width.

PRIVACY
It does not collect or transmit any personal or usage data. The only permission is storage (for saving your settings). Images are loaded from the same place X itself loads them from.

NOTES
- Unofficial tool, not affiliated with X Corp. Free, no ads
- To load a thread, the viewer scrolls the X page automatically (up to about 35 seconds). X may record this as normal page views
- It may stop working if X changes its page structure
- Source code (MIT License): https://github.com/ohkawa3/manga-viewer-for-x

### カテゴリ
ソーシャル＆コミュニケーション（候補。「エンターテイメント」でも可）

### 言語
日本語（既定は英語。manifest の `default_locale` が en のため）／英語

### 用意するもの
- スクリーンショット 1280×800（または 640×400）を1〜5枚：①ビューアで漫画を縦に読んでいる画面 ②ツールバーを表示した画面 ③設定画面 ④英語表示
- アイコン 128×128：`icons/icon128.png`
- プライバシーポリシーの URL：https://github.com/ohkawa3/manga-viewer-for-x/blob/main/PRIVACY.md
- （任意）小プロモーション画像 440×280

## 2. プライバシー項目の回答案

### 単一の目的（Single purpose）
X（旧Twitter）に投稿された画像を、漫画のように縦に連結して読めるビューアで表示する。
（EN: Show images posted on X in a viewer that stitches them vertically so manga can be read like a scroll.）

### 権限の理由（Permission justification）
- **storage**：表示モード・起動時のモード・基準幅・初回ヒント表示済みかを、ユーザーのブラウザに保存するため。外部へは送信しない。
  （EN: To save the view mode, mode on open, base width and the first-use hint flag in the user's browser. Nothing is sent anywhere.）
- **ホスト権限**：なし（`host_permissions` は使っていない）。コンテンツスクリプトは `https://x.com/*` と `https://twitter.com/*` でのみ動作。
- **コンテンツスクリプトの理由**：X のページ上で画像クリックを検出し、表示されている画像とスレッドを読み取ってビューアに表示するため。

### リモートコード（Remote code）
使用していない。すべてのコードは拡張に同梱（外部スクリプトの読み込み・`eval` なし）。

### データ使用（Data usage）の回答案
「収集するユーザーデータ」の項目は、**すべてチェックしない**（個人を特定できる情報、健康、財務、認証情報、個人的なやり取り、位置情報、ウェブ履歴、ユーザーの操作、ウェブサイトのコンテンツ、のいずれも収集・送信しない）。
- ページ上の画像やスレッドの内容は、ブラウザ内で表示のためだけに読み取り、外部へ送信・保存しない。
- 設定値は端末内（`chrome.storage`）にだけ保存する。

### 次の3つの証明（Certifications）にすべて同意
- 承認された用途以外で、ユーザーデータを第三者に販売・転送しない
- 単一の目的と無関係な目的で、ユーザーデータを使用・転送しない
- 信用度や融資目的でユーザーデータを使用・転送しない

### 注意（回答前に確認してください）
- 上記は、現在のコードの動作に基づく下書きです。ダッシュボードの質問項目や用語は変わることがあるので、実際の画面の文言に合わせて回答してください。
- 「ウェブサイトのコンテンツ」を読み取る点（画像・DOM）は、収集に当たるかどうかが、ストアの定義次第です。外部へ送らず保存もしないので「収集しない」と答える想定ですが、迷う場合は、ストアのヘルプの定義を確認してください。
- 名前の「X」について、商標を理由に修正を求められる可能性があります。その場合は「for X」を外した名前にして再申請します。
