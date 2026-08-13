import type { UiLanguage } from './types';
import configEn from './i18n/config-locales/en.json';
import configJa from './i18n/config-locales/ja.json';
import configZhCN from './i18n/config-locales/zh-CN.json';
import configZhTW from './i18n/config-locales/zh-TW.json';

export type PixivFieldKind = 'text' | 'textarea' | 'number' | 'boolean';
export type PixivPathMode = 'folder' | 'existing-file' | 'save-file';

export interface PixivPathFieldMetadata {
  mode: PixivPathMode;
  purpose: string;
  extensions?: string[];
  access: 'read' | 'write' | 'read-write';
}

export interface PixivConfigFieldMetadata {
  label: string;
  description: string;
  kind: PixivFieldKind;
  secret?: boolean;
  path?: PixivPathFieldMetadata;
}

export interface PixivConfigSectionMetadata {
  eng_category: string;
  zh_category: string;
  description: string;
  fields: Record<string, PixivConfigFieldMetadata>;
}

const textField = (label: string, description: string): PixivConfigFieldMetadata => ({
  label,
  description,
  kind: 'text',
});

const textAreaField = (label: string, description: string): PixivConfigFieldMetadata => ({
  label,
  description,
  kind: 'textarea',
});

const numberField = (label: string, description: string): PixivConfigFieldMetadata => ({
  label,
  description,
  kind: 'number',
});

const booleanField = (label: string, description: string): PixivConfigFieldMetadata => ({
  label,
  description,
  kind: 'boolean',
});

const secretField = (label: string, description: string): PixivConfigFieldMetadata => ({
  label,
  description,
  kind: 'text',
  secret: true,
});

const pathField = (
  label: string,
  description: string,
  path: PixivPathFieldMetadata,
): PixivConfigFieldMetadata => ({
  label,
  description,
  kind: 'text',
  path,
});

const section = (
  eng_category: string,
  zh_category: string,
  description: string,
  fields: Record<string, PixivConfigFieldMetadata>,
): PixivConfigSectionMetadata => ({
  eng_category,
  zh_category,
  description,
  fields,
});

/**
 * PixivUtil2's configuration names and descriptions are based on the local
 * version's common/PixivConfig.py and readme.md. Keys are lower-cased because
 * ConfigParser exposes option names that way in the web API.
 */
