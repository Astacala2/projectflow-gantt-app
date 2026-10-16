/**
 * Hook React untuk mengakses data aplikasi dari lapisan data terpusat.
 * Data diperbarui otomatis pada semua halaman ketika ada perubahan.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { AppData, Project } from '../types';
import * as db from '../services/db';
import { useToast } from '../components/ToastProvider';

/** Berlangganan seluruh data aplikasi. */
export function useAppData(): AppData {
  return useSyncExternalStore(db.subscribe, db.getState, db.getState);
}

/** Proyek yang sedang dipilih untuk visualisasi/laporan. */
export function useSelectedProject(): { project: Project | null; projects: Project[] } {
  const data = useAppData();
  const project =
    data.projects.find((p) => p.id === data.settings.selectedProjectId) ?? data.projects[0] ?? null;
  return { project, projects: data.projects };
}

/** Menjalankan aksi data dengan notifikasi otomatis (sukses/gagal). */
export function useAction() {
  const { push } = useToast();
  return useCallback(
    <T,>(action: () => db.ActionResult<T>, successMessage?: string): db.ActionResult<T> => {
      const result = action();
      if (result.ok) {
        if (successMessage) push(successMessage, 'success');
      } else {
        push(result.error, 'error');
      }
      return result;
    },
    [push],
  );
}

export { db };
