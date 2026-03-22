import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToolPermissionRequest {
  requestId: string;
  tool: string;
  input: Record<string, unknown>;
  sessionId: string;
}

interface ToolPermissionModalProps {
  request: ToolPermissionRequest;
  onRespond: (requestId: string, allowed: boolean, remember?: boolean) => void;
}

const TIMEOUT_SECONDS = 30;

function getToolDisplayInfo(tool: string, input: Record<string, unknown>): { label: string; detail: string } {
  switch (tool) {
    case 'Bash':
    case 'bash':
      return {
        label: 'Bash',
        detail: typeof input.command === 'string' ? input.command : JSON.stringify(input),
      };
    case 'Edit':
    case 'edit':
      return {
        label: 'Edit',
        detail: typeof input.file_path === 'string' ? input.file_path : JSON.stringify(input),
      };
    case 'Write':
    case 'write':
      return {
        label: 'Write',
        detail: typeof input.file_path === 'string' ? input.file_path : JSON.stringify(input),
      };
    default:
      return {
        label: tool,
        detail: JSON.stringify(input, null, 2),
      };
  }
}

export function ToolPermissionModal({ request, onRespond }: ToolPermissionModalProps) {
  const [remember, setRemember] = useState(false);
  const [countdown, setCountdown] = useState(TIMEOUT_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const respondedRef = useRef(false);

  const { label, detail } = getToolDisplayInfo(request.tool, request.input);

  const handleRespond = useCallback(
    (allowed: boolean) => {
      if (respondedRef.current) return;
      respondedRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      onRespond(request.requestId, allowed, remember);
    },
    [onRespond, request.requestId, remember],
  );

  // Countdown timer - auto-deny after timeout
  useEffect(() => {
    respondedRef.current = false;
    setCountdown(TIMEOUT_SECONDS);

    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleRespond(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [request.requestId, handleRespond]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-elevated, #1e1e1e)',
          border: '1px solid var(--border-color, #3c3c3c)',
          borderRadius: '8px',
          padding: '20px',
          maxWidth: '520px',
          width: '90%',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          color: 'var(--text-primary, #cccccc)',
          fontFamily: 'var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              backgroundColor: 'var(--accent-color, #e8912d)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-2.99L13.73 4.01c-.77-1.33-2.69-1.33-3.46 0L3.34 16.01C2.57 17.33 3.53 19 5.07 19z" />
            </svg>
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary, #e0e0e0)' }}>
              Tool Permission Request
            </h3>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #888888)' }}>
              Claude wants to use <strong>{label}</strong>
            </p>
          </div>
          {/* Countdown */}
          <div
            style={{
              marginLeft: 'auto',
              fontSize: '12px',
              color: countdown <= 10 ? '#f14c4c' : 'var(--text-secondary, #888888)',
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}
          >
            {countdown}s
          </div>
        </div>

        {/* Tool detail */}
        <div
          style={{
            backgroundColor: 'var(--bg-secondary, #252526)',
            border: '1px solid var(--border-color, #3c3c3c)',
            borderRadius: '4px',
            padding: '10px 12px',
            marginBottom: '16px',
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          <pre
            style={{
              margin: 0,
              fontSize: '12px',
              fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: 'var(--text-primary, #d4d4d4)',
            }}
          >
            {detail}
          </pre>
        </div>

        {/* Remember checkbox */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '16px',
            fontSize: '12px',
            color: 'var(--text-secondary, #999999)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{
              accentColor: 'var(--accent-color, #e8912d)',
              width: '14px',
              height: '14px',
            }}
          />
          Remember for this session
        </label>

        {/* Countdown progress bar */}
        <div
          style={{
            height: '2px',
            backgroundColor: 'var(--bg-secondary, #333333)',
            borderRadius: '1px',
            marginBottom: '16px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${(countdown / TIMEOUT_SECONDS) * 100}%`,
              backgroundColor: countdown <= 10 ? '#f14c4c' : 'var(--accent-color, #e8912d)',
              transition: 'width 1s linear, background-color 0.3s',
              borderRadius: '1px',
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => handleRespond(false)}
            style={{
              padding: '6px 16px',
              borderRadius: '4px',
              border: '1px solid #f14c4c',
              backgroundColor: 'transparent',
              color: '#f14c4c',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(241, 76, 76, 0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            Deny
          </button>
          <button
            onClick={() => handleRespond(true)}
            style={{
              padding: '6px 16px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: '#2ea043',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#3fb950')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#2ea043')}
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
