import type { ReactNode } from 'react';
import type { DependencyType, ProjectStatus, TaskPriority, TaskStatus } from '../types';

const PROJECT_STATUS_CLASS: Record<ProjectStatus, string> = {
  Perencanaan: 'badge-neutral',
  Berjalan: 'badge-info',
  Ditunda: 'badge-warning',
  Selesai: 'badge-success',
  Dibatalkan: 'badge-danger',
};

const TASK_STATUS_CLASS: Record<TaskStatus, string> = {
  'Belum Dimulai': 'badge-neutral',
  Berjalan: 'badge-info',
  Terhambat: 'badge-warning',
  Selesai: 'badge-success',
  Dibatalkan: 'badge-danger',
};

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  Rendah: 'badge-neutral',
  Sedang: 'badge-info',
  Tinggi: 'badge-warning',
  Mendesak: 'badge-danger',
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`badge ${PROJECT_STATUS_CLASS[status]}`}>{status}</span>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge ${TASK_STATUS_CLASS[status]}`}>{status}</span>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <span className={`badge badge-outline ${PRIORITY_CLASS[priority]}`}>{priority}</span>;
}

export function DependencyTypeBadge({ type, lag }: { type: DependencyType; lag?: number }) {
  const label = lag && lag > 0 ? `${type}+${lag}` : type;
  return (
    <span className={`badge ${type === 'FS' ? 'badge-info' : 'badge-purple'}`} title={type === 'FS' ? 'Finish to Start' : 'Start to Start'}>
      {label}
    </span>
  );
}

/** Bilah progres (%). */
export function ProgressBar({ value, showValue = true, small = false }: { value: number; showValue?: boolean; small?: boolean }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`progress ${small ? 'progress-small' : ''}`}>
      <div className="progress-track">
        <div
          className={`progress-fill ${clamped >= 100 ? 'progress-done' : ''}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showValue ? <span className="progress-value">{clamped}%</span> : null}
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

/** Label form + pesan kesalahan. */
export function Field({ label, htmlFor, error, hint, required, children }: FieldProps) {
  return (
    <div className={`form-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={htmlFor}>
        {label}
        {required ? <span className="required-mark">*</span> : null}
      </label>
      {children}
      {hint && !error ? <small className="field-hint">{hint}</small> : null}
      {error ? <small className="field-error">{error}</small> : null}
    </div>
  );
}

/** Tampilan ketika belum ada data. */
export function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        ◇
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

/** Kartu/panel bagian halaman. */
export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title ? (
        <div className="card-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </section>
  );
}

export interface WarningItem {
  code: string;
  message: string;
}

/** Panel daftar peringatan (konflik jadwal, siklus, dll.). */
export function WarningPanel({ items, title = 'Peringatan & konflik data' }: { items: WarningItem[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="warning-panel">
      <strong>{title}</strong>
      <ul>
        {items.map((item, index) => (
          <li key={`${item.code}-${index}`}>
            <span className="warning-code">{item.code}</span> {item.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Format angka dengan pemisah ribuan Indonesia. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(Math.round(value));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}