export const pixivConfigMetadata: Record<string, PixivConfigSectionMetadata> = {
  Network: section('Network', '網路設定', '控制 PixivUtil2 的連線、重試與版本檢查行為。', {
    useproxy: booleanField('啟用代理伺服器', '設為 True 後，所有網路請求會使用 proxyAddress 指定的代理。'),
    proxyaddress: textField('代理伺服器位址', '支援 http、socks4、socks5 格式，也可包含帳號、密碼與連接埠。'),
    useragent: textField('瀏覽器 User-Agent', '送給 Pixiv 的瀏覽器識別字串；通常維持瀏覽器目前的 User-Agent。'),
    userobots: booleanField('讀取 robots.txt', '是否下載並遵循 mechanize 使用的 robots.txt 規則。'),
    timeout: numberField('連線逾時秒數', '連線等待超過此秒數後視為失敗。'),
    retry: numberField('失敗重試次數', '網路請求失敗時的重試次數。'),
    retrywait: numberField('重試等待秒數', '每次重試前等待的秒數。'),
    downloaddelay: numberField('下載延遲上限', '每個作品下載前的隨機延遲上限；設為 0 可停用。'),
    checknewversion: booleanField('檢查新版本', '是否檢查 GitHub 上的 PixivUtil2 新版本。'),
    notifybetaversion: booleanField('通知 Beta 版本', '是否顯示 Beta 版本更新通知。'),
    opennewversion: booleanField('開啟新版本頁面', '發現新版本時是否自動在瀏覽器開啟發行頁面。'),
    enablesslverification: booleanField('驗證 SSL 憑證', '是否驗證 SSL 憑證；只有持續遇到 SSL 錯誤時才建議停用。'),
  }),

  Debug: section('Debug', '除錯與日誌', '控制除錯頁面、日誌輸出與主控台顯示。', {
    loglevel: textField('日誌層級', '可用值為 CRITICAL、ERROR、WARNING、INFO、DEBUG、NOTSET。'),
    enabledump: booleanField('啟用 HTML Dump', '發生錯誤時是否保存 HTML 頁面供除錯。'),
    skipdumpfilter: textField('略過 Dump 的錯誤碼', '用正規表示式指定不保存 HTML Dump 的錯誤碼，例如 1.*|2.*。'),
    dumpmediumpage: booleanField('保存 Medium 頁面', '是否保存所有 medium 頁面供除錯。'),
    dumptagsearchpage: booleanField('保存標籤搜尋頁面', '是否保存標籤搜尋頁面供除錯。'),
    debughttp: booleanField('輸出 HTTP Header', '是否在主控台輸出 HTTP header，適合診斷連線問題。'),
    disablelog: booleanField('停用日誌檔', '是否停用 PixivUtil2 日誌檔案輸出。'),
    disablescreenclear: booleanField('停用清除主控台', '是否保留主控台畫面，不在流程中清除既有輸出。'),
  }),

  IrfanView: section('IrfanView', 'IrfanView 整合', '控制下載完成後啟動 IrfanView 與建立下載清單。', {
    irfanviewpath: pathField('IrfanView 安裝路徑', 'IrfanView 的安裝目錄；啟動 IrfanView 功能時需要設定。', {
      mode: 'folder', purpose: 'irfanview-directory', access: 'read',
    }),
    startirfanview: booleanField('完成後啟動 IrfanView', '結束 PixivUtil2 時是否以下載圖片啟動 IrfanView。'),
    startirfanslide: booleanField('完成後啟動幻燈片', '結束 PixivUtil2 時是否啟動 IrfanView 幻燈片播放。'),
    createdownloadlists: booleanField('自動建立下載清單', '是否自動建立供 IrfanView 使用的下載清單。'),
  }),

  Settings: section('Settings', '一般設定', '控制下載根目錄、資料庫與圖片資訊輸出方式。', {
    downloadlistdirectory: pathField('下載清單目錄', 'list.txt 與 IrfanView 下載清單的保存位置；留白時使用 PixivUtil2 目錄。', {
      mode: 'folder', purpose: 'download-list-directory', access: 'write',
    }),
    uselist: booleanField('讀取 list.txt', '是否解析 list.txt，並用它更新 member_id 與自訂下載資料夾。'),
    processfromdb: booleanField('從資料庫讀取繪師資料夾', '是否使用資料庫中記錄的 member_id 與資料夾資訊。'),
    rootdirectory: pathField('圖片根目錄', '下載圖片與作品資料夾的根目錄。', {
      mode: 'folder', purpose: 'root-directory', access: 'read',
    }),
    downloadavatar: booleanField('下載繪師頭像', '是否將繪師頭像下載為各資料夾中的 folder.jpg。'),
    usesuppresstags: booleanField('排除被抑制的標籤', '是否從 %tags% 中移除 suppress_tags.txt 列出的標籤。'),
    tagslimit: numberField('標籤數量上限', '檔名中的 %tags% 最多使用幾個標籤；設為 -1 代表使用全部標籤。'),
    writeimagejson: booleanField('輸出圖片 JSON', '是否輸出精簡的圖片資訊 JSON；檔名使用 filenameInfoFormat。'),
    writeimageinfo: booleanField('輸出圖片文字資訊', '是否輸出精簡的圖片資訊文字檔；檔名使用 filenameInfoFormat。'),
    writerawjson: booleanField('輸出原始 JSON', '是否保存來源端未修改的原始圖片 JSON。'),
    rawjsonfilter: textAreaField('原始 JSON 欄位過濾', '用逗號分隔要從 writeRawJSON 移除的 JSON 欄位。'),
    includeseriesjson: booleanField('輸出系列 JSON', '是否輸出作品系列資訊 JSON；非系列作品不會有此資訊。'),
    writeimagexmp: booleanField('輸出 XMP 資訊檔', '是否輸出圖片資訊 XMP sidecar 檔，不會直接修改圖片標頭。'),
    writeimagexmpperimage: booleanField('每張圖片輸出 XMP', '是否為漫畫或每張編碼後的圖片各輸出一個 XMP；啟用後會優先於 writeImageXMP。'),
    verifyimage: booleanField('驗證下載檔案', '是否檢查下載檔案是否為有效圖片或 ZIP。'),
    writeurlindescription: booleanField('保存描述中的 URL', '是否把作品描述裡找到的 URL 輸出到根目錄的 URL 清單檔。'),
    striphtmltagsfromcaption: booleanField('移除描述中的 HTML', '輸出 metadata 時是否移除描述中的 HTML 標籤與其內容；連結文字也會被移除。'),
    urlblacklistregex: textAreaField('URL 黑名單正規表示式', '用正規表示式過濾作品描述中的 URL。'),
    dbpath: pathField('資料庫路徑', '指定要使用的 SQLite 資料庫；留白時使用預設資料庫。', {
      mode: 'save-file', purpose: 'database-file', extensions: ['.db', '.sqlite', '.sqlite3'], access: 'read-write',
    }),
    setlastmodified: booleanField('設定檔案修改時間', '是否依 Pixiv 作品上傳時間設定本機檔案的最後修改時間。'),
    uselocaltimezone: booleanField('使用本地時區', '輸出文字資訊與 XMP 時是否使用本機時區。'),
    defaultsketchoption: textField('Pixiv Sketch 預設選項', '略過下載 member_id 時的提示；填 y 一律包含、填 n 一律排除 Sketch。'),
  }),

  Filename: section('Filename', '檔名與資料夾', '控制圖片、資訊檔、系列資料與標籤目錄的命名規則。', {
    filenameformat: textAreaField('一般作品檔名格式', '一般圖片使用的檔名模板；保留字元會被清理，完整路徑最長 250 個字元。'),
    filenamemangaformat: textAreaField('漫畫頁檔名格式', '漫畫每一頁使用的檔名模板；可搭配 %page_index% 或 %page_number%。'),
    filenameinfoformat: textAreaField('圖片資訊檔名格式', '圖片 JSON、文字資訊與 XMP 等資訊檔使用的檔名模板。'),
    filenamemangainfoformat: textAreaField('漫畫資訊檔名格式', '漫畫資訊檔使用的檔名模板。'),
    filenameseriesjson: textAreaField('系列 JSON 檔名格式', '系列資訊 JSON 使用的檔名模板，常用 %manga_series_id% 與 %manga_series_title%。'),
    filenameformatsketch: textAreaField('Pixiv Sketch 檔名格式', 'Pixiv Sketch 作品使用的檔名模板。'),
    filenameformatnovel: textAreaField('小說檔名格式', 'Pixiv 小說使用的檔名模板，常用系列 ID、順序與 URL 檔名。'),
    avatarnameformat: textAreaField('頭像檔名格式', '繪師頭像使用的檔名模板；可用的替換變數比一般圖片少。'),
    backgroundnameformat: textAreaField('背景圖檔名格式', '繪師背景圖使用的檔名模板；可用的替換變數比一般圖片少。'),
    tagsseparator: textField('標籤分隔字元', '檔名中多個標籤之間使用的分隔字元；可用 %space% 或 %ideo_space%。'),
    createmangadir: booleanField('建立漫畫資料夾', '漫畫模式下載時，是否依 image_id 的 _pxx 分段建立資料夾。'),
    usetagsasdir: booleanField('以搜尋標籤建立資料夾', '是否把 tagslist.txt 的查詢標籤附加到根目錄作為保存資料夾。'),
    urldumpfilename: textField('URL 清單檔名格式', 'URL 清單檔名的 strftime 格式；預設為 url_list_%Y%m%d。'),
    usetranslatedtag: booleanField('使用翻譯後標籤', '檔名中的 %tags% 是否使用翻譯後的標籤。'),
    tagtranslationlocale: textField('標籤翻譯語系', '指定標籤翻譯使用的語系，例如 en。'),
    custombadchars: textAreaField('自訂非法字元規則', '用正規表示式自訂檔名清理規則；會套用到檔名消毒流程。'),
    customcleanupre: textAreaField('自訂檔名清理規則', '用正規表示式移除或清理檔名內容；語法需符合 PixivUtil2 清理規則。'),
  }),

  Authentication: section('Authentication', '登入與驗證', '儲存 Pixiv、Fanbox 與 Cloudflare 登入所需的認證資訊。', {
    username: textField('Pixiv 使用者名稱', 'OAuth 登入用的 Pixiv 使用者名稱或電子郵件地址。'),
    password: secretField('Pixiv 密碼', 'OAuth 登入用的密碼；PixivUtil2 會以明文讀取此設定，請妥善保護檔案。'),
    cookie: secretField('Pixiv Cookie', 'Pixiv 登入 Cookie；成功登入後可能由 PixivUtil2 自動更新。'),
    cookiefanbox: secretField('Fanbox Cookie', 'fanbox.cc 使用的 Cookie，通常不需要手動填寫。'),
    cookiefanboxtemp: secretField('Fanbox 暫存 Cookie', 'Fanbox 登入流程使用的暫時 Cookie。'),
    refresh_token: secretField('OAuth Refresh Token', 'OAuth 重新整理 token，可避免頻繁重新登入，通常由登入流程自動產生。'),
    cf_clearance: secretField('Cloudflare clearance', 'Cloudflare clearance Cookie；只有遇到 Cloudflare 驗證時才需要。'),
    cf_bm: secretField('Cloudflare bot management', 'Cloudflare bot management Cookie；只有需要時才填寫。'),
  }),

  Pixiv: section('Pixiv', 'Pixiv 下載', '控制 Pixiv 作品範圍、R-18 過濾與資料庫自動補充資訊。', {
    numberofpage: numberField('處理頁數上限', '要處理的頁數；設為 0 代表處理全部頁面。'),
    r18mode: booleanField('僅下載 R-18', '會員、書籤與標籤搜尋時，是否只列出標記為 R-18 的作品。'),
    r18type: numberField('R-18 類型篩選', '0 代表 R-18 與 R-18G 都下載，1 只下載 R-18，2 只下載 R-18G。'),
    dateformat: textField('Pixiv 日期格式', 'Pixiv 日期時間的 strftime 格式；留白使用預設 YYYY-MM-DD。'),
    autoaddmember: booleanField('自動加入繪師', '所有下載時是否自動把繪師 member_id 寫入資料庫。'),
    autoaddtag: booleanField('自動加入標籤', '所有下載時是否自動把作品標籤寫入資料庫。'),
    autoaddcaption: booleanField('自動加入描述', '所有下載時是否自動把作品描述寫入資料庫。'),
    autoaddseries: booleanField('自動加入系列', '所有下載時是否自動把系列資訊寫入資料庫。'),
    aidisplayfewer: booleanField('排除 AI 生成作品', '是否過濾 aiType 為 2 的 AI 生成作品。'),
  }),

  FANBOX: section('FANBOX', 'FANBOX 下載', '控制 Fanbox 封面、文章 HTML 與作品資訊的保存方式。', {
    filenameformatfanboxcover: textAreaField('Fanbox 封面檔名格式', 'Fanbox 文章封面圖片使用的檔名模板。'),
    filenameformatfanboxcontent: textAreaField('Fanbox 內容檔名格式', 'Fanbox 文章內圖片使用的檔名模板。'),
    filenameformatfanboxinfo: textAreaField('Fanbox 資訊檔名格式', 'Fanbox 文章資訊與 HTML 使用的檔名模板。'),
    writehtml: booleanField('輸出 Fanbox HTML', '是否把 Fanbox 文章寫成 HTML；非文章會依文字長度與圖片數判斷。'),
    mintextlengthfornonarticle: numberField('非文章最少文字長度', 'writeHtml 啟用時，非文章至少要有多少文字才輸出 HTML。'),
    minimagecountfornonarticle: numberField('非文章最少圖片數', 'writeHtml 啟用時，非文章至少要有多少張圖片才輸出 HTML。'),
    useabsolutepathsinhtml: booleanField('HTML 使用絕對路徑', 'Fanbox HTML 是否使用絕對檔案路徑；False 則使用相對路徑。'),
    downloadcoverwhenrestricted: booleanField('下載受限文章封面', '是否在 Fanbox 文章受限時仍下載文章封面。'),
    downloadcover: booleanField('下載 Fanbox 封面', '是否下載 Fanbox 文章的封面圖片。'),
    checkdbprocesshistory: booleanField('檢查 Fanbox 處理歷史', '是否依資料庫中的 updated_date 跳過尚未變更的 Fanbox 文章。'),
    listpathfanbox: pathField('Fanbox 清單檔案', 'Fanbox creator 清單檔案；每行一個 creator，原生設定不支援自訂路徑。', {
      mode: 'existing-file', purpose: 'fanbox-list-file', extensions: ['.txt', '.csv'], access: 'read',
    }),
  }),

  FFmpeg: section('FFmpeg', 'FFmpeg 轉檔', '控制 Ugoira 轉換成影片或動畫圖片時使用的 FFmpeg 執行檔與參數。', {
    ffmpeg: pathField('FFmpeg 執行檔', 'FFmpeg 可執行檔路徑；可填完整路徑或系統 PATH 中可找到的檔名。', {
      mode: 'existing-file', purpose: 'ffmpeg-executable', extensions: ['.exe', '.bat', '.cmd'], access: 'read',
    }),
    ffmpegcodec: textField('WebM 編碼器', '建立 WebM 時使用的 FFmpeg codec，例如 libvpx-vp9。'),
    ffmpegext: textField('WebM 副檔名', '建立 WebM 時使用的容器副檔名。'),
    ffmpegparam: textAreaField('WebM FFmpeg 參數', '建立 WebM 時傳給 FFmpeg 的完整參數。'),
    mkvcodec: textField('MKV 編碼器', '建立 MKV 時使用的 codec；copy 代表不重新編碼。'),
    mkvparam: textAreaField('MKV FFmpeg 參數', '建立 MKV 時傳給 FFmpeg 的參數。'),
    webpcodec: textField('WebP 編碼器', '建立 WebP 動畫時使用的 codec，例如 libwebp。'),
    webpparam: textAreaField('WebP FFmpeg 參數', '建立 WebP 動畫時傳給 FFmpeg 的完整參數。'),
    gifparam: textAreaField('GIF FFmpeg 參數', '建立 GIF 時傳給 FFmpeg 的完整參數，通常包含 palettegen/paletteuse。'),
    apngparam: textAreaField('APNG FFmpeg 參數', '建立 APNG 時傳給 FFmpeg 的完整參數。'),
    avifcodec: textField('AVIF 編碼器', '建立 AVIF 動畫時使用的 codec，例如 libaom-av1。'),
    avifparam: textAreaField('AVIF FFmpeg 參數', '建立 AVIF 動畫時傳給 FFmpeg 的完整參數。'),
    verboseoutput: booleanField('顯示 FFmpeg 詳細輸出', '是否顯示 FFmpeg 的詳細命令與輸出內容。'),
  }),

  Ugoira: section('Ugoira', 'Ugoira 動圖', '控制 Pixiv Ugoira 原始檔保存與各種輸出格式。', {
    writeugoirainfo: booleanField('輸出 Ugoira frame 資訊', '是否把 Ugoira 每幀資訊寫入資訊 ZIP；writeImageJSON 也會包含這些資訊。'),
    createugoira: booleanField('建立 Ugoira 檔案', '是否建立 Pixiv 原生的 .ugoira 動畫檔。'),
    createmkv: booleanField('建立 MKV', '是否把 Ugoira 轉成 MKV；需要 FFmpeg，預設通常不重新編碼。'),
    createwebm: booleanField('建立 WebM', '是否把 Ugoira 轉成 WebM；需要 FFmpeg。'),
    createwebp: booleanField('建立 WebP', '是否把 Ugoira 轉成動畫 WebP；需要 FFmpeg。'),
    creategif: booleanField('建立 GIF', '是否把 Ugoira 轉成 GIF；需要 FFmpeg。'),
    createapng: booleanField('建立 APNG', '是否把 Ugoira 轉成動畫 PNG；需要 FFmpeg。'),
    createavif: booleanField('建立 AVIF', '是否把 Ugoira 轉成動畫 AVIF；需要 FFmpeg。'),
    deleteugoira: booleanField('轉檔後刪除 Ugoira', '轉檔完成後是否刪除產生的 .ugoira 檔案。'),
    deletezipfile: booleanField('轉檔後刪除 ZIP', 'Ugoira 轉檔完成後是否刪除原始 ZIP 圖片檔。'),
  }),

  DownloadControl: section('DownloadControl', '下載控制', '控制檔案大小、更新判斷、黑名單、後處理與壓縮保存。', {
    minfilesize: numberField('最小檔案大小', '檔案小於此大小時跳過；設為 0 停用此限制。'),
    maxfilesize: numberField('最大檔案大小', '檔案大於此大小時跳過；設為 0 停用此限制。'),
    checklastmodified: booleanField('檢查檔案修改時間', '本機檔案修改時間與作品上傳時間相同時跳過；需要 setLastModified 啟用。'),
    alwayscheckfilesize: booleanField('總是檢查檔案大小', '即使資料庫已有紀錄，也重新取得遠端大小確認檔案狀態。'),
    overwrite: booleanField('覆寫不同大小的檔案', '檔案大小不同時是否刪除舊檔並重新下載；backupOldFile 可先保存舊檔。'),
    backupoldfile: booleanField('備份舊檔案', '重新下載前是否將舊檔重新命名為帶有 Unix time 的備份檔。'),
    daylastupdated: numberField('繪師更新間隔天數', '只處理距離上次檢查至少經過這麼多天的 member_id。'),
    checkupdatedlimit: numberField('已下載作品檢查上限', '看到指定數量的既有作品後跳到下一個 member_id；需關閉 alwaysCheckFileSize。'),
    useblacklisttags: booleanField('啟用標籤黑名單', '含有 blacklist_tags.txt 標籤的作品會被跳過。'),
    useblacklisttitles: booleanField('啟用標題黑名單', '標題含有 blacklist_titles.txt 字串的作品會被跳過。'),
    useblacklisttitlesregex: booleanField('以正規表示式比對標題', '是否把標題黑名單中的每一行當作正規表示式。'),
    datediff: numberField('作品日期差距', '只處理指定日期差距內的新作品；設為 0 停用。'),
    enableinfiniteloop: booleanField('啟用標籤下載無限迴圈', '標籤下載以最新到最舊順序執行時，是否持續輪詢新作品。'),
    useblacklistmembers: booleanField('啟用繪師黑名單', '依應用程式目錄的 blacklist_members.txt 跳過指定 member_id。'),
    downloadresized: booleanField('下載中尺寸圖片', '是否下載 medium 尺寸，而不是原始尺寸圖片。'),
    skipunknownsize: booleanField('略過未知大小檔案', 'alwaysCheckFileSize 啟用但遠端大小未知時，是否跳過下載。'),
    enablepostprocessing: booleanField('啟用下載後處理', '每個檔案下載完成後是否執行 postProcessingCmd。'),
    postprocessingcmd: textAreaField('下載後處理命令', '每次下載完成後執行的命令；使用 %filename% 代入檔案名稱，命令錯誤不會被處理。'),
    extensionfilter: textField('副檔名過濾器', '以 | 分隔可接受的副檔名，例如 jpg|png|gif|ugoira。'),
    downloadbuffer: numberField('下載緩衝區 KB', '寫入磁碟前使用的下載緩衝區大小（KB）；通常維持預設 512 即可。'),
    createpixivarchive: booleanField('建立 Pixiv 壓縮檔', '是否把作品下載成 ZIP archive，而不是建立資料夾。'),
    createpixivarchivecompressiontype: textField('壓縮演算法', 'ZIP_STORED、ZIP_DEFLATED、ZIP_BZIP2 或 ZIP_LZMA；預設 ZIP_STORED 不壓縮。'),
    createpixivarchivecompressionlevel: numberField('壓縮等級', 'ZIP_DEFLATED 或 ZIP_BZIP2 使用的壓縮等級；有效範圍為 0 到 9。'),
    autoextractzip: booleanField('自動解壓縮 ZIP', '下載 ZIP 後是否自動解壓縮並整理內容。'),
    deletezipafterextract: booleanField('解壓後刪除 ZIP', '自動解壓縮完成後是否刪除原始 ZIP 檔。'),
  }),
};

