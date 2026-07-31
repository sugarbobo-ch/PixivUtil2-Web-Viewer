import React, { useState, useEffect } from 'react';
import { Settings, Sliders, Search, Shield, RefreshCw, Save, RotateCcw, X, CheckCircle2, AlertCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const [mainTab, setMainTab] = useState<'web' | 'pixiv' | 'backup'>('web');

  // Web Viewer Config State (web_config.json)
  const [webConfig, setWebConfig] = useState({
    webTheme: 'dark',
    defaultViewMode: 'grid',
    thumbnailWidth: 320,
    thumbnailHeight: 320,
    itemsPerPage: 200,
    autoOpenBrowser: true,
  });

  // PixivUtil2 Config State (config.ini)
  const [pixivSections, setPixivSections] = useState<Record<string, Record<string, string>>>({});
  const [activeSection, setActiveSection] = useState<string>('Settings');
  const [sectionFilter, setSectionFilter] = useState<string>('');
  const [hasBackup, setHasBackup] = useState(false);

  // Status & Feedback
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  // Fetch configs on open
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      Promise.all([
        fetch('/api/web-config').then(res => res.json()),
        fetch('/api/pixiv-config').then(res => res.json()),
      ])
        .then(([webData, pixivData]) => {
          setWebConfig(webData);
          if (pixivData.sections) {
            setPixivSections(pixivData.sections);
            const keys = Object.keys(pixivData.sections);
            if (keys.length > 0 && !keys.includes('Settings')) {
              setActiveSection(keys[0]);
            }
          }
          setHasBackup(!!pixivData.hasBackup);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load configs:', err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  // Handle Web Config Updates
  const handleSaveWebConfig = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/web-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webConfig),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Web Viewer 專屬設定已成功儲存！' });
        onSettingsSaved();
      } else {
        setMessage({ type: 'error', text: '儲存 Web 設定失敗。' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `系統錯誤: ${err}` });
    } finally {
      setLoading(false);
    }
  };

  // Handle PixivUtil2 config.ini Updates
  const handleSavePixivConfig = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const updates: { section: string; option: string; value: string }[] = [];
      Object.entries(pixivSections).forEach(([sec, options]) => {
        Object.entries(options).forEach(([opt, val]) => {
          updates.push({ section: sec, option: opt, value: String(val) });
        });
      });

      const res = await fetch('/api/pixiv-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: 'PixivUtil2 config.ini 已安全儲存！已自動建立 config.ini.bak 備份。' });
        setHasBackup(true);
        setShowSaveConfirm(false);
        onSettingsSaved();
      } else {
        setMessage({ type: 'error', text: data.detail || '儲存失敗，已從備份自動還原。' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `系統錯誤: ${err}` });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/restore', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: '已成功從 config.ini.bak 還原原設定！' });
        onSettingsSaved();
      } else {
        setMessage({ type: 'error', text: data.detail || '還原失敗。' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `還原出錯: ${err}` });
    } finally {
      setLoading(false);
    }
  };

  const handleRescanDirectory = async () => {
    setScanning(true);
    setMessage(null);
    try {
      const rootDir = pixivSections['Settings']?.['rootdirectory'] || '.';
      const res = await fetch('/api/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: rootDir }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: `掃描完成！共掃描 ${data.scanned} 個檔案，新增建立 ${data.indexed} 筆作品索引！`,
        });
        onSettingsSaved();
      } else {
        setMessage({ type: 'error', text: data.error || '掃描失敗。' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `掃描出錯: ${err}` });
    } finally {
      setScanning(false);
    }
  };

  const handleCleanOrphans = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/db/clean-orphans', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: `資料庫清理完成！共清除 ${data.deleted_members} 筆孤兒與無效繪師紀錄。`,
        });
        onSettingsSaved();
      } else {
        setMessage({ type: 'error', text: '清理資料庫失敗。' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `清理出錯: ${err}` });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const sectionKeys = Object.keys(pixivSections);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col text-zinc-100 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/90">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-lg text-white">PixivUtil2 系統與 Web 設定管理</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Messages */}
        {message && (
          <div className={`px-6 py-3 text-xs flex items-center gap-2 ${
            message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-b border-rose-500/20'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Main Tab Navigation */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/60 px-6 pt-2">
          <button
            onClick={() => setMainTab('web')}
            className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              mainTab === 'web'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-4 h-4" /> Web Viewer 獨立設定 (web_config.json)
          </button>

          <button
            onClick={() => setMainTab('pixiv')}
            className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              mainTab === 'pixiv'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Settings className="w-4 h-4" /> PixivUtil2 全區塊設定 (config.ini)
          </button>

          <button
            onClick={() => setMainTab('backup')}
            className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              mainTab === 'backup'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Shield className="w-4 h-4" /> 備份與還原
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* WEB VIEWER DEDICATED CONFIG */}
          {mainTab === 'web' && (
            <div className="space-y-4">
              <div className="p-4 bg-zinc-800/50 border border-zinc-700/60 rounded-xl space-y-3">
                <h4 className="font-bold text-sm text-indigo-300">Web 介面呈現偏好</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-zinc-300 mb-1">預設主題 (webTheme)</label>
                    <select
                      value={webConfig.webTheme}
                      onChange={(e) => setWebConfig({ ...webConfig, webTheme: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="dark">Dark 深色模式</option>
                      <option value="light">Light 淺色模式</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-300 mb-1">預設觀看模式 (defaultViewMode)</label>
                    <select
                      value={webConfig.defaultViewMode}
                      onChange={(e) => setWebConfig({ ...webConfig, defaultViewMode: e.target.value })}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="grid">Grid 網格瀑布流</option>
                      <option value="fullscreen">Fullscreen 滾輪翻頁</option>
                      <option value="webtoon">Webtoon 條漫垂直連畫</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-300 mb-1">縮圖寬度 (thumbnailWidth)</label>
                    <input
                      type="number"
                      value={webConfig.thumbnailWidth}
                      onChange={(e) => setWebConfig({ ...webConfig, thumbnailWidth: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block font-medium text-zinc-300 mb-1">每頁顯示數量 (itemsPerPage)</label>
                    <input
                      type="number"
                      value={webConfig.itemsPerPage}
                      onChange={(e) => setWebConfig({ ...webConfig, itemsPerPage: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSaveWebConfig}
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors shadow-md"
                  >
                    <Save className="w-4 h-4" /> 儲存 Web 專屬設定
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PIXIVUTIL2 COMPLETE ALL-SECTION CONFIG.INI */}
          {mainTab === 'pixiv' && (
            <div className="space-y-4">
              {/* Section Search Filter */}
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    value={sectionFilter}
                    onChange={(e) => setSectionFilter(e.target.value)}
                    placeholder="搜尋 config.ini 關鍵字 (如 rootDirectory, proxy, cookie)..."
                    className="w-full pl-9 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  onClick={handleRescanDirectory}
                  disabled={scanning}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center gap-1.5 shrink-0"
                >
                  <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                  <span>{scanning ? '掃描中...' : '掃描圖庫索引'}</span>
                </button>
              </div>

              {/* Section Badges Navigation */}
              <div className="flex flex-wrap gap-1.5 border-b border-zinc-800 pb-2">
                {sectionKeys.map(sec => (
                  <button
                    key={sec}
                    onClick={() => setActiveSection(sec)}
                    className={`px-3 py-1 rounded-md font-medium text-xs transition-colors ${
                      activeSection === sec
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    [{sec}]
                  </button>
                ))}
              </div>

              {/* Active Section Key-Value Form Fields */}
              <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                {pixivSections[activeSection] &&
                  Object.entries(pixivSections[activeSection])
                    .filter(([key, val]) =>
                      !sectionFilter ||
                      key.toLowerCase().includes(sectionFilter.toLowerCase()) ||
                      String(val).toLowerCase().includes(sectionFilter.toLowerCase())
                    )
                    .map(([optKey, optVal]) => (
                      <div key={optKey} className="flex items-center justify-between gap-4 p-2 bg-zinc-800/40 rounded-lg border border-zinc-800">
                        <label className="font-mono text-zinc-300 w-1/3 truncate" title={optKey}>
                          {optKey}
                        </label>
                        <input
                          type="text"
                          value={optVal}
                          onChange={(e) => {
                            const newVal = e.target.value;
                            setPixivSections(prev => ({
                              ...prev,
                              [activeSection]: {
                                ...prev[activeSection],
                                [optKey]: newVal,
                              },
                            }));
                          }}
                          className="flex-1 px-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    ))}
              </div>
            </div>
          )}

          {/* BACKUP & RESTORE TAB */}
          {mainTab === 'backup' && (
            <div className="space-y-4">
              <div className="p-4 bg-zinc-800/60 border border-zinc-700 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-zinc-200">自動備份狀態 (config.ini.bak)</h4>
                    <p className="text-[11px] text-zinc-400">每次儲存 PixivUtil2 設定前均會自動備份。</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full font-semibold ${
                    hasBackup ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-700 text-zinc-400'
                  }`}>
                    {hasBackup ? '已備份 (config.ini.bak)' : '尚無備份'}
                  </span>
                </div>

                {hasBackup && (
                  <button
                    onClick={handleRestoreBackup}
                    disabled={loading}
                    className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" /> 還原至上一次備份檔 (config.ini.bak)
                  </button>
                )}
              </div>

              {/* DB Clean Maintenance Box */}
              <div className="p-4 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-rose-300">資料庫清理與維護 (DB Cleanup)</h4>
                    <p className="text-[11px] text-zinc-400">自動清除 `db.sqlite` 中作品數為 0 或檔名誤判建立的孤兒繪師紀錄。</p>
                  </div>
                  <button
                    onClick={handleCleanOrphans}
                    disabled={loading}
                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-md"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    <span>一鍵清理無效繪師紀錄</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-950/80">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            取消
          </button>

          {mainTab === 'pixiv' && (
            <button
              onClick={() => setShowSaveConfirm(true)}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-950"
            >
              <Save className="w-4 h-4" /> 儲存 config.ini 設定
            </button>
          )}
        </div>
      </div>

      {/* Save Confirmation Dialog */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-sm w-full space-y-4 text-zinc-100 shadow-2xl">
            <h4 className="font-bold text-base text-white">確認修改 config.ini 設定？</h4>
            <p className="text-xs text-zinc-300 leading-relaxed">
              系統將會更新 `config.ini` 的內容。在寫入前已為您自動備份成 `config.ini.bak`。如發生例外將會自動復原。
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSaveConfirm(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              >
                思考一下
              </button>
              <button
                onClick={handleSavePixivConfig}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950"
              >
                確定儲存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
