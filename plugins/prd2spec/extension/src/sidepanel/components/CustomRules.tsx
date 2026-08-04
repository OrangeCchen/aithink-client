import { useEffect, useRef, useState } from 'react';

interface CustomRulesProps {
  storageKey: string;
  title?: string;
  placeholder?: string;
  onChange?: (rules: string) => void;
}

export function CustomRules({
  storageKey,
  title = '自定义规则',
  placeholder = '输入你的期望或规则...',
  onChange,
}: CustomRulesProps) {
  const [rules, setRules] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount
  useEffect(() => {
    chrome.storage.local.get(storageKey).then((result) => {
      const stored = result[storageKey] || '';
      setRules(stored);
      onChange?.(stored);
      if (stored) setExpanded(true);
    });
  }, [storageKey]);

  // Auto-save with debounce
  const handleChange = (value: string) => {
    setRules(value);
    setSaved(false);
    onChange?.(value);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      chrome.storage.local.set({ [storageKey]: value }).then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      });
    }, 500);
  };

  const handleClear = () => {
    setRules('');
    onChange?.('');
    chrome.storage.local.set({ [storageKey]: '' });
  };

  const charCount = rules.length;

  return (
    <div className="border border-gray-200 rounded">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-gray-50"
      >
        <span className="flex items-center gap-1.5 text-gray-700">
          <span>📝 {title}</span>
          {charCount > 0 && (
            <span className="text-[10px] text-gray-400">({charCount} 字)</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {saved && <span className="text-[10px] text-green-600">已保存 ✓</span>}
          <span className="text-gray-400">{expanded ? '▲' : '▼'}</span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 p-2 space-y-1">
          <textarea
            value={rules}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 h-24 resize-y"
          />
          <div className="flex justify-between items-center">
            <p className="text-[10px] text-gray-400">
              规则会在调用 AI 时自动追加到提示词
            </p>
            {rules && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] text-red-500 hover:text-red-700"
              >
                清空
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
