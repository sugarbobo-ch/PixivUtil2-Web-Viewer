import React, { useState, useEffect } from 'react';
import { Settings, Folder, FileText, Shield, RefreshCw, Save, RotateCcw, X, CheckCircle2, AlertCircle } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'paths' | 'format' | 'backup'>('paths');

  // Config State
  const [rootDirectory, setRootDirectory] = useState('');
  const [dbPath, setDbPath] = useState('');
  const [filenameFormat, setFilenameFormat] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);

  // Status & Feedback
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          setRootDirectory(data.rootDirectory || '');
          setDbPath(data.dbPath || '');
          setFilenameFormat(data.filenameFormat || '');
          setOverwrite(!!data.overwrite);
          setHasBackup(!!data.hasBackup);
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load settings:', err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  const handleSaveSettings = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rootDirectory,
          dbPath,
          filenameFormat,
          overwrite,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setMessage({ type: 'success', text: '設定已安全儲存！已自動備份原設定至 config.ini.bak。' });
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
      const res = await fetch('/api/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: rootDirectory }),
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col text-zinc-100 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/90">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-lg text-white">PixivUtil2 系統與下載設定</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert Messages */}
        {message && (
          <div className={`px-6 py-3 text-xs flex items-center gap-2 ${
            message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-b border-rose-500/20'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Tab Selection Navigation */}
        <div className="flex border-b border-zinc-800 bg-zinc-950/60 px-6 pt-2">
          <button
            onClick={() => setActiveTab('paths')}
            className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'paths'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Folder className="w-4 h-4" /> 目錄與圖片掃描
          </button>

          <button
            onClick={() => setActiveTab('format')}
            className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'format'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-4 h-4" /> 檔名格式設定
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`px-4 py-2 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'backup'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Shield className="w-4 h-4" /> 設定備份與還原
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {activeTab === 'paths' && (
            <div className="space-y-4">
              <div>
                <label className="block font-medium text-zinc-300 mb-1">下載與看圖資料夾 (rootDirectory)</label>
                <input
                  type="text"
                  value={rootDirectory}
                  onChange={(e) => setRootDirectory(e.target.value)}
                  placeholder="例如: . 或 D:\PixivDownloads"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-zinc-500 mt-1">PixivUtil2 儲存圖片的本機路徑。修改後可點擊下方按鈕掃描硬碟圖片。</p>
              </div>

              <div>
                <label className="block font-medium text-zinc-300 mb-1">資料庫檔案路徑 (dbPath)</label>
                <input
                  type="text"
                  value={dbPath}
                  onChange={(e) => setDbPath(e.target.value)}
                  placeholder="./db.sqlite"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Rescan & Import Box */}
              <div className="p-4 bg-indigo-950/30 border border-indigo-500/20 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-indigo-300">本機圖片掃描與索引 (Rescan & Index)</h4>
                    <p className="text-[11px] text-zinc-400">當下載目錄有既有圖片但網頁沒顯示時，點擊此處掃描並寫入資料庫。</p>
                  </div>
                  <button
                    onClick={handleRescanDirectory}
                    disabled={scanning}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-lg shadow-indigo-950"
                  >
                    <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
                    <span>{scanning ? '掃描中...' : '即刻掃描並建立索引'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'format' && (
            <div className="space-y-4">
              <div>
                <label className="block font-medium text-zinc-300 mb-1">檔名與資料夾格式 (filenameFormat)</label>
                <input
                  type="text"
                  value={filenameFormat}
                  onChange={(e) => setFilenameFormat(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Available Token Badges */}
              <div>
                <span className="block font-medium text-zinc-400 mb-1">可用 Token 標籤參考:</span>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  {['%artist%', '%member_id%', '%urlFilename%', '%title%', '%works_date_only%', '%image_id%'].map(token => (
                    <span
                      key={token}
                      onClick={() => setFilenameFormat(prev => prev + token)}
                      className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-indigo-300 rounded cursor-pointer transition-colors"
                      title="點擊可插入至檔名格式"
                    >
                      {token}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-medium text-zinc-300">重複下載時自動覆蓋已存在的圖片 (overwrite)</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div className="p-4 bg-zinc-800/80 border border-zinc-700 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold text-zinc-200">自動備份檔狀態</h4>
                    <p className="text-[11px] text-zinc-400">系統會在每次儲存設定前，自動建立 `config.ini.bak` 備份檔以防毀損。</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full font-semibold ${
                    hasBackup ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-700 text-zinc-400'
                  }`}>
                    {hasBackup ? '已備份 (config.ini.bak)' : '尚無備份檔案'}
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
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 bg-zinc-950/80">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
          >
            取消
          </button>

          <button
            onClick={() => setShowSaveConfirm(true)}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-950"
          >
            <Save className="w-4 h-4" /> 儲存設定 (Save)
          </button>
        </div>
      </div>

      {/* Save Confirmation Dialog */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-sm w-full space-y-4 text-zinc-100 shadow-2xl">
            <h4 className="font-bold text-base text-white">確認修改 config.ini 設定？</h4>
            <p className="text-xs text-zinc-300 leading-relaxed">
              系統將會更新 `config.ini`。在寫入前已為您自動備份成 `config.ini.bak`。如發生例外將會自動復原。
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSaveConfirm(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              >
                思考一下
              </button>
              <button
                onClick={handleSaveSettings}
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
