import { useEffect } from 'react';
import type { ChatProvider } from '@shared/types';

interface NewSessionProviderPickerProps {
  onSelect: (provider: ChatProvider) => void;
  onClose: () => void;
}

const PROVIDERS: Array<{
  value: ChatProvider;
  label: string;
  description: string;
}> = [
  {
    value: 'claude',
    label: 'Claude',
    description: 'Start a new Claude session',
  },
  {
    value: 'codex',
    label: 'Codex',
    description: 'Start a new Codex session',
  },
];

export function NewSessionProviderPicker({
  onSelect,
  onClose,
}: NewSessionProviderPickerProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-sm rounded-2xl p-4 space-y-3"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
            New Session
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Choose which assistant to use for this session.
          </p>
        </div>

        <div className="space-y-2">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.value}
              type="button"
              onClick={() => {
                onSelect(provider.value);
                onClose();
              }}
              className="w-full text-left rounded-xl px-4 py-3 transition-colors"
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {provider.label}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {provider.description}
              </div>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl px-4 py-2.5 text-sm font-medium"
          style={{
            background: 'var(--bg-primary)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
