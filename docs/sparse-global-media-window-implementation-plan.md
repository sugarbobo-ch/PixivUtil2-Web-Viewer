# 稀疏全域資料視窗與虛擬渲染實作計劃

狀態：歷史設計計畫；現行實作與驗收以 `docs/global-gallery-navigation-contract.md` 為準

適用範圍：Gallery、MonthQuickNav、單張全螢幕、雙頁全螢幕、條漫、縮圖導覽

## 1. 摘要

本計劃將目前「一次只持有一頁 `images[]`，換頁時整批替換 DOM 與索引」的模型，改為一條具有穩定全域索引的媒體序列。前端知道完整結果集的總數、月份起點與版面摘要，但只載入目前位置附近的資料區間，也只渲染視窗附近的 DOM。

核心決策如下：

- 後端繼續使用 `offset + limit` 隨機存取，不採只能向下追加的 cursor feed。
- 前端新增一個深模組 `GlobalMediaWindow`，統一負責區間載入、去重、取消、版本隔離、快取淘汰與預取。
- Gallery、全螢幕、雙頁及條漫都使用 `globalIndex`；分頁只保留為模組內部的傳輸與快取細節。
- MonthQuickNav 直接定位全域月份錨點；未載入資料先顯示穩定占位，再原位換成縮圖。
- 資料可以稀疏，但版面度量必須連續且穩定；DOM 與圖片解碼仍維持固定上限。

這不是「把 14,627 張全部載入」，也不是讓 DOM 無限增長。

## 2. 現況與問題

目前 `useImagePageLoader` 只對外提供目前頁的 `images[]`。MonthQuickNav 跨頁時會先在舊頁開始 approach scroll，目的頁資料回來後再整批替換 `images[]`，最後由月份對齊器做第二次 scroll。

這會形成三個不同階段：

1. 舊頁座標中的動畫。
2. React 替換資料後，瀏覽器依新高度進行 scroll anchoring 或 scrollTop 夾限。
3. 目標月份在新頁出現後，再執行一次對齊。

已量測到由末頁往首月跳轉時，舊頁 `scrollTop=4308` 在換頁後映射到新頁 `scrollTop=11910`，再滑回 `0`。這就是肉眼看到「往回滑」的直接原因。

目前模式還有下列共同限制：

- Gallery 的索引是目前頁 local index。
- 單張與雙頁全螢幕只看目前頁的 `images[]`，頁面邊界不是自然的閱讀邊界。
- 條漫雖然已虛擬化，虛擬軌道仍只涵蓋目前頁，跨頁會重建高度與 anchor。
- `allWorkGroups` 只從目前頁計算，作品可能被分頁切開。
- 月份 offset 是全域資料位置，但 DOM 高度與索引仍是頁內座標。

## 3. 目標

### 3.1 使用者體驗

- MonthQuickNav 點擊後 100ms 內開始可見位移，不等待網路。
- 整次月份跳轉只有一個方向，不反向、不先停住再啟動。
- 未載入位置顯示 skeleton；資料到達後原地替換，不重置 scrollTop。
- 按住月份尺規拖動時，內容與指標持續跟隨。
- Grid、單張全螢幕、雙頁全螢幕與條漫可以跨載入區間連續導航。
- 返回 Grid 時回到相同 global index，而不是只回到同一頁的大概位置。

### 3.2 效能與容量

- 結果總數不受前端頁面大小限制。
- Gallery DOM 維持約 2–3 個 viewport 的可控範圍。
- 條漫 DOM 維持目前 viewport 加 overscan 的可控範圍。
- 預設資料快取最多保留 5 個 chunk；目前閱讀位置與正在預載的區間不可被淘汰。
- 原圖、影片與縮圖仍經由既有 `imageLoadScheduler` 控制併發與解碼。

### 3.3 正確性

- filter、artist、search、sort 或群組模式改變時，舊請求不得混入新結果集。
- 亂序完成、重複請求、取消請求及背景重掃後都能維持一致序列。
- 刪除、移入回收區或資料庫更新後，global index 能透過新的結果版本重新建立。

