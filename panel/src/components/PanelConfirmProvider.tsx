import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'info';
};

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

type PanelConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const PanelConfirmContext = createContext<PanelConfirmContextValue | null>(null);

export const PanelConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((result: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setPending(null);
    resolver?.(result);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setPending({ ...options, resolve });
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  const accent =
    pending?.tone === 'danger'
      ? '#dc2626'
      : pending?.tone === 'warning'
          ? '#d97706'
          : '#4f46e5';

  return (
    <PanelConfirmContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.42)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
              zIndex: 20000,
            }}
            onClick={() => close(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              onClick={(event) => event.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 520,
                background: '#ffffff',
                borderRadius: 28,
                boxShadow: '0 24px 80px rgba(15, 23, 42, 0.24)',
                border: '1px solid rgba(148, 163, 184, 0.18)',
                overflow: 'hidden',
              }}
            >
              <div style={{ padding: '1.4rem 1.5rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 46,
                      height: 46,
                      borderRadius: 16,
                      background: `${accent}14`,
                      color: accent,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <AlertTriangle size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.35rem' }}>
                      {pending.title || 'Onay gerekiyor'}
                    </div>
                    <div style={{ fontSize: '0.95rem', lineHeight: 1.6, color: '#475569' }}>
                      {pending.message}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => close(false)}
                  aria-label="Kapat"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '0.2rem',
                    borderRadius: 999,
                    display: 'flex',
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', padding: '0 1.5rem 1.4rem' }}>
                <button
                  type="button"
                  onClick={() => close(false)}
                  style={{
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    color: '#475569',
                    borderRadius: 16,
                    padding: '0.9rem 1.15rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {pending.cancelLabel || 'Vazgeç'}
                </button>
                <button
                  type="button"
                  onClick={() => close(true)}
                  style={{
                    border: 'none',
                    background: accent,
                    color: '#fff',
                    borderRadius: 16,
                    padding: '0.9rem 1.15rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: `0 14px 30px ${accent}33`,
                  }}
                >
                  {pending.confirmLabel || 'Onayla'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PanelConfirmContext.Provider>
  );
};

export const usePanelConfirm = () => {
  const context = useContext(PanelConfirmContext);
  if (!context) {
    throw new Error('usePanelConfirm must be used within PanelConfirmProvider');
  }
  return context;
};
