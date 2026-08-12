# Gallery 編輯模式快選規格與失效分析

日期：2026-08-10
狀態：已實作並完成測試與畫廊操作驗證

## 1. 目的與範圍

本文件定義 Gallery 編輯模式的「按住拖曳範圍快選」行為，並記錄目前功能失效的程式原因。這個功能只影響 Gallery 的批次選取；單張點選、組圖開啟、月份按鈕、下載與移至回收區的既有流程不應被改變。

## 2. 需求行為

### 2.1 基本手勢

1. 使用者進入編輯模式，在一張作品卡片上按住指標。
2. 以按下的卡片作為 anchor，依目前畫面排序計算範圍；範圍包含 anchor 與指標所在的目標卡片。
3. 指標往上或往下移動都要即時更新範圍；不應只支援單一方向。
4. 指標靠近 Gallery 捲動區上、下邊緣時，自動捲動並持續選取新進入範圍的卡片。
5. 放開指標後提交目前範圍，並抑制同一次拖曳後的 click，避免誤開啟作品。

### 2.2 選取與反選

拖曳開始時先決定此次手勢是「選取」還是「取消選取」：

- anchor 尚未完整選取：選取範圍內所有作品。
- anchor 已完整選取：取消選取範圍內所有作品。
- 每次範圍更新都以按下前的 selected set 為基準，不以前一次滑過的範圍累加，才能正確支援來回拖曳。

以一排六張為例：

| 操作 | 預期結果 |
| --- | --- |
| 從第 4 張按住拖到第 28 張 | 第 4～28 張全部選取 |
| 從第 28 張拖回第 4 張 | 仍是第 4～28 張全部選取 |
| 已選取第 4～28 張，再從第 8 張拖到第 12 張 | 第 8～12 張取消選取，只保留第 4～7、13～28 張 |

### 2.3 跨頁

跨到下一頁或上一頁時，手勢必須保留：

- anchor image id、目前指標方向與選取／反選模式；
- 目前已選取的 image id set；
- 套用相同 filter、sort mode、items per page 的結果順序；
- 目前頁面已取得資料與下一頁／上一頁的載入狀態。

跨頁不應清空既有選取，也不應把 page-local index 當成 image identity。拖曳結束後，批次工具列的數量、下載與移至回收區都必須包含所有頁面選取項目。

## 3. 目前實作責任邊界

| 檔案 | 目前責任 |
| --- | --- |
| `frontend/src/components/GalleryGrid.tsx:163` | 建立目前 `images` 的 `selectionModel`、建立 pointer gesture、計算範圍與自動捲動。 |
| `frontend/src/components/GalleryMonthSection.tsx:104` | 依月份建立實際顯示卡片、虛擬化 DOM，以及 `data-selection-key`／`data-selection-ids`。 |
| `frontend/src/hooks/useSelectionWorkflow.ts:18` | 保存 `selectedIds`，提供 toggle、set、replace 與批次操作。 |
| `frontend/src/hooks/useImagePageLoader.ts:41` | 取得並快取目前 page 的 `images`；API 請求使用 page-local offset。 |
| `frontend/src/App.tsx:862` | 一般分頁只更新 `currentPage`，並將 Gallery 捲回頂端。 |

## 4. 為何目前失效

### 4.1 直接根因：範圍模型與 DOM 卡片使用不同 key

`GalleryGrid` 的範圍模型產生的 key 是：

- 未分組：`image:${index}`；
- 組圖：`work:${groupKey}:${index}`。

位置：`frontend/src/components/GalleryGrid.tsx:178-192`。

實際 DOM 卡片由 `GalleryMonthSection` 產生的 key 卻是：

- 未分組：`image:${item.image_id}:${item.save_name}`；
- 組圖：`work:${groupId}:${coverEntry.item.save_name}`。

位置：`frontend/src/components/GalleryMonthSection.tsx:104-145`。

按下與移動時傳入的是 DOM 卡片 key：`GalleryMonthSection.tsx:280`。但範圍計算使用完全相等的 key 比對：

```ts
const anchorIndex = selectionModel.findIndex(card => card.key === gesture.anchorKey);
const targetIndex = selectionModel.findIndex(card => card.key === cardKey);
if (anchorIndex < 0 || targetIndex < 0) return;
```

位置：`frontend/src/components/GalleryGrid.tsx:286-292`。

因此 `anchorIndex` 與 `targetIndex` 會是 `-1`，函式在呼叫 `onReplaceSelection` 前直接返回。結果是一般單擊仍可透過 `activateCard` 選取，但拖曳快選沒有任何範圍變更；這是目前最直接、可重現的失效原因。

### 4.2 手勢時序缺口：8px 移動會取消 360ms 啟用計時器

`beginPointerGesture` 先將手勢設為 `active: false`，並以 360ms 計時器等待長按。若使用者在計時器完成前移動超過 8px，`handlePointerMove` 只會：

1. 設定 `moved = true`；
2. 清除計時器；
3. 返回，不啟用手勢。

位置：`frontend/src/components/GalleryGrid.tsx:478-490` 與 `537-575`。

所以「按下後立刻自然拖曳」會停留在 inactive 狀態；只有先穩定按住超過 360ms，再開始移動，才有機會進入範圍選取。即使修好 key，這條時序仍會讓使用者感覺快選不可靠。

### 4.3 跨頁尚未接通：自動捲動只會停在目前頁的邊界

目前自動捲動的容器是 Gallery 內的 `[data-gallery-scroll-container="true"]`。它只修改目前 DOM 的 `scrollTop`，到達 `scrollHeight - clientHeight` 後便停止，沒有呼叫 `onPageChange`、`loadImagePage` 或相鄰頁載入流程。

