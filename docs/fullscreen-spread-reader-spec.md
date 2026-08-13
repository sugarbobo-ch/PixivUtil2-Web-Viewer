# Fullscreen Spread Reader 規格

最後更新：2026-08-12

## 固定產品決策

- 預設 `fullscreenPageLayout` 為 `single`，`fullscreenReadingDirection` 為 `ltr`，`fullscreenSpreadPairing` 為 `cover-single`。
- `cover-single` 會以 boundary slot 搭配封面，後續依作品內順序配成 2–3、4–5、6–7……；`first-page` 從 1–2、3–4 開始配對，最後剩一頁時搭配作品結束 boundary slot。
- 影片沿用同一作品內的雙頁配對規則；封面、孤立頁或不完整配對仍會是單頁。missing/error media 不移除、不靜默跳號；它保留在原本 slot 並顯示錯誤語意。
- 不同 `getItemGroupKey()` 作品不可配成同一 spread，即使它們在目前 Gallery page 相鄰。
- 窄 viewport 會暫時以單頁 render，但不改寫保存的雙頁偏好；畫面會提供可理解的 fallback 狀態。
- Settings 是 layout/direction 的持久化入口；Fullscreen toolbar 的快速控制是輔助入口，reader 不自行持有另一份保存設定。

## Model

`frontend/src/utils/readerSpread.ts` 的 `buildReaderSpread()` 是唯一 pairing 入口：

| 欄位 | 意義 |
| --- | --- |
| `anchorIndex` | 此 spread 的第一個 progression index |
| `progressionIndexes` | 書本順序中的 media indexes，不跨作品 |
| `leadingIndex` | 書本順序先遇到的頁面 |
| `trailingIndex` | 書本順序後遇到的頁面，單頁為 `null` |
| `isSinglePageFallback` | 單頁偏好、封面、孤頁或空資料 |

LTR 的 physical slots 為 `[較小頁碼, 較大頁碼]`；RTL 為 `[較大頁碼, 較小頁碼]`。這只改變書頁 slot，不改變 toolbar、Settings 或整個 App 的方向。

## Navigation contract

| Input | 行為 |
| --- | --- |
| PageDown / Space | 下一個 spread |
| PageUp | 上一個 spread |
| LTR | ArrowRight / swipe right half: next；ArrowLeft / swipe left half: previous |
| RTL | ArrowLeft / swipe left half: next；ArrowRight / swipe right half: previous |
| Home / End | 第一／最後一個 spread |
| filmstrip | 先定位被選頁，再由 model normalize 到所在 spread |

雙頁模式下 video focus 的左右方向鍵仍導覽 reader；影片仍保留原生 controls、點擊播放／暫停與點擊 seek。單頁模式則保留 video timeline 的左右方向鍵。

## Loading、transform 與 announcement

雙頁的每個 slot 各自擁有 media identity、load/error state；共同的 spread stage 負責 layout，避免切頁時把上一 spread 的影像留在錯誤 slot。active spread 的兩頁是 high priority，下一 spread 由 admission queue 預取，仍受既有 scheduler 上限約束。

Spread stage 使用共同 canvas transform：zoom 由 100% 到 400%，在 zoom 大於 100% 時可平移，切換 spread／layout／direction 時重設 item-local pan。底部 compact filmstrip 只使用 `readerSpread.ts` normalize 後的 anchor，不自行建立另一套 pairing 規則。桌面 toolbar 會換行顯示完整控制；窄螢幕仍以水平操作保留所有控制，且不覆寫保存的 spread 偏好。

雙頁 canvas 依兩個 media 的 intrinsic dimensions 使用共同比例縮放：以 bounded surface 的 stage 高度為主，若兩頁合併後會超出 surface 寬度上限才整組等比例縮小。surface 使用受限的 opaque page plane（主要限制為 `90vw`，桌面 safety cap 為 `144rem`），不會因 stage 很寬而把兩頁鋪滿整個螢幕；整組內容在 stage 內置中，兩個 slot 直接相鄰。直向頁面在可行時上下貼齊，寬度不足時不會被硬拉寬，寬度碰到邊界後高度也不再增加。封面與作品尾頁以另一個 boundary slot 補齊 surface，分別顯示作品名稱／繪師與作品結束資訊。模糊只套用在 media 本身，模糊狀態的 media frame／video surface 沿用單頁閱讀器的 stage backing，棋盤格只會出現在 media 外側，不會透過模糊邊緣顯示在媒體內容內。

切頁後更新穩定的 polite live-region，例如 `第 2–3 頁，共 24 頁`；控制項使用「上一頁／下一頁」而不是依賴顏色或 icon 推測。

Navigation regression tests 覆蓋 LTR／RTL 的方向鍵、PageUp／PageDown、Home／End、click-half、swipe、wheel 與 filmstrip anchor；方向只改變 progression 意義，不改變介面 `dir`。

## Media admission contract

- active spread 的每個非影片 slot 透過 `imageLoadScheduler` 以 `owner: spread`、priority `0` 取得 original admission；scheduler 的 original 上限仍為 2，不因雙頁模式加倍成無上限請求。
- 下一個 progression spread 的非影片頁面以 priority `1` 預取；current spread 改變或 reader 卸載時，所有未完成的 preload handle 都會取消。
- missing/error item 不進入 preload；active spread 的每個影片都使用 `metadata`／原生 video controls，確保雙影片可以同時載入且各自可點擊。
- preload 失敗只清除該 URL 的 scheduler record，slot 仍由自身的 error state 呈現，不會把上一 spread 的媒體留在新 slot。