## 4. 非目標

- 第一階段不重寫 SQLite gallery query。
- 不一次將全部 ImageItem 傳到瀏覽器。
- 不讓 Gallery、Fullscreen、Spread、Webtoon 各自維護一套分頁快取。
- 不以 CSS `overflow-anchor: none` 作為完整解法；它只能降低瀏覽器補償，不能消除雙座標與雙動畫。
- 不在第一階段永久移除既有分頁 UI；遷移期間保留相容路徑與回滾能力。

## 5. 領域詞彙

- **Result Set**：一組固定 filter、artist、search、sort 與 grouping 設定下的完整排序結果。
- **Result Revision**：結果集版本。資料庫重掃或可見資料變更後必須改變。
- **Global Index**：Result Set 內從 `0` 開始的穩定位置。
- **Range**：半開區間 `[start, end)`。
- **Chunk**：HTTP 與快取使用的固定大小資料區間；只是實作細節，不是 UI 頁面。
- **Slot**：某個 Global Index 的狀態，可能是 unloaded、loading、ready 或 error。
- **Pinned Range**：目前 viewport、active reader 或導航目標需要保留的區間。
- **Dense Metrics**：每個位置的估算或實測高度等小型數值；可以完整保存。
- **Sparse Media Data**：只有已載入 Range 才保存完整 ImageItem。

## 6. 架構決策

### 6.1 深模組與 seam

新增深模組 `GlobalMediaWindow`。它的 Interface 保持小型，分頁、HTTP、AbortController、LRU、request generation 與合併規則全部留在 Implementation 內。

建議位置：

```text
frontend/src/media-window/
  index.ts                    # 唯一對外出口
  GlobalMediaWindow.ts        # store 與載入協調
  useGlobalMediaWindow.ts     # React 訂閱
  globalLayoutIndex.ts        # dense metrics 與 offset 查找
  httpMediaRangeAdapter.ts    # production adapter
  inMemoryMediaRangeAdapter.ts# tests adapter
```

Production 使用 HTTP adapter；測試使用 in-memory adapter。呼叫端不直接建立 URLSearchParams，也不處理 request cancellation。

### 6.2 建議 Interface

```ts
type GlobalIndex = number;

interface MediaRange {
  start: GlobalIndex;
  end: GlobalIndex;
}

type LoadIntent =
  | 'viewport'
  | 'month-jump'
  | 'reader-neighbor'
  | 'scrub-preview';

interface MediaSlot {
  index: GlobalIndex;
  status: 'unloaded' | 'loading' | 'ready' | 'error';
  item?: ImageItem;
}

interface MediaWindowSnapshot {
  revision: string;
  total: number;
  months: MonthLayoutItem[];
  get(index: GlobalIndex): MediaSlot;
  isRangeReady(range: MediaRange): boolean;
}

interface MediaWindowController {
  getSnapshot(): MediaWindowSnapshot;
  subscribe(listener: () => void): () => void;
  ensure(range: MediaRange, intent: LoadIntent): Promise<void>;
  pin(owner: string, range: MediaRange): () => void;
  reset(query: MediaQuery): void;
}
```

Interface 不提供 `page`、`currentPage`、cache map 或 request id。這些知識不應擴散到四種檢視模式。

### 6.3 Range adapter

```ts
interface MediaRangeAdapter {
  load(query: MediaQuery, range: MediaRange, signal: AbortSignal): Promise<{
    revision: string;
    total: number;
    range: MediaRange;
    images: ImageItem[];
    months: MonthLayoutItem[];
  }>;
}
```

這個 seam 有兩個實際 adapter：HTTP production adapter 與 deterministic in-memory test adapter。

## 7. 後端契約

既有 `/api/images` 已支援 `offset`、`limit`、`total` 與月份 offset，可先以向後相容方式擴充，不必立即新增 route。

建議回應：

