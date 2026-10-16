/**
 * Data contoh (seed) aplikasi ProjectFlow.
 *
 * Berisi studi kasus "Pengembangan Website Profil Organisasi Mahasiswa"
 * lengkap dengan tugas/subtugas, dependensi FS & SS + lag, anggota tim,
 * penugasan, ketidakhadiran, dan hari libur.
 *
 * Data contoh hanya dimuat ketika penyimpanan kosong atau ketika pengguna
 * secara eksplisit memilih "Pulihkan data contoh".
 */
import type {
  Absence,
  AppData,
  Assignment,
  Dependency,
  Holiday,
  ISODate,
  Member,
  Project,
  Task,
} from '../types';
import { DEFAULT_SETTINGS, DEFAULT_WORKING_DAYS, SCHEMA_VERSION, TASK_STATUSES, TASK_PRIORITIES } from '../types';
import { WorkCalendar } from '../utils/calendar';
import { addDays, compareISO, diffDays, parseISO, toISO, todayISO } from '../utils/date';
import { computeSchedule, deriveEndDate } from '../utils/schedule';

/** Senin pada minggu yang memuat `date`. */
function mondayOf(date: ISODate): ISODate {
  const parsed = parseISO(date);
  const offsetToMonday = (parsed.getDay() + 6) % 7;
  parsed.setDate(parsed.getDate() - offsetToMonday);
  return toISO(parsed);
}

interface SeedTask {
  id: string;
  name: string;
  duration: number;
  parentId?: string;
  priority?: Task['priority'];
  description?: string;
}

interface SeedDependency {
  pred: string;
  succ: string;
  type: Dependency['type'];
  lag?: number;
  note?: string;
}

const SEED_PARENTS: SeedTask[] = [
  { id: 't-analisis', name: 'Analisis Kebutuhan', duration: 0, description: 'Kegiatan analisis kebutuhan pengguna dan pemangku kepentingan.' },
  { id: 't-kebutuhan', name: 'Penyusunan Kebutuhan', duration: 0, description: 'Penyusunan dokumen kebutuhan fungsional dan nonfungsional.' },
  { id: 't-perancangan', name: 'Perancangan Sistem', duration: 0, description: 'Perancangan use case, database, wireframe, dan prototype.' },
  { id: 't-pengembangan', name: 'Pengembangan', duration: 0, description: 'Implementasi frontend, backend, dan integrasi.' },
  { id: 't-uji', name: 'Pengujian dan Deployment', duration: 0, description: 'Pengujian, perbaikan bug, deployment, dan dokumentasi akhir.' },
];