/** Inventory used by the settings UI and tests to keep path fields explicit. */
export const pixivPathFieldInventory = Object.entries(pixivConfigMetadata).flatMap(([section, metadata]) =>
  Object.entries(metadata.fields).flatMap(([option, field]) => (
    field.path ? [{ section, option, ...field.path }] : []
  )),
);

export function getSectionMetadata(sectionName: string): PixivConfigSectionMetadata | undefined {
  const direct = pixivConfigMetadata[sectionName];
  if (direct) return direct;

  const normalized = sectionName.toLowerCase();
  const matchingKey = Object.keys(pixivConfigMetadata).find(key => key.toLowerCase() === normalized);
  return matchingKey ? pixivConfigMetadata[matchingKey] : undefined;
}

const getCanonicalSectionName = (sectionName: string): string | undefined => {
  if (pixivConfigMetadata[sectionName]) return sectionName;
  const normalized = sectionName.toLowerCase();
  return Object.keys(pixivConfigMetadata).find(key => key.toLowerCase() === normalized);
};

export function getFieldMetadata(sectionName: string, optionName: string): PixivConfigFieldMetadata {
  const sectionMetadata = getSectionMetadata(sectionName);
  const fieldMetadata = sectionMetadata?.fields[optionName.toLowerCase()];
  return fieldMetadata ?? textField(optionName, '此欄位未被目前版本的 PixivUtil2 文件列出，請保留原始設定格式。');
}

