import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  push: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ push: () => undefined });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

/** Provider notifikasi; menampilkan toast di pojok kanan bawah. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, message, type }]);
      window.setTimeout(() => remove(id), type === 'error' ? 7000 : 4000);
    },
    [remove],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.type}`} onClick={() => remove(item.id)}>
            <span className="toast-icon" aria-hidden="true">
              {item.type === 'success' ? '✓' : item.type === 'error' ? '✕' : 'ℹ'}
            </span>
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