const SEED_LEAVES: SeedTask[] = [
  { id: 't-wawancara', name: 'Wawancara Pengguna dan Pemangku Kepentingan', duration: 3, parentId: 't-analisis', description: 'Wawancara pengurus organisasi untuk memahami kebutuhan informasi website.' },
  { id: 't-identifikasi', name: 'Identifikasi Masalah dan Kebutuhan', duration: 2, parentId: 't-analisis', description: 'Merangkum hasil wawancara menjadi daftar masalah dan kebutuhan.' },
  { id: 't-keb-fungsional', name: 'Penyusunan Kebutuhan Fungsional', duration: 2, parentId: 't-kebutuhan', description: 'Menyusun daftar fungsi halaman beranda, profil, kegiatan, dokumentasi, dan kontak.' },
  { id: 't-keb-nonfungsional', name: 'Penyusunan Kebutuhan Nonfungsional', duration: 2, parentId: 't-kebutuhan', description: 'Menyusun kebutuhan performa, keamanan, dan responsivitas.' },
  { id: 't-usecase', name: 'Pembuatan Diagram Use Case', duration: 2, parentId: 't-perancangan', description: 'Membuat diagram use case interaksi pengunjung dan admin.' },
  { id: 't-database', name: 'Perancangan Database', duration: 3, parentId: 't-perancangan', priority: 'Tinggi', description: 'Merancang skema basis data untuk konten, kegiatan, dan pengguna.' },
  { id: 't-wireframe', name: 'Pembuatan Wireframe', duration: 3, parentId: 't-perancangan', description: 'Membuat wireframe seluruh halaman website.' },
  { id: 't-prototype', name: 'Pembuatan Prototype UI/UX', duration: 4, parentId: 't-perancangan', priority: 'Tinggi', description: 'Membuat prototype interaktif untuk validasi pengguna.' },
  { id: 't-frontend', name: 'Implementasi Frontend', duration: 10, parentId: 't-pengembangan', priority: 'Mendesak', description: 'Membangun antarmuka seluruh halaman website organisasi.' },
  { id: 't-backend', name: 'Implementasi Backend', duration: 8, parentId: 't-pengembangan', priority: 'Tinggi', description: 'Membangun API dan logika bisnis konten website.' },
  { id: 't-integrasi-db', name: 'Integrasi Database', duration: 3, parentId: 't-pengembangan', description: 'Menghubungkan backend dengan basis data yang telah dirancang.' },
  { id: 't-integrasi', name: 'Integrasi Frontend dan Backend', duration: 4, parentId: 't-pengembangan', priority: 'Tinggi', description: 'Menghubungkan antarmuka dengan API backend.' },
  { id: 't-uji-fungsional', name: 'Pengujian Fungsional', duration: 4, parentId: 't-uji', description: 'Pengujian fungsional seluruh halaman dan alur.' },
  { id: 't-bug', name: 'Perbaikan Bug', duration: 3, parentId: 't-uji', description: 'Perbaikan temuan pengujian fungsional.' },
  { id: 't-uji-ulang', name: 'Pengujian Ulang', duration: 2, parentId: 't-uji', description: 'Pengujian ulang setelah perbaikan bug.' },
  { id: 't-deploy', name: 'Deployment', duration: 2, parentId: 't-uji', priority: 'Tinggi', description: 'Pemasangan website pada server dan domain organisasi.' },
  { id: 't-dokumentasi', name: 'Dokumentasi Akhir dan Serah Terima', duration: 3, parentId: 't-uji', description: 'Dokumentasi teknis dan serah terima kepada organisasi.' },
];

const SEED_DEPENDENCIES: SeedDependency[] = [
  { pred: 't-wawancara', succ: 't-identifikasi', type: 'FS', note: 'Identifikasi dimulai setelah wawancara selesai.' },
  { pred: 't-identifikasi', succ: 't-keb-fungsional', type: 'FS' },
  { pred: 't-keb-fungsional', succ: 't-keb-nonfungsional', type: 'FS' },
  { pred: 't-keb-nonfungsional', succ: 't-usecase', type: 'FS' },
  { pred: 't-usecase', succ: 't-database', type: 'FS' },
  { pred: 't-usecase', succ: 't-wireframe', type: 'FS', note: 'Wireframe mengikuti use case.' },
  { pred: 't-wireframe', succ: 't-prototype', type: 'FS' },
  { pred: 't-prototype', succ: 't-frontend', type: 'FS', note: 'Frontend baru dimulai setelah prototype UI/UX selesai.' },
  { pred: 't-database', succ: 't-backend', type: 'FS' },
  { pred: 't-database', succ: 't-integrasi-db', type: 'FS' },
  { pred: 't-frontend', succ: 't-integrasi', type: 'SS', note: 'Integrasi dapat berjalan seiring implementasi frontend.' },
  { pred: 't-backend', succ: 't-integrasi', type: 'FS' },
  { pred: 't-integrasi-db', succ: 't-integrasi', type: 'FS' },
  { pred: 't-integrasi', succ: 't-uji-fungsional', type: 'FS' },
  { pred: 't-uji-fungsional', succ: 't-bug', type: 'FS', lag: 1, note: 'Lag 1 hari kerja untuk menyusun laporan pengujian.' },
  { pred: 't-bug', succ: 't-uji-ulang', type: 'FS' },
  { pred: 't-uji-ulang', succ: 't-deploy', type: 'FS' },
  { pred: 't-deploy', succ: 't-dokumentasi', type: 'FS' },
  { pred: 't-frontend', succ: 't-dokumentasi', type: 'SS', note: 'Dokumentasi teknis mulai disusun bersamaan dengan frontend.' },
];