interface LocalizedConfigCopy {
  label: string;
  description: string;
}

interface ConfigLocaleDictionary {
  sections: Record<string, LocalizedConfigCopy>;
  fields: Record<string, LocalizedConfigCopy>;
}

const configLocaleDictionaries: Record<UiLanguage, ConfigLocaleDictionary> = {
  'zh-TW': configZhTW,
  'zh-CN': configZhCN,
  en: configEn,
  ja: configJa,
};

const unknownFieldDescriptions: Record<UiLanguage, string> = {
  'zh-TW': '此欄位未被目前版本的 PixivUtil2 文件列出，請保留原始設定格式。',
  'zh-CN': '当前版本的 PixivUtil2 文档未列出此字段，请保留原始设置格式。',
  en: 'This field is not documented by the current PixivUtil2 version. Preserve its original format.',
  ja: 'この項目は現在の PixivUtil2 ドキュメントにありません。元の設定形式を維持してください。',
};

const optionWords = [
  'download', 'directory', 'filename', 'number', 'page', 'of', 'process', 'database', 'db', 'proxy',
  'address', 'useragent', 'user', 'agent', 'robots', 'timeout', 'retry', 'wait',
  'delay', 'check', 'new', 'version', 'notify', 'beta', 'open', 'enable', 'disable',
  'verification', 'verify', 'ssl', 'log', 'level', 'dump', 'skip', 'filter', 'medium',
  'tag', 'search', 'debug', 'http', 'screen', 'clear', 'irfanview', 'irfan', 'view',
  'start', 'slide', 'create', 'list', 'settings', 'use', 'from', 'root', 'avatar',
  'suppress', 'limit', 'write', 'image', 'raw', 'json', 'include', 'series', 'xmp',
  'per', 'url', 'strip', 'html', 'caption', 'local', 'timezone', 'default', 'sketch',
  'option', 'file', 'manga', 'novel', 'background', 'separator', 'translated',
  'translation', 'locale', 'custom', 'bad', 'chars', 'cleanup', 'username', 'password',
  'cookie', 'fanbox', 'temp', 'clearance', 'bm', 'r18', 'mode', 'type', 'date', 'auto',
  'add', 'display', 'fewer', 'cover', 'content', 'info', 'min', 'text', 'length',
  'article', 'absolute', 'paths', 'restricted', 'history', 'path', 'ffmpeg', 'codec',
  'ext', 'param', 'webm', 'mkv', 'webp', 'gif', 'apng', 'avif', 'ugoira', 'frame',
  'delete', 'zip', 'control', 'size', 'last', 'modified', 'always', 'overwrite',
  'backup', 'old', 'day', 'updated', 'infinite', 'loop', 'member', 'resized', 'unknown',
  'post', 'processing', 'cmd', 'extension', 'buffer', 'archive', 'compression',
  'extract', 'pixiv', 'series', 'fanbox',
].sort((left, right) => right.length - left.length);

