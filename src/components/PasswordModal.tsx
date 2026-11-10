import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, EyeOff, KeyRound, Lock, X } from 'lucide-react';
import type { TranslationKeys } from '../i18n/fa';

interface PasswordModalProps {
  t: TranslationKeys;
  isOpen: boolean;
  mode: 'unlock' | 'export';
  wrongPassword: boolean;
  onConfirm: (password: string) => Promise<void>;
  onCancel: () => void;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({
  t,
  isOpen,
  mode,
  wrongPassword,
  onConfirm,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'unlock' && !password) return;
    setSubmitting(true);
    try {
      await onConfirm(password);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            className="w-full max-w-md rounded-2xl p-5 border shadow-2xl"
            style={{
              backgroundColor: 'var(--bg-surface-strong)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--accent-yellow-soft)',
                    color: 'var(--accent-yellow)',
                  }}
                >
                  {mode === 'unlock' ? <Lock className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
                </div>
                <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                  {mode === 'unlock' ? t.passwordModal.titleOpen : t.passwordModal.titleExport}
                </h3>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs mb-4 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {mode === 'unlock' ? t.passwordModal.descOpen : t.passwordModal.descExport}
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative flex items-center">
                <input
                  dir="ltr"
                  autoFocus
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.passwordModal.placeholder}
                  className="w-full h-11 rounded-xl px-4 pr-11 text-sm border outline-none"
                  style={{
                    backgroundColor: 'var(--bg-input)',
                    borderColor: wrongPassword ? '#F43F5E' : 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-2.5 p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {wrongPassword && (
                <p className="text-xs text-rose-400 font-semibold">{t.passwordModal.wrongPass}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 rounded-xl text-xs font-semibold hover:bg-white/10 cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t.passwordModal.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting || (mode === 'unlock' && !password)}
                  className="px-5 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, var(--accent-yellow), var(--accent-purple))',
                    color: '#0b0b12',
                  }}
                >
                  {mode === 'unlock' ? t.passwordModal.confirm : t.passwordModal.confirmExport}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