```json
{
  "revision": "gallery-snapshot-42",
  "offset": 8400,
  "limit": 200,
  "total": 14627,
  "images": [],
  "month_index": [
    {
      "key": "2023-06",
      "offset": 8420,
      "image_count": 318,
      "card_count": 201
    }
  ]
}
```

必要欄位：

- `revision`：避免不同 gallery snapshot 的 range 被合併。
- `offset`：讓前端驗證回應位置。
- `total`：建立完整全域索引。
- `month_index[].offset`：MonthQuickNav 的全域目標。
- `image_count`：未群組模式的版面計算。
- `card_count`：組圖模式的版面計算。

`card_count` 很重要。現有 `groupMangaPosts` 會把多張 ImageItem 合併成一張卡片，只用圖片數估算月份高度會在載入後改變 row count，重新引入跳動。

### 7.1 Snapshot 一致性

- 同一個 MediaWindow 只接受相同 `revision` 的 range。
- 收到不同 revision 時停止合併，發布 `stale` 狀態並重新載入目前 pinned ranges。
- filter、artist、search、sort、grouping 改變時建立新的 request generation，取消舊 generation 的請求。
- offset 查詢保留，因為 MonthQuickNav 需要隨機跳到任意月份；純 cursor pagination 不適合此需求。

## 8. 全域版面模型

### 8.1 Gallery

Gallery 的軌道由月份區塊組成。每月高度使用後端提供的 `card_count`、目前 column count、thumbnail size、gap 與 header height 計算。

```text
monthTop = prefixSum(previousMonthHeights)
rows = ceil(cardCount / columns)
monthHeight = headerHeight + rows * rowStride
```

當 responsive breakpoint 或 thumbnail size 改變時，只重建 Dense Metrics，不清除已載入 Sparse Media Data。

月份跳轉流程：

1. 由 `month.offset` 與 month layout 找到穩定 `monthTop`。
2. 同一個全域 scroll container 立即 smooth scroll 到 `monthTop`。
3. `ensure()` 載入目標附近 Range。
4. 未載入卡片使用固定幾何 skeleton。
5. ready Slot 原地取代 skeleton，不改變軌道高度。

### 8.2 Webtoon

條漫保留「稀疏媒體資料＋完整高度度量」：

- 每個 Global Index 先使用 estimated height。
- 圖片載入後記錄 measured height。
- 高度差只更新 prefix-sum 結構。
- 若變更發生在 anchor 上方，以 scroll compensation 保持第一個可見項目位置。
- 建議使用 Fenwick tree 或 segment tree 提供 `index -> offset` 與 `offset -> index` 的對數時間查找；14,627 個純數值高度不是容量問題。

### 8.3 Fullscreen 與 Spread

全螢幕沒有長軌道，但必須改用 global index：

- active item 使用 `snapshot.get(globalIndex)`。
- 每次導航 pin `globalIndex ± preloadCount`。
- 接近 Range 邊緣時 `ensure()` 相鄰區間。
- Spread 必須確保左右頁及作品邊界資料已載入，再交由 `readerSpread.ts` 配對。
- `pageOffset + currentIndex` 改為直接使用 global index。

## 9. 各模式遷移方案

### 9.1 Gallery adapter

目前：

```ts
<GalleryGrid images={images} currentPage={currentPage} />
```

目標：

```ts
<GalleryGlobalTrack
  mediaWindow={mediaWindow}
  anchorIndex={globalAnchorIndex}
/>
```

GalleryGlobalTrack 負責 viewport range、月份區塊與 skeleton；GalleryMonthSection 只負責已決定範圍內的卡片呈現。

### 9.2 Fullscreen adapter

- `fullscreenIndex` 改名為 `fullscreenGlobalIndex`。
- `onNavigate(localIndex)` 改為 `onNavigate(globalIndex)`。
- filmstrip 只呈現 pinned Range，但頁碼顯示 `globalIndex + 1 / total`。
- 下一張、上一張與下一作品不得在 chunk 邊界停止。

### 9.3 Spread adapter

