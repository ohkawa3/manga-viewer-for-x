# Privacy Policy / プライバシーポリシー

Manga Viewer for X (unofficial) — last updated 2026-10-24

## English
- This extension does **not collect, transmit, sell, or share any personal or usage data**. It has no server, no analytics, and no ads.
- It runs only on `x.com` and `twitter.com`. It reads the images shown on the page in your browser, and loads them from `pbs.twimg.com` (the same place X itself loads them from) to display them in the viewer.
- It saves a few settings in your browser (`chrome.storage`): the view mode, the mode used on open, the base width, and whether the first-use hint was shown. These stay on your device (the extension never sends them anywhere).
- It uses `chrome.storage.session` (cleared when the browser closes) only to tell a newly opened tab which image to show, and deletes it once read.
- To load a whole thread, the viewer scrolls the X page automatically (up to about 35 seconds). X may record this as normal page impressions.
- It is not affiliated with X Corp. Source code: https://github.com/ohkawa3/manga-viewer-for-x

## 日本語
- この拡張機能は、個人情報や利用状況を**収集・送信・販売・共有しません**。サーバー、解析ツール、広告はありません。
- 動作するのは `x.com` と `twitter.com` だけです。ページに表示されている画像をブラウザ内で読み取り、ビューアに表示するため、X が画像を読み込むのと同じ `pbs.twimg.com` から画像を読み込みます。
- ブラウザの `chrome.storage` に、次の設定だけを保存します：表示モード、起動時のモード、基準幅、初回ヒントを表示したかどうか。これらは端末内にとどまり、拡張が外部へ送ることはありません。
- `chrome.storage.session`（ブラウザ終了で消える）は、新しく開いたタブにどの画像を表示するかを伝えるためだけに使い、読み取ったら削除します。
- スレッド全体を読み込むため、ビューアは X のページを自動でスクロールします（最大約35秒）。X 側では、通常の閲覧と同じ表示（インプレッション）として記録される場合があります。
- X社とは無関係の非公式ツールです。ソースコード: https://github.com/ohkawa3/manga-viewer-for-x