interface SeedMember {
  id: string;
  name: string;
  email: string;
  role: string;
  skills: string;
  rate: number;
  rateUnit: Member['rateUnit'];
}

const SEED_MEMBERS: SeedMember[] = [
  { id: 'm-budi', name: 'Budi Santoso', email: 'budi.santoso@example.org', role: 'Project Manager', skills: 'Manajemen Proyek, Agile, Scrum, Risk Management', rate: 150000, rateUnit: 'jam' },
  { id: 'm-siti', name: 'Siti Aminah', email: 'siti.aminah@example.org', role: 'System Analyst', skills: 'Analisis Kebutuhan, UML, BPMN, Dokumentasi', rate: 120000, rateUnit: 'jam' },
  { id: 'm-rina', name: 'Rina Pratiwi', email: 'rina.pratiwi@example.org', role: 'UI/UX Designer', skills: 'Figma, Wireframing, UI Research, Prototyping', rate: 110000, rateUnit: 'jam' },
  { id: 'm-andi', name: 'Andi Wijaya', email: 'andi.wijaya@example.org', role: 'Frontend Developer', skills: 'React, TypeScript, CSS, Accessibility', rate: 130000, rateUnit: 'jam' },
  { id: 'm-dimas', name: 'Dimas Putra', email: 'dimas.putra@example.org', role: 'Backend Developer', skills: 'Node.js, Express, REST API, JWT', rate: 130000, rateUnit: 'jam' },
  { id: 'm-maya', name: 'Maya Lestari', email: 'maya.lestari@example.org', role: 'Database Administrator', skills: 'PostgreSQL, MySQL, Normalisasi, Backup', rate: 125000, rateUnit: 'jam' },
  { id: 'm-hasan', name: 'Hasan Fauzi', email: 'hasan.fauzi@example.org', role: 'Quality Assurance Tester', skills: 'Manual Testing, Automation, Cypress', rate: 100000, rateUnit: 'jam' },
  { id: 'm-yoga', name: 'Yoga Pratama', email: 'yoga.pratama@example.org', role: 'Deployment Engineer', skills: 'Docker, Nginx, CI/CD, Linux Server', rate: 140000, rateUnit: 'jam' },
];

interface SeedAssignment {
  id: string;
  taskId: string;
  memberId: string;
  role: string;
  allocation: number;
}

const SEED_ASSIGNMENTS: SeedAssignment[] = [
  { id: 'a-1', taskId: 't-wawancara', memberId: 'm-siti', role: 'Penanggung jawab wawancara', allocation: 100 },
  { id: 'a-2', taskId: 't-identifikasi', memberId: 'm-siti', role: 'Analis', allocation: 100 },
  { id: 'a-3', taskId: 't-keb-fungsional', memberId: 'm-siti', role: 'Analis', allocation: 100 },
  { id: 'a-4', taskId: 't-keb-nonfungsional', memberId: 'm-siti', role: 'Analis', allocation: 70 },
  { id: 'a-5', taskId: 't-keb-nonfungsional', memberId: 'm-budi', role: 'Reviewer', allocation: 30 },
  { id: 'a-6', taskId: 't-usecase', memberId: 'm-siti', role: 'Analis', allocation: 100 },
  { id: 'a-7', taskId: 't-database', memberId: 'm-maya', role: 'Database designer', allocation: 100 },
  { id: 'a-8', taskId: 't-wireframe', memberId: 'm-rina', role: 'Desainer', allocation: 100 },
  { id: 'a-9', taskId: 't-prototype', memberId: 'm-rina', role: 'Desainer', allocation: 100 },
  { id: 'a-10', taskId: 't-frontend', memberId: 'm-andi', role: 'Koder utama', allocation: 70 },
  { id: 'a-11', taskId: 't-frontend', memberId: 'm-rina', role: 'Implementasi desain', allocation: 20 },
  { id: 'a-12', taskId: 't-backend', memberId: 'm-dimas', role: 'Koder utama', allocation: 100 },
  { id: 'a-13', taskId: 't-integrasi-db', memberId: 'm-maya', role: 'Integrator', allocation: 100 },
  // Andi tetap ditugaskan di Integrasi (SS dengan Frontend) sehingga memunculkan
  // contoh deteksi potensi kelebihan beban (70% + 50% pada periode yang tumpang tindih).
  { id: 'a-14', taskId: 't-integrasi', memberId: 'm-andi', role: 'Integrator frontend', allocation: 50 },
  { id: 'a-15', taskId: 't-integrasi', memberId: 'm-dimas', role: 'Integrator backend', allocation: 50 },
  { id: 'a-16', taskId: 't-uji-fungsional', memberId: 'm-hasan', role: 'Tester', allocation: 100 },
  { id: 'a-17', taskId: 't-bug', memberId: 'm-andi', role: 'Perbaikan frontend', allocation: 40 },
  { id: 'a-18', taskId: 't-bug', memberId: 'm-dimas', role: 'Perbaikan backend', allocation: 40 },
  { id: 'a-19', taskId: 't-uji-ulang', memberId: 'm-hasan', role: 'Tester', allocation: 100 },
  { id: 'a-20', taskId: 't-deploy', memberId: 'm-yoga', role: 'Deployment', allocation: 100 },
  { id: 'a-21', taskId: 't-dokumentasi', memberId: 'm-budi', role: 'Penulis dokumentasi', allocation: 60 },
  { id: 'a-22', taskId: 't-dokumentasi', memberId: 'm-yoga', role: 'Dokumentasi teknis', allocation: 40 },
];

