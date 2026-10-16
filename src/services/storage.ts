/**
 * Lapisan penyimpanan (localStorage) yang terpisah dari komponen UI.
 * Seluruh akses data melalui modul ini, sehingga pada pengembangan berikutnya
 * lapisan ini dapat diganti dengan panggilan API/database tanpa mengubah UI.
 *
 * Catatan: localStorage HANYA untuk penyimpanan lokal non-rahasia.
 * Jangan menyimpan kredensial/autentikasi di sini.
 */
import type { AppData } from '../types';
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../types';

export const STORAGE_KEY = 'projectflow.data';

export interface StorageEnvelope {
  schemaVersion: number;
  savedAt: string;
  data: AppData;
}

/** Membuat AppData kosong dengan nilai default. */
export function createEmptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    projects: [],
    holidays: [],
    tasks: [],
    dependencies: [],
    members: [],
    absences: [],
    assignments: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * Migrasi skema sederhana. Saat struktur penyimpanan berubah, tambahkan langkah
 * migrasi di sini (mis. v0 -> v1 -> v2).
 */
function migrate(raw: unknown): AppData | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  let version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 0;

  // Normalisasi awal: pastikan semua koleksi ada.
  const data: AppData = {
    schemaVersion: SCHEMA_VERSION,
    projects: Array.isArray(record.projects) ? (record.projects as AppData['projects']) : [],
    holidays: Array.isArray(record.holidays) ? (record.holidays as AppData['holidays']) : [],
    tasks: Array.isArray(record.tasks) ? (record.tasks as AppData['tasks']) : [],
    dependencies: Array.isArray(record.dependencies)
      ? (record.dependencies as AppData['dependencies'])
      : [],
    members: Array.isArray(record.members) ? (record.members as AppData['members']) : [],
    absences: Array.isArray(record.absences) ? (record.absences as AppData['absences']) : [],
    assignments: Array.isArray(record.assignments)
      ? (record.assignments as AppData['assignments'])
      : [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...(typeof record.settings === 'object' && record.settings !== null
        ? (record.settings as Partial<AppData['settings']>)
        : {}),
    },
  };

  // Tambahkan langkah migrasi berikutnya di sini, mis.:
  // if (version === 1) { ...; version = 2; }
  void version;
  return data;
}

export function readFromStorage(): AppData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StorageEnvelope | AppData;
    const envelope = 'data' in parsed ? parsed : null;
    const payload = envelope ? envelope.data : (parsed as AppData);
    return migrate(payload);
  } catch {
    // Data rusak/tidak valid: anggap kosong agar aplikasi tetap bisa dijalankan.
    return null;
  }
}

export function writeToStorage(data: AppData): void {
  if (typeof window === 'undefined') return;
  const envelope: StorageEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    data,
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch (error) {
    // localStorage penuh/di-nonaktifkan: beri tahu pemanggil tanpa menjatuhkan aplikasi.
    console.error('Gagal menyimpan data ke localStorage:', error);
  }
}

export function clearStorage(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/** Mengekspor seluruh data sebagai JSON siap unduh. */
export function exportDataJSON(data: AppData): string {
  const envelope: StorageEnvelope = {
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    data,
  };
  return JSON.stringify(envelope, null, 2);
}

/** Hasil impor JSON backup. */
export interface ImportResult {
  ok: boolean;
  data?: AppData;
  error?: string;
}

/** Mengimpor JSON backup; menolak berkas yang strukturnya tidak dikenali. */
export function importDataJSON(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Berkas bukan JSON yang valid.' };
  }
  const record = parsed as Record<string, unknown>;
  if (!record || typeof record !== 'object') {
    return { ok: false, error: 'Struktur berkas backup tidak dikenali.' };
  }
  const payload =
    record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : record;
  // Berkas backup wajib memiliki koleksi utama yang dikenali.
  if (!Array.isArray(payload.projects)) {
    return { ok: false, error: 'Struktur berkas backup tidak dikenali.' };
  }
  const data = migrate(payload);
  if (!data || !Array.isArray(data.projects)) {
    return { ok: false, error: 'Struktur berkas backup tidak dikenali.' };
  }
  return { ok: true, data: { ...data, schemaVersion: SCHEMA_VERSION } };
}
