import { useEffect, useState } from 'react';
import type { Provider, UserSettings } from '../../shared/types';
import { loadSettings, saveSettings } from '../../shared/settings';
import { testApiKey } from '../../shared/llm';
import { getPermissionRecords, removePermission, type PermissionInfo } from '../../shared/permissions';

const MODEL_OPTIONS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6（推荐）', provider: 'anthropic' as Provider },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'anthropic' as Provider },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5（更快/更省）', provider: 'anthropic' as Provider },
  { id: 'qwen-vl-max', label: '通义千问 VL Max（多模态，推荐）', provider: 'qwen' as Provider },
  { id: 'qwen-vl-plus', label: '通义千问 VL Plus（多模态，更省）', provider: 'qwen' as Provider },
  { id: 'qwen-max', label: '通义千问 Max（纯文本）', provider: 'qwen' as Provider },
];

const TEST_MODEL: Record<Provider, string> = {
  anthropic: 'claude-haiku-4-5-20251001',
  qwen: 'qwen-turbo',
};

interface Props {
  open: boolean;
  onClose: () => void;
}

interface TestState {
  loading: boolean;
  ok?: boolean;
  message?: string;
}

export function SettingsPanel({ open, onClose }: Props) {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showQwen, setShowQwen] = useState(false);
  const [showMastergo, setShowMastergo] = useState(false);
  const [tests, setTests] = useState<Record<Provider, TestState>>({
    anthropic: { loading: false },
    qwen: { loading: false },
  });
  const [permissions, setPermissions] = useState<PermissionInfo[]>([]);

  useEffect(() => {
    if (open) {
      void loadSettings().then(setSettings);
      void getPermissionRecords().then(setPermissions);
    }
  }, [open]);

  if (!open || !settings) return null;

  const update = (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    void saveSettings(patch);
  };

  const runTest = async (provider: Provider) => {
    const key = provider === 'qwen' ? settings.qwenApiKey : settings.anthropicApiKey;
    setTests((s) => ({ ...s, [provider]: { loading: true } }));
    const result = await testApiKey(provider, key, TEST_MODEL[provider]);
    setTests((s) => ({
      ...s,
      [provider]: { loading: false, ok: result.ok, message: result.message },
    }));
  };

  const renderTestStatus = (provider: Provider) => {
    const t = tests[provider];
    if (t.loading) return <span className="text-xs text-gray-500">测试中...</span>;
    if (t.ok === undefined) return null;
    return (
      <span className={`text-xs ${t.ok ? 'text-green-600' : 'text-red-600'}`}>
        {t.ok ? '✓ ' : '✗ '}{t.message}
      </span>
    );
  };

  return (
    <div className="absolute inset-0 z-10 bg-white p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold">设置</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-900 text-sm"
          type="button"
        >
          关闭
        </button>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-700">Anthropic API Key</label>
          <button
            type="button"
            onClick={() => setShowAnthropic((v) => !v)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showAnthropic ? '隐藏' : '显示'}
          </button>
        </div>
        <input
          type={showAnthropic ? 'text' : 'password'}
          value={settings.anthropicApiKey}
          onChange={(e) => update({ anthropicApiKey: e.target.value })}
          placeholder="sk-ant-..."
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs mb-1"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => runTest('anthropic')}
            disabled={!settings.anthropicApiKey || tests.anthropic.loading}
            className="text-xs px-2 py-1 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            测试连接
          </button>
          {renderTestStatus('anthropic')}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-700">通义千问 API Key（DashScope）</label>
          <button
            type="button"
            onClick={() => setShowQwen((v) => !v)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showQwen ? '隐藏' : '显示'}
          </button>
        </div>
        <input
          type={showQwen ? 'text' : 'password'}
          value={settings.qwenApiKey}
          onChange={(e) => update({ qwenApiKey: e.target.value })}
          placeholder="sk-..."
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs mb-1"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => runTest('qwen')}
            disabled={!settings.qwenApiKey || tests.qwen.loading}
            className="text-xs px-2 py-1 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            测试连接
          </button>
          {renderTestStatus('qwen')}
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          从 https://dashscope.console.aliyun.com/ 获取，需要选支持视觉的模型才能识别设计稿
        </p>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-700">MasterGo Token</label>
          <button
            type="button"
            onClick={() => setShowMastergo((v) => !v)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showMastergo ? '隐藏' : '显示'}
          </button>
        </div>
        <input
          type={showMastergo ? 'text' : 'password'}
          value={settings.mastergoToken}
          onChange={(e) => update({ mastergoToken: e.target.value })}
          placeholder="mgp-..."
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs mb-1"
        />
        <p className="text-[11px] text-gray-500 mt-1">
          用于调用 MasterGo MCP API 获取设计稿结构化数据。从 MasterGo 个人设置 → 开放平台 获取
        </p>
      </div>

      <label className="block text-xs font-medium text-gray-700 mb-1">模型</label>
      <select
        value={settings.model}
        onChange={(e) => update({ model: e.target.value })}
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs mb-4"
      >
        <optgroup label="Anthropic Claude">
          {MODEL_OPTIONS.filter((m) => m.provider === 'anthropic').map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="阿里通义千问">
          {MODEL_OPTIONS.filter((m) => m.provider === 'qwen').map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </optgroup>
      </select>

      <label className="block text-xs font-medium text-gray-700 mb-1">
        系统 Prompt 覆盖（可选）
      </label>
      <textarea
        value={settings.systemPromptOverride ?? ''}
        onChange={(e) =>
          update({ systemPromptOverride: e.target.value || undefined })
        }
        placeholder="留空使用默认（推荐）"
        className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs h-32 resize-none mb-2"
      />
      <p className="text-[11px] text-gray-500">
        默认模板已包含交互状态、字段表、接口表、Given/When/Then 测试用例等结构。仅在你确实想换风格时填写。
      </p>

      <div className="mt-6 pt-6 border-t border-gray-200">
        <h3 className="text-xs font-semibold text-gray-700 mb-2">页面访问权限</h3>
        {permissions.length === 0 ? (
          <p className="text-xs text-gray-400">尚未授权任何额外页面</p>
        ) : (
          <ul className="space-y-1.5">
            {permissions.map((perm) => (
              <li
                key={perm.origin}
                className="flex items-center justify-between bg-gray-50 rounded px-2 py-1.5"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-700 truncate">
                    {perm.hostname}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {new Date(perm.grantedAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const success = await removePermission(perm.origin);
                    if (success) {
                      setPermissions((prev) => prev.filter((p) => p.origin !== perm.origin));
                    }
                  }}
                  className="text-xs text-red-500 hover:text-red-700 ml-2"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[10px] text-gray-400 mt-2">
          内置支持：飞书、蓝湖、MasterGo。其他网站首次使用时会提示授权。
        </p>
      </div>
    </div>
  );
}
