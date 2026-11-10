import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { AppToast } from '../../electron/types';

interface ToastStackProps {
  toasts: AppToast[];
  onDismiss: (id: string) => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-4 end-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-2">
      <AnimatePresence>
        {toasts.map((toast) => {
          const icon =
            toast.level === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : toast.level === 'warning' || toast.level === 'error' ? (
              <AlertTriangle
                className={`w-4 h-4 shrink-0 ${
                  toast.level === 'error' ? 'text-rose-400' : 'text-amber-400'
                }`}
              />
            ) : (
              <Info className="w-4 h-4 text-purple-300 shrink-0" />
            );

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.94 }}
              className="pointer-events-auto rounded-2xl p-3.5 border shadow-2xl backdrop-blur-xl flex items-start gap-3"
              style={{
                backgroundColor: 'var(--bg-surface-strong)',
                borderColor:
                  toast.level === 'warning'
                    ? '#F59E0B'
                    : toast.level === 'error'
                      ? '#F43F5E'
                      : 'var(--border-strong)',
              }}
            >
              <div className="mt-0.5">{icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  {toast.title}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  {toast.message}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
