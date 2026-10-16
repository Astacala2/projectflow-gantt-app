import { useEffect, type ReactNode } from 'react';

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Lebar maksimal panel (px). */
  width?: number;
}

/** Dialog modal dasar dengan penutupan lewat tombol ESC dan klik area gelap. */
export function Modal({ title, open, onClose, children, footer, width = 620 }: ModalProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Tutup dialog">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Dialog konfirmasi untuk aksi yang menghapus/menimpa data. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Hapus',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      title={title}
      open={open}
      onClose={onCancel}
      width={460}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Batal
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
    </Modal>
  );
}