- 配對模型接受 global slots。
- 載入中頁面維持固定 spread slot，不折疊版面。
- 作品跨 chunk 時先 ensure 鄰近 Range，再決定配對；不可把 chunk 邊界當作品邊界。

### 9.4 Webtoon adapter

- 移除 `currentPage`、`totalPages`、`pageOffset` 與 `onPageChange` props。
- virtualStart／virtualEnd 改成 global range。
- thumbnail rail 與正文共用相同 global layout index。
- 上下捲動接近未載入區域時以 viewport intent 預取。

## 10. 分階段交付

### Phase 0：鎖定回歸與短期穩定

- [ ] 建立冷啟動 Browser 測試：MonthQuickNav 上端、下端、按住拖動。
- [ ] 斷言 scroll direction 單調，不允許反向位移。
- [ ] 斷言 click 到第一次位移小於 100ms。
- [ ] 建立 Grid／Fullscreen／Spread／Webtoon 跨第 500/501 張的基準測試。
- [ ] 短期停用雙重 scroll owner；只能由 navigation transaction 發出最終 scroll。

### Phase 1：後端 range contract

- [ ] `/api/images` 增加 `revision`、`offset` 與 layout counts。
- [ ] 加入任意 offset、尾端不足一個 chunk、空結果與反向 sort 測試。
- [ ] 驗證相同 query 的 month offsets 與 range items 使用相同排序。
- [ ] 保留舊欄位，確保既有 frontend 可繼續使用。

### Phase 2：GlobalMediaWindow 深模組

- [ ] 實作 Slot、Range 合併與 query generation。
- [ ] 實作 request dedupe、priority、abort 與 stale revision handling。
- [ ] 實作 pinned ranges 與 5-chunk LRU。
- [ ] 建立 HTTP 與 in-memory adapters。
- [ ] 先提供 legacy page adapter，讓現有 App 可在不改 UI 的情況下使用新模組。

### Phase 3：Gallery 與 MonthQuickNav

- [ ] 建立全域月份 layout index。
- [ ] Gallery 改為單一穩定 virtual track。
- [ ] MonthQuickNav 改用 monthTop，不再觸發 `setCurrentPage`。
- [ ] skeleton 與 ready card 使用相同幾何。
- [ ] 支援 grouped／ungrouped card counts。
- [ ] 完成後移除 approach scroll 與 pendingMonth DOM polling。

### Phase 4：單張全螢幕與 filmstrip

- [ ] 所有 reader state 改用 global index。
- [ ] 前後導航跨 chunk。
- [ ] filmstrip 維持 bounded DOM 與 range prefetch。
- [ ] 返回 Grid 保持 global anchor。

### Phase 5：雙頁全螢幕

- [ ] spread pairing 跨 chunk 正確。
- [ ] RTL／LTR、封面單頁與作品邊界不受資料載入區間影響。
- [ ] 載入中 slot 不改變 spread 幾何。

### Phase 6：條漫

- [ ] 導入 global height index。
- [ ] measured height 更新保留可見 anchor。
- [ ] 正文與縮圖 rail 共用 global index。
- [ ] 移除頁面切換 toolbar 行為與 page props。

### Phase 7：清理與正式切換

- [ ] 移除 `useImagePageLoader` 的 current-page owner 職責。
- [ ] 移除 reader 的 local index／pageOffset 契約。
- [ ] 決定既有「每頁數量」設定：改為內部 chunk size 或從 UI 移除。
- [ ] 移除 legacy pagination adapter。
- [ ] 更新專案地圖、操作說明與效能基準。

## 11. 測試與驗收矩陣

### 11.1 GlobalMediaWindow Interface tests

- 亂序完成的 Range 正確合併。
- 重疊 Range 不重複請求。
- 新 query generation 不接受舊 response。
- revision 改變時不混合 snapshot。
- LRU 不淘汰 pinned Range。
- error Slot 可重試，已成功 Slot 不被降級。
- 末端 Range 正確處理不足 chunk 的回應。

### 11.2 Browser 行為

