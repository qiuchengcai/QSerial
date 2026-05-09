/**
 * 全局错误提示组件 - 替代 alert() 避免 Electron 焦点问题
 */

import React, { useState, useEffect, useCallback } from 'react';

type Listener = (message: string) => void;
const listeners: Set<Listener> = new Set();

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export const globalError = {
  show(message: string) {
    if (dismissTimer) clearTimeout(dismissTimer);
    listeners.forEach((fn) => fn(message));
    dismissTimer = setTimeout(() => {
      listeners.forEach((fn) => fn(''));
    }, 6000);
  },
};

export function useGlobalError() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handler: Listener = (msg) => setMessage(msg);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  const dismiss = useCallback(() => setMessage(''), []);

  return { errorMessage: message, dismiss };
}

export const ErrorToast: React.FC<{
  message: string;
  onDismiss: () => void;
}> = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 inset-x-0 flex justify-center z-[100] pointer-events-none">
      <div className="animate-slide-up pointer-events-auto">
        <div className="flex items-center gap-3 bg-surface border border-error/30 rounded-lg shadow-lg px-4 py-3 max-w-lg"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.4)' }}>
        <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor" className="text-error flex-shrink-0">
          <path d="M7 0a7 7 0 100 14A7 7 0 007 0zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM7.75 4v3.5a.75.75 0 01-1.5 0V4a.75.75 0 011.5 0z"/>
        </svg>
        <span className="text-sm text-text">{message}</span>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-text-secondary hover:text-text transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 1l10 10M11 1L1 11"/>
          </svg>
        </button>
        </div>
      </div>
    </div>
  );
};
