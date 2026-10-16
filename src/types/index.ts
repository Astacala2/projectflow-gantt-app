/**
 * Tipe data terpusat untuk seluruh aplikasi ProjectFlow.
 * Seluruh modul (services, utils, features, pages) menggunakan tipe dari file ini.
 */

/** Tanggal dalam format ISO `YYYY-MM-DD` (tanpa zona waktu). */
export type ISODate = string;

export const PROJECT_STATUSES = [
  'Perencanaan',
  'Berjalan',
  'Ditunda',
  'Selesai',
  'Dibatalkan',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_PRIORITIES = ['Rendah', 'Sedang', 'Tinggi', 'Mendesak'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  'Belum Dimulai',
  'Berjalan',
  'Terhambat',
  'Selesai',
  'Dibatalkan',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const DEPENDENCY_TYPES = ['FS', 'SS'] as const;
/** FS = Finish-to-Start, SS = Start-to-Start. */
export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

export const RATE_UNITS = ['jam', 'hari'] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const GANTT_SCALES = ['hari', 'minggu', 'bulan'] as const;
export type GanttScale = (typeof GANTT_SCALES)[number];

/** Hari libur khusus milik satu proyek. */
export interface Holiday {
  id: string;
  projectId: string;
  date: ISODate;
  name: string;
}

/**
 * Proyek pengembangan website/aplikasi.
 * `workingDays` berisi nomor hari kerja dalam seminggu (0 = Minggu ... 6 = Sabtu).
 * Kalender kerja proyek = `workingDays` + daftar `Holiday` proyek tersebut.
 */
export interface Project {
  id: string;
  name: string;
  description: string;
  /** Nama organisasi / klien. */
  organization: string;
  /** Nama manajer proyek. */
  manager: string;
  startDate: ISODate;
  /** Target tanggal selesai sesuai kontrak/rencana. */
  targetEndDate: ISODate;
  status: ProjectStatus;
  /** Progres proyek (0-100), dihitung berbobot durasi tugas daun. */
  progress: number;
  workingDays: number[];
  createdAt: string;
  updatedAt: string;
}

/** Tugas induk atau subtugas. `parentId` null berarti tugas tingkat atas. */
export interface Task {
  id: string;
  projectId: string;
  name: string;
  description: string;
  /** Tanggal mulai yang direncanakan pengguna (dikoreksi engine bila melanggar dependensi). */
  startDate: ISODate;
  /** Durasi dalam HARI KERJA (minimal 1). */
  duration: number;
  /** Tanggal selesai turunan dari startDate + durasi pada kalender kerja. */
  endDate: ISODate;
  priority: TaskPriority;
  status: TaskStatus;
  /** Progres tugas (0-100). */
  progress: number;
  parentId: string | null;
  notes: string;
}

/** Ketergantungan antar tugas: pendahulu -> penerus. */
export interface Dependency {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  /** Lag dalam hari kerja (>= 0). */
  lag: number;
  note: string;
}

/** Anggota tim / sumber daya manusia. */
export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Keahlian (teks bebas, dipisah koma). */
  skills: string;
  /** Tarif biaya (opsional, 0 berarti tanpa tarif). */
  rate: number;
  rateUnit: RateUnit;
  /** Kapasitas kerja harian dalam jam (mis. 8). */
  dailyCapacity: number;
  active: boolean;
  notes: string;
}

/** Ketidakhadiran anggota (cuti, sakit, dll.). */
export interface Absence {
  id: string;
  memberId: string;
  startDate: ISODate;
  endDate: ISODate;
  reason: string;
}

/** Penugasan anggota ke tugas dengan persentase alokasi kapasitas. */
export interface Assignment {
  id: string;
  taskId: string;
  memberId: string;
  /** Peran anggota pada tugas tersebut (mis. "Koder", "Reviewer"). */
  role: string;
  /** Alokasi kapasitas anggota untuk tugas ini, 0-100 (lebih dari 100 berarti konflik). */
  allocation: number;
  startDate: ISODate;
  endDate: ISODate;
  note: string;
}

export interface Settings {
  /** Proyek yang sedang dipilih untuk visualisasi. */
  selectedProjectId: string | null;
  /** Mengaktifkan perhitungan estimasi biaya sumber daya. */
  costCalculationEnabled: boolean;
  /** Skala waktu default Gantt Chart. */
  ganttScale: GanttScale;
}

/** Seluruh data aplikasi yang disimpan di localStorage. */
export interface AppData {
  schemaVersion: number;
  projects: Project[];
  holidays: Holiday[];
  tasks: Task[];
  dependencies: Dependency[];
  members: Member[];
  absences: Absence[];
  assignments: Assignment[];
  settings: Settings;
}

export const SCHEMA_VERSION = 1;

export const DEFAULT_WORKING_DAYS: number[] = [1, 2, 3, 4, 5]; // Senin-Jumat

export const DEFAULT_SETTINGS: Settings = {
  selectedProjectId: null,
  costCalculationEnabled: true,
  ganttScale: 'hari',
};