同時，`selectionModel` 是由當下的 `images` 建立，而 `useImagePageLoader` 的 `images` 只代表目前 page。位置：`GalleryGrid.tsx:163-195`、`useImagePageLoader.ts:117-148`。因此目前實作沒有「拖到頁尾後載入下一頁並延續相同 anchor」的資料結構。

`App` 的 `handlePageChange` 也只是切換 `currentPage` 並將 Gallery 捲回頂端，位置：`frontend/src/App.tsx:862-875`；快選手勢沒有接入這個 callback。

### 4.4 跨頁批次操作的資料也仍是 page-local

`selectedIds` 本身是跨 render 保存的 `Set<number>`，但下載與回收操作會從目前 `images` 反查 `save_name`：

- 下載：`frontend/src/hooks/useSelectionWorkflow.ts:60-63`；
- 回收：`frontend/src/hooks/useSelectionWorkflow.ts:114-118`。

若只把選取 id 留在 state，上一頁的項目切頁後仍可能顯示在數量中，但目前頁資料無法提供那些項目的 path。跨頁快選需要同步保存選取項目的 metadata，或改由後端依 image id 解析合法 path。

### 4.5 測試缺口

目前 `useSelectionWorkflow.test.tsx` 覆蓋單張 toggle、全選、清除與刪除錯誤，但沒有 `GalleryGrid` 的 pointer down／move／up、範圍反選、虛擬化捲動或跨頁測試。這使得 TypeScript／一般選取測試通過時，拖曳路徑仍可因 key refactor 失效而未被發現。

## 5. 修復順序建議

1. **先統一卡片 identity**：由單一 helper 或共用 `SelectionCard` model 產生 DOM key 與 range model key；禁止 GalleryGrid 與 GalleryMonthSection 各自組 key。範圍比對應以穩定 image id／work group id 為基礎，不使用 page-local index。
2. **修正 gesture state machine**：明確定義 click、長按、拖曳三者的轉換；移動超過 threshold 後不可只留下 `moved = true` 而沒有 active 或取消原因。桌面滑鼠與觸控的 `touch-action`、`preventDefault` 必須一起驗證。
3. **建立跨頁 canonical order**：以目前 query 的完整結果順序作為範圍索引。頁面只負責顯示窗口，拖曳邊界時由 page cache 載入相鄰頁，並保留 anchor、direction、mode 與 selected set。
4. **補齊跨頁 metadata**：選取 state 需有 `image_id -> save_name／必要 metadata` 的快取，或批次 API 僅收 image id 並由後端安全解析；不能只依賴目前頁 `images`。
5. **加入 regression tests**：至少覆蓋 key 對齊、4→28、28→4、已選 4～28 後反選 8～12、組圖模式、虛擬化自動捲動、上一頁／下一頁交界、pointer cancel，以及 click 不被誤觸發。

## 6. 驗收矩陣

| 情境 | 必須確認 |
| --- | --- |
| 編輯模式單擊 | 仍只切換目前卡片，不開啟作品。 |
| 4→28 | 4～28 全部 selected，途中捲動不中斷。 |
| 28→4 | 結果與反方向一致。 |
| 4～28 已選，8→12 | 8～12 反選，其餘 4～7、13～28 保持 selected。 |
| 組圖模式 | 一個作品群組的所有 page 與 range identity 一致。 |
| 頁尾跨頁 | 自動載入下一頁並繼續選取；不清空前頁。 |
| 頁首跨頁 | 自動載入上一頁並繼續選取；anchor 與方向不漂移。 |
| 分頁後批次操作 | 工具列數量、下載、回收包含所有頁面的選取項目。 |
| focus／keyboard／reduced motion | `aria-checked`、focus-visible、取消與 reduced-motion 行為不回歸。 |

## 7. 結論

目前不是單純 CSS 或選取顏色問題。最先造成「拖曳完全沒有反應」的是 range model 與 DOM 卡片的 key contract 已分裂；另外還有長按時序、跨頁載入與 page-local 批次操作等缺口。

## 8. 已完成實作

本次已依上述分析完成以下修正：

- `frontend/src/utils/gallerySelection.ts` 統一圖片與組圖的 selection key，並集中處理跨卡片 range 的選取／反選。
- `GalleryGrid` 改用與 DOM 相同的 key，依實際畫面排序計算 anchor 與 target，支援向上、向下及反向拖曳。
- 拖曳超過 8px 時立即啟用範圍選取，不必先完整等待 360ms；仍保留短暫按住後才拖曳的操作方式。
- Gallery 捲動接近上下邊界時，自動載入相鄰頁；換頁後恢復捲動位置、保留手勢與已載入頁面的 selection model，持續套用範圍。
- 批次下載與回收會使用已載入頁面的 image metadata cache，不因換頁而遺失 `save_name` 等必要資料。
- `.gallery-card--editable` 在編輯模式使用 `touch-action: none`，避免瀏覽器原生觸控捲動攔截拖曳手勢。

驗收時應確認：4→28、28→4 都選取完整範圍；先選取 4–28 後從 8→12 拖曳會留下 4–7 與 13–28；跨頁時不清空前頁選取，且批次工具列、下載與回收仍包含所有選取項目。

本次驗證結果：同頁正向與反向拖曳、區間反選、自動捲動均通過；從第一頁頁尾持續拖曳時，畫廊實際載入並穿越第 2、3 頁，選取狀態持續保留。跨頁後工具列分母使用完整結果集總數，不再以目前頁面的 500 張誤計。