const optionDisplayWords: Record<string, string> = {
  agent: 'agent',
  apng: 'APNG',
  avif: 'AVIF',
  bm: 'BM',
  cmd: 'command',
  db: 'DB',
  ext: 'extension',
  fanbox: 'FANBOX',
  ffmpeg: 'FFmpeg',
  gif: 'GIF',
  html: 'HTML',
  http: 'HTTP',
  id: 'ID',
  irfanview: 'IrfanView',
  json: 'JSON',
  manga: 'manga',
  mkv: 'MKV',
  pixiv: 'Pixiv',
  r18: 'R-18',
  ssl: 'SSL',
  url: 'URL',
  webm: 'WebM',
  webp: 'WebP',
  xmp: 'XMP',
  zip: 'ZIP',
};

const humanizeOptionName = (optionName: string): string => {
  let remaining = optionName.toLowerCase().replace(/_/g, '');
  const words: string[] = [];
  while (remaining.length > 0) {
    const match = optionWords.find(word => remaining.startsWith(word));
    if (!match) {
      words.push(remaining.slice(0, 1));
      remaining = remaining.slice(1);
      continue;
    }
    words.push(optionDisplayWords[match] || match);
    remaining = remaining.slice(match.length);
  }
  const label = words.join(' ').replace(/\s+/g, ' ').trim();
  return label ? `${label.slice(0, 1).toUpperCase()}${label.slice(1)}` : optionName;
};