/**
 * Menentukan status & progres tugas berdasarkan posisi hari ini terhadap jadwal.
 * (Hanya untuk data contoh agar tampilan langsung terasa nyata.)
 */
function inferProgressForSample(
  start: ISODate,
  end: ISODate,
  today: ISODate,
): { status: Task['status']; progress: number } {
  if (compareISO(end, today) < 0) return { status: 'Selesai', progress: 100 };
  if (compareISO(start, today) > 0) return { status: 'Belum Dimulai', progress: 0 };
  const total = Math.max(1, diffDays(start, end));
  const done = diffDays(start, today);
  const progress = Math.min(90, Math.max(10, Math.round((done / total) * 100)));
  return { status: 'Berjalan', progress };
}

/** Membangun seluruh data contoh aplikasi. */
export function buildSampleData(reference: ISODate = todayISO()): AppData {
  // Proyek dimulai pada Senin tiga minggu sebelum tanggal acuan agar jadwal terasa berjalan.
  const projectStart = addDays(mondayOf(reference), -21);
  const targetEnd = addDays(projectStart, 84); // target ± 12 minggu kerja

  const now = new Date().toISOString();
  const project: Project = {
    id: 'p-contoh-1',
    name: 'Pengembangan Website Profil Organisasi Mahasiswa',
    description:
      'Proyek pengembangan website organisasi yang memiliki halaman beranda, profil organisasi, informasi kegiatan, dokumentasi, dan halaman kontak.',
    organization: 'Himpunan Mahasiswa Teknik Informatika',
    manager: 'Budi Santoso',
    startDate: projectStart,
    targetEndDate: targetEnd,
    status: 'Berjalan',
    progress: 0,
    workingDays: [...DEFAULT_WORKING_DAYS],
    createdAt: now,
    updatedAt: now,
  };

  const holidays: Holiday[] = [
    { id: 'h-1', projectId: project.id, date: addDays(projectStart, 14), name: 'Hari Libur Nasional (contoh)' },
    { id: 'h-2', projectId: project.id, date: addDays(projectStart, 35), name: 'Cuti Bersama (contoh)' },
  ];
  const calendar = new WorkCalendar(
    project.workingDays,
    holidays.map((h) => h.date),
  );

  const tasks: Task[] = [];
  for (const seed of [...SEED_PARENTS, ...SEED_LEAVES]) {
    tasks.push({
      id: seed.id,
      projectId: project.id,
      name: seed.name,
      description: seed.description ?? '',
      startDate: projectStart,
      duration: Math.max(1, seed.duration),
      endDate: deriveEndDate(projectStart, Math.max(1, seed.duration), calendar),
      priority: seed.priority ?? 'Sedang',
      status: 'Belum Dimulai',
      progress: 0,
      parentId: seed.parentId ?? null,
      notes: '',
    });
  }

  const dependencies: Dependency[] = SEED_DEPENDENCIES.map((seed, index) => ({
    id: `d-${index + 1}`,
    projectId: project.id,
    predecessorId: seed.pred,
    successorId: seed.succ,
    type: seed.type,
    lag: seed.lag ?? 0,
    note: seed.note ?? '',
  }));

  const members: Member[] = SEED_MEMBERS.map((seed) => ({
    id: seed.id,
    name: seed.name,
    email: seed.email,
    role: seed.role,
    skills: seed.skills,
    rate: seed.rate,
    rateUnit: seed.rateUnit,
    dailyCapacity: 8,
    active: true,
    notes: '',
  }));

  // Hitung jadwal otomatis lalu materialkan tanggal hasil hitung ke dalam tugas
  // sehingga data contoh tidak menghasilkan peringatan konflik tanggal.
  const schedule = computeSchedule(tasks, dependencies, calendar);
  for (const task of tasks) {
    const entry = schedule.entries[task.id];
    if (!entry) continue;
    task.startDate = entry.start;
    task.endDate = entry.end;
    if (!task.parentId) {
      const progressInfo = inferProgressForSample(entry.start, entry.end, reference);
      task.status = progressInfo.status;
      task.progress = progressInfo.progress;
    }
  }
  // Status tugas induk mengikuti subtugasnya.
  for (const parent of SEED_PARENTS) {
    const children = tasks.filter((t) => t.parentId === parent.id);
    if (children.length === 0) continue;
    const parentTask = tasks.find((t) => t.id === parent.id);
    if (!parentTask) continue;
    const allDone = children.every((c) => c.status === 'Selesai');
    const anyStarted = children.some((c) => c.status !== 'Belum Dimulai');
    parentTask.status = allDone ? 'Selesai' : anyStarted ? 'Berjalan' : 'Belum Dimulai';
    parentTask.progress = Math.round(
      children.reduce((sum, c) => sum + c.progress * c.duration, 0) /
        Math.max(1, children.reduce((sum, c) => sum + c.duration, 0)),
    );
  }

  // Penugasan mengikuti jadwal tugasnya.
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const assignments: Assignment[] = SEED_ASSIGNMENTS.map((seed) => {
    const task = taskById.get(seed.taskId) as Task;
    return {
      id: seed.id,
      taskId: seed.taskId,
      memberId: seed.memberId,
      role: seed.role,
      allocation: seed.allocation,
      startDate: task.startDate,
      endDate: task.endDate,
      note: '',
    };
  });

  // Ketidakhadiran contoh: sengaja dibuat bertabrakan dengan penugasan agar
  // fitur deteksi konflik ketidakhadiran dapat langsung terlihat.
  const frontend = taskById.get('t-frontend') as Task;
  const testing = taskById.get('t-uji-fungsional') as Task;
  const absences: Absence[] = [
    {
      id: 'ab-1',
      memberId: 'm-rina',
      startDate: frontend.startDate,
      endDate: addDays(frontend.startDate, 1),
      reason: 'Sakit (contoh)',
    },
    {
      id: 'ab-2',
      memberId: 'm-hasan',
      startDate: testing.startDate,
      endDate: addDays(testing.startDate, 1),
      reason: 'Cuti keluarga (contoh)',
    },
  ];

  // Progres proyek berbobot durasi tugas daun (metode yang sama dengan yang dipakai aplikasi).
  const leaves = tasks.filter((t) => !t.parentId);
  const totalDuration = leaves.reduce((sum, t) => sum + t.duration, 0);
  const weighted = leaves.reduce((sum, t) => sum + t.progress * t.duration, 0);
  project.progress = totalDuration > 0 ? Math.round(weighted / totalDuration) : 0;

  return {
    schemaVersion: SCHEMA_VERSION,
    projects: [project],
    holidays,
    tasks,
    dependencies,
    members,
    absences,
    assignments,
    settings: { ...DEFAULT_SETTINGS, selectedProjectId: project.id },
  };
}

/** Tipe status & prioritas diekspor untuk keperluan uji. */
export const SAMPLE_CONSTANTS = {
  TASK_STATUSES,
  TASK_PRIORITIES,
};