| 場景 | 驗收條件 |
| --- | --- |
| 冷啟動點擊最遠月份 | 100ms 內開始位移；方向單調；目標 skeleton 立即存在 |
| 快取後點擊月份 | 不發出重複 range request；方向單調 |
| 按住尺規上下拖動 | scroll 與目標 index 持續更新，不等待 pointer-up |
| Gallery 跨 chunk | 不重建整條軌道，不跳回，不丟失 focus |
| Fullscreen 499 → 500 | 下一張連續、頁碼連續、預載正常 |
| Spread 跨 chunk | pairing 與閱讀方向正確 |
| Webtoon 跨 chunk | 第一可見圖片位置變化小於 1px |
| filter/sort 切換 | 舊 range 不出現在新結果集 |
| 刪除目前項目 | revision 更新後選中合理相鄰項目 |

### 11.3 效能門檻

- MonthQuickNav click-to-first-motion：P95 < 100ms。
- 目標 skeleton 顯示：P95 < 150ms。
- 測試資料庫冷查詢的第一張目標縮圖：P95 < 500ms；若未達標，另行優化 backend query 與 thumbnail admission。
- Gallery mounted cards：一般桌面不超過計算後 3 個 viewport。
- Webtoon mounted articles：只允許 viewport + 既有 overscan。
- Sparse ImageItem cache：預設不超過 5 chunks，pinned ranges 除外。
- 切換模式不得重新請求已存在的 ready Range。

## 12. 風險與對策

### 12.1 Grouped card 幾何

風險：圖片數不等於卡片數，估算錯誤會使月份位置改變。

對策：後端提供每月 grouped card count；作品邊界不得依賴單一 chunk 內的資料推算。

### 12.2 條漫實際高度晚到

風險：原圖比例載入後改變上方高度。

對策：dense height metrics 加 anchor compensation；高度修正不能直接改寫 scrollTop 而不保留 anchor。

### 12.3 資料重掃與刪除

風險：offset 代表的作品在 snapshot 更新後改變。

對策：Result Revision；更新後以 image id 或 month key 重新解析 global index。

### 12.4 記憶體

風險：無限滾動被誤作無限快取。

對策：chunk LRU、pinned ranges、既有圖片 scheduler；Dense Metrics 只保存數值，不保存 DOM 或 ImageItem。

### 12.5 Focus 與鍵盤導航

風險：focused item 被虛擬化卸載。

對策：focus owner 所在 Range 必須 pinned；跨未載入位置先 ensure，再把 focus 移到 ready element。

## 13. 回滾方案

- Phase 2–6 保留 legacy page adapter。
- 新舊模式共用 `/api/images` 的向後相容 response。
- 每個 reader 分別透過內部 feature flag 切換 adapter，不新增使用者設定。
- 發現阻斷問題時，只回切 adapter；不回退後端 response 欄位。
- Phase 7 清理前，必須完成所有模式的 cold-cache browser matrix。

## 14. 建議工作切分

1. Backend contract 與 snapshot revision。
2. GlobalMediaWindow Interface、in-memory adapter 與測試。
3. HTTP adapter、LRU、priority 與 cancellation。
4. Gallery global layout index。
5. MonthQuickNav 單一 scroll transaction。
6. Fullscreen global navigation。
7. Spread global pairing。
8. Webtoon global height index。
9. 移除 legacy pagination owner 並更新文件。

每個工作切分都必須能獨立 build、測試並保持 legacy adapter 可運作，避免一次大型切換讓三種 reader 同時失去可用基準。

## 15. 完成定義

- Gallery、單張全螢幕、雙頁全螢幕與條漫全部使用 global index。
- MonthQuickNav 不再呼叫 UI page change，也沒有 pending target DOM polling。
- 冷啟動上／下月份跳轉沒有反向 scroll，且 100ms 內開始移動。
- 四種模式都能跨任意 chunk 邊界連續導航。
- DOM、ImageItem cache、縮圖與原圖解碼都有明確上限。
- filter、sort、重掃與刪除通過 revision 一致性測試。
- legacy pagination adapter 已移除，相關文件與設定已完成遷移。