export function getLocalizedFieldMetadata(
  sectionName: string,
  optionName: string,
  language: UiLanguage,
): PixivConfigFieldMetadata {
  const metadata = getFieldMetadata(sectionName, optionName);
  const canonicalSectionName = getCanonicalSectionName(sectionName);
  const localized = canonicalSectionName
    ? configLocaleDictionaries[language].fields[`${canonicalSectionName}.${optionName.toLowerCase()}`]
    : undefined;
  if (localized) {
    return {
      ...metadata,
      ...localized,
    };
  }

  const label = language === 'zh-TW' ? metadata.label : humanizeOptionName(optionName);
  return {
    ...metadata,
    label,
    description: unknownFieldDescriptions[language],
  };
}

export function getLocalizedSectionMetadata(
  sectionName: string,
  language: UiLanguage,
): PixivConfigSectionMetadata | undefined {
  const metadata = getSectionMetadata(sectionName);
  if (!metadata) return undefined;
  const canonicalSectionName = getCanonicalSectionName(sectionName);
  const localized = canonicalSectionName
    ? configLocaleDictionaries[language].sections[canonicalSectionName]
    : undefined;
  const label = localized?.label ?? metadata.zh_category;
  return {
    ...metadata,
    zh_category: label,
    description: localized?.description ?? metadata.description,
    fields: Object.fromEntries(
      Object.keys(metadata.fields).map(optionName => [
        optionName,
        getLocalizedFieldMetadata(sectionName, optionName, language),
      ]),
    ),
  };
}
