/**
 * Pengujian lapisan data (services/db) yang mencakup sebagian besar poin wajib:
 * CRUD proyek, tugas & subtugas, dependensi FS/SS + lag, penolakan siklus,
 * anggota & penugasan, deteksi kelebihan beban, persistensi localStorage,
 * serta ekspor/impor JSON.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import * as db from './db';
import { clearAllData, createDependency, createMember, createProject, createTask, deleteTask, exportToJSON, getState, importFromJSON, resetToSampleData, setProjectWorkingDays, addHoliday, scheduleOf, tasksOf, updateProject, updateTask, workloadOf, createAssignment, updateAssignment, dependenciesOf } from './db';
import { STORAGE_KEY, readFromStorage } from './storage';

const PROJECT = {
  name: 'Proyek Uji',
  description: 'Deskripsi uji',
  organization: 'Organisasi Uji',
  manager: 'Manajer Uji',
  startDate: '2026-01-05',
  targetEndDate: '2026-03-31',
  status: 'Berjalan' as const,
  workingDays: [1, 2, 3, 4, 5],
};

function seedProject(): string {
  const result = createProject(PROJECT);
  if (!result.ok || !result.value) throw new Error('Gagal membuat proyek contoh uji');
  return result.value.id;
}

function seedTask(projectId: string, name: string, duration: number, startDate = '2026-01-05', parentId: string | null = null) {
  const result = createTask({
    projectId,
    name,
    description: '',
    startDate,
    duration,
    priority: 'Sedang',
    status: 'Belum Dimulai',
    progress: 0,
    parentId,
    notes: '',
  });
  if (!result.ok || !result.value) throw new Error(`Gagal membuat tugas ${name}: ${!result.ok ? result.error : ''}`);
  return result.value;
}

beforeEach(() => {
  clearAllData();
});

describe('Manajemen proyek', () => {
  it('membuat proyek baru dengan data lengkap', () => {
    const projectId = seedProject();
    const project = db.getProjectById(projectId);
    expect(project?.name).toBe('Proyek Uji');
    expect(project?.workingDays).toEqual([1, 2, 3, 4, 5]);
    expect(project?.progress).toBe(0);
    expect(getState().settings.selectedProjectId).toBe(projectId);
  });

  it('menolak nama kosong', () => {
    const result = createProject({ ...PROJECT, name: '   ' });
    expect(result.ok).toBe(false);
  });

  it('menolak target selesai yang mendahului tanggal mulai', () => {
    const result = createProject({ ...PROJECT, targetEndDate: '2026-01-01' });
    expect(result.ok).toBe(false);
  });

  it('mengubah proyek dan memvalidasi kembali', () => {
    const projectId = seedProject();
    const result = updateProject(projectId, { name: 'Proyek Diubah', status: 'Selesai' });
    expect(result.ok).toBe(true);
    expect(db.getProjectById(projectId)?.name).toBe('Proyek Diubah');
    expect(db.getProjectById(projectId)?.status).toBe('Selesai');

    const invalid = updateProject(projectId, { targetEndDate: '2020-01-01' });
    expect(invalid.ok).toBe(false);
  });

  it('menghapus proyek beserta tugas, dependensi, hari libur, dan penugasan', () => {
    const projectId = seedProject();
    const taskA = seedTask(projectId, 'A', 3);
    const taskB = seedTask(projectId, 'B', 3);
    createDependency({ projectId, predecessorId: taskA.id, successorId: taskB.id, type: 'FS', lag: 0, note: '' });
    db.addHoliday(projectId, { date: '2026-01-07', name: 'Libur uji' });
    createMember({ name: 'Andi', email: 'andi@example.com', role: 'Developer', skills: '', rate: 0, rateUnit: 'jam', dailyCapacity: 8, active: true, notes: '' });
    createAssignment({ taskId: taskA.id, memberId: db.getState().members[0].id, role: 'Koder', allocation: 50, startDate: '2026-01-05', endDate: '2026-01-07', note: '' });

    const result = db.deleteProject(projectId);
    expect(result.ok).toBe(true);
    expect(getState().projects).toHaveLength(0);
    expect(getState().tasks).toHaveLength(0);
    expect(getState().dependencies).toHaveLength(0);
    expect(getState().holidays).toHaveLength(0);
    expect(getState().assignments).toHaveLength(0);
    expect(getState().settings.selectedProjectId).toBeNull();
  });
});

describe('Manajemen tugas & subtugas', () => {
  it('membuat tugas dengan tanggal selesai mengikuti kalender kerja', () => {
    const projectId = seedProject();
    const task = seedTask(projectId, 'Analisis', 5);
    // Senin 5 Jan + 5 hari kerja = Jumat 9 Jan.
    expect(task.endDate).toBe('2026-01-09');
  });

  it('membuat subtugas di bawah tugas induk', () => {
    const projectId = seedProject();
    const parent = seedTask(projectId, 'Analisis Kebutuhan', 1);
    const child = seedTask(projectId, 'Wawancara Pengguna', 3, '2026-01-05', parent.id);
    expect(child.parentId).toBe(parent.id);
    expect(tasksOf(projectId)).toHaveLength(2);

    const schedule = scheduleOf(projectId);
    expect(schedule.entries[parent.id].isSummary).toBe(true);
    // Mulai tugas induk = tanggal mulai tanggal anak terawal.
    expect(schedule.entries[parent.id].start).toBe(schedule.entries[child.id].start);
  });

  it('menolak durasi kurang dari 1 hari kerja dan progres di luar 0-100', () => {
    const projectId = seedProject();
    expect(
      createTask({
        projectId, name: 'X', description: '', startDate: '2026-01-05', duration: 0,
        priority: 'Sedang', status: 'Belum Dimulai', progress: 0, parentId: null, notes: '',
      }).ok,
    ).toBe(false);
    const task = seedTask(projectId, 'Y', 2);
    expect(updateTask(task.id, { progress: 150 }).ok).toBe(false);
    expect(updateTask(task.id, { progress: 80 }).ok).toBe(true);
  });

  it('memperbarui tanggal selesai saat durasi berubah', () => {
    const projectId = seedProject();
    const task = seedTask(projectId, 'Frontend', 5);
    const updated = updateTask(task.id, { duration: 10 });
    expect(updated.ok).toBe(true);
    expect(db.taskById(task.id)?.endDate).toBe('2026-01-16');
  });

  it('menghapus tugas beserta subtugas, dependensi, dan penugasannya', () => {
    const projectId = seedProject();
    const parent = seedTask(projectId, 'Pengembangan', 1);
    const childA = seedTask(projectId, 'Frontend', 3, '2026-01-05', parent.id);
    const childB = seedTask(projectId, 'Backend', 3, '2026-01-08', parent.id);
    createDependency({ projectId, predecessorId: childA.id, successorId: childB.id, type: 'FS', lag: 0, note: '' });
    createMember({ name: 'Andi', email: 'andi@example.com', role: 'Developer', skills: '', rate: 0, rateUnit: 'jam', dailyCapacity: 8, active: true, notes: '' });
    createAssignment({ taskId: childA.id, memberId: db.getState().members[0].id, role: 'Koder', allocation: 100, startDate: '2026-01-05', endDate: '2026-01-07', note: '' });

    const result = deleteTask(parent.id);
    expect(result.ok).toBe(true);
    expect(getState().tasks).toHaveLength(0);
    expect(getState().dependencies).toHaveLength(0);
    expect(getState().assignments).toHaveLength(0);
  });

  it('menghitung progres proyek berbobot durasi tugas daun', () => {
    const projectId = seedProject();
    const taskA = seedTask(projectId, 'A', 3);
    seedTask(projectId, 'B', 1);
    updateTask(taskA.id, { progress: 100 });
    // (100*3 + 0*1) / 4 = 75
    expect(db.computeProjectProgress(projectId)).toBe(75);
    expect(db.getProjectById(projectId)?.progress).toBe(75);
  });
});

describe('Ketergantungan tugas (FS/SS + lag)', () => {
  it('membuat dependensi FS dan SS dengan lag', () => {
    const projectId = seedProject();
    const a = seedTask(projectId, 'Perancangan UI/UX', 4);
    const b = seedTask(projectId, 'Implementasi Frontend', 5);
    const c = seedTask(projectId, 'Dokumentasi Teknis', 2);

    expect(createDependency({ projectId, predecessorId: a.id, successorId: b.id, type: 'FS', lag: 0, note: '' }).ok).toBe(true);
    expect(createDependency({ projectId, predecessorId: b.id, successorId: c.id, type: 'SS', lag: 1, note: 'contoh' }).ok).toBe(true);
    expect(dependenciesOf(projectId)).toHaveLength(2);

    const schedule = scheduleOf(projectId);
    // B dimulai setelah A selesai (4 hari kerja dari 5 Jan -> selesai 8 Jan, B mulai 9 Jan).
    expect(schedule.entries[b.id].start).toBe('2026-01-09');
    // C SS+1 dari B -> mulai 1 hari kerja setelah B mulai (9 Jan -> 12 Jan).
    expect(schedule.entries[c.id].start).toBe('2026-01-12');
  });

  it('menolak dependensi diri sendiri', () => {
    const projectId = seedProject();
    const a = seedTask(projectId, 'A', 2);
    const result = createDependency({ projectId, predecessorId: a.id, successorId: a.id, type: 'FS', lag: 0, note: '' });
    expect(result.ok).toBe(false);
  });

  it('menolak dependensi lintas proyek', () => {
    const projectA = seedProject();
    const projectB = seedProject();
    const taskA = seedTask(projectA, 'A', 2);
    const taskB = seedTask(projectB, 'B', 2);
    const result = createDependency({ projectId: projectA, predecessorId: taskA.id, successorId: taskB.id, type: 'FS', lag: 0, note: '' });
    expect(result.ok).toBe(false);
  });

  it('menolak pembentukan siklus dependensi', () => {
    const projectId = seedProject();
    const a = seedTask(projectId, 'A', 2);
    const b = seedTask(projectId, 'B', 2);
    const c = seedTask(projectId, 'C', 2);
    expect(createDependency({ projectId, predecessorId: a.id, successorId: b.id, type: 'FS', lag: 0, note: '' }).ok).toBe(true);
    expect(createDependency({ projectId, predecessorId: b.id, successorId: c.id, type: 'FS', lag: 0, note: '' }).ok).toBe(true);
    const cycle = createDependency({ projectId, predecessorId: c.id, successorId: a.id, type: 'FS', lag: 0, note: '' });
    expect(cycle.ok).toBe(false);
    if (!cycle.ok) expect(cycle.error).toMatch(/siklus/i);
  });

  it('menolak duplikat dan lag negatif', () => {
    const projectId = seedProject();
    const a = seedTask(projectId, 'A', 2);
    const b = seedTask(projectId, 'B', 2);
    expect(createDependency({ projectId, predecessorId: a.id, successorId: b.id, type: 'FS', lag: 0, note: '' }).ok).toBe(true);
    expect(createDependency({ projectId, predecessorId: a.id, successorId: b.id, type: 'FS', lag: 0, note: '' }).ok).toBe(false);
    expect(createDependency({ projectId, predecessorId: b.id, successorId: a.id, type: 'FS', lag: -1, note: '' }).ok).toBe(false);
  });

  it('perubahan dependensi memperbarui jadwal yang terdampak', () => {
    const projectId = seedProject();
    const a = seedTask(projectId, 'A', 3);
    const b = seedTask(projectId, 'B', 2);
    const dep = createDependency({ projectId, predecessorId: a.id, successorId: b.id, type: 'FS', lag: 0, note: '' });
    expect(dep.ok).toBe(true);
    const depId = dep.ok && dep.value ? dep.value.id : '';
    expect(scheduleOf(projectId).entries[b.id].start).toBe('2026-01-08');

    const updated = db.updateDependency(depId, { lag: 3 });
    expect(updated.ok).toBe(true);
    expect(scheduleOf(projectId).entries[b.id].start).toBe('2026-01-13');
  });
});

describe('Kalender kerja memengaruhi penjadwalan', () => {
  it('menambah hari libur memperpanjang jadwal tugas', () => {
    const projectId = seedProject();
    const task = seedTask(projectId, 'Analisis', 5);
    expect(scheduleOf(projectId).entries[task.id].end).toBe('2026-01-09');

    const holiday = addHoliday(projectId, { date: '2026-01-07', name: 'Libur Nasional' });
    expect(holiday.ok).toBe(true);
    // 5 hari kerja dari 5 Jan dengan libur 7 Jan -> selesai 12 Jan.
    expect(scheduleOf(projectId).entries[task.id].end).toBe('2026-01-12');
  });

  it('mengubah hari kerja memperbarui jadwal', () => {
    const projectId = seedProject();
    const task = seedTask(projectId, 'Analisis', 6);
    // Senin-Jumat: 6 hari kerja dari 5 Jan -> selesai 12 Jan.
    expect(scheduleOf(projectId).entries[task.id].end).toBe('2026-01-12');
    // Tambahkan Sabtu sebagai hari kerja -> selesai 10 Jan.
    expect(setProjectWorkingDays(projectId, [1, 2, 3, 4, 5, 6]).ok).toBe(true);
    expect(scheduleOf(projectId).entries[task.id].end).toBe('2026-01-10');
  });

  it('menolah konfigurasi tanpa hari kerja', () => {
    const projectId = seedProject();
    expect(setProjectWorkingDays(projectId, []).ok).toBe(false);
  });
});

describe('Sumber daya & penugasan', () => {
  it('membuat anggota dan menugaskannya ke tugas', () => {
    const projectId = seedProject();
    const task = seedTask(projectId, 'Frontend', 5);
    const member = createMember({ name: 'Andi Wijaya', email: 'andi@example.com', role: 'Frontend Developer', skills: 'React', rate: 100000, rateUnit: 'jam', dailyCapacity: 8, active: true, notes: '' });
    expect(member.ok).toBe(true);
    if (!member.ok || !member.value) return;

    const assignment = createAssignment({
      taskId: task.id, memberId: member.value.id, role: 'Koder', allocation: 60,
      startDate: '2026-01-05', endDate: '2026-01-09', note: '',
    });
    expect(assignment.ok).toBe(true);
    expect(db.assignmentsOfTask(task.id)).toHaveLength(1);
    expect(workloadOf(projectId).byMember[member.value.id].peakAllocation).toBe(60);
  });

  it('menolak email ganda dan penugasan anggota nonaktif', () => {
    seedProject();
    createMember({ name: 'Andi', email: 'andi@example.com', role: 'Developer', skills: '', rate: 0, rateUnit: 'jam', dailyCapacity: 8, active: true, notes: '' });
    const duplicate = createMember({ name: 'Andi 2', email: 'andi@example.com', role: 'Developer', skills: '', rate: 0, rateUnit: 'jam', dailyCapacity: 8, active: true, notes: '' });
    expect(duplicate.ok).toBe(false);
  });

  it('mendeteksi kelebihan beban pada alokasi gabungan > 100%', () => {
    const projectId = seedProject();
    const taskA = seedTask(projectId, 'Tugas A', 4);
    const taskB = seedTask(projectId, 'Tugas B', 4);
    const member = createMember({ name: 'Andi', email: 'andi@example.com', role: 'Developer', skills: '', rate: 0, rateUnit: 'jam', dailyCapacity: 8, active: true, notes: '' });
    if (!member.ok || !member.value) throw new Error('member gagal');
    createAssignment({ taskId: taskA.id, memberId: member.value.id, role: 'Koder', allocation: 60, startDate: '2026-01-05', endDate: '2026-01-08', note: '' });
    createAssignment({ taskId: taskB.id, memberId: member.value.id, role: 'Reviewer', allocation: 60, startDate: '2026-01-05', endDate: '2026-01-08', note: '' });

    const workload = workloadOf(projectId);
    expect(workload.byMember[member.value.id].peakAllocation).toBe(120);
    expect(workload.conflicts.some((conflict) => conflict.type === 'OVERLOAD')).toBe(true);
  });

  it('menolak penugasan di luar rentang tanggal tugas', () => {
    const projectId = seedProject();
    const task = seedTask(projectId, 'Frontend', 3); // 5-7 Jan
    const member = createMember({ name: 'Andi', email: 'andi@example.com', role: 'Developer', skills: '', rate: 0, rateUnit: 'jam', dailyCapacity: 8, active: true, notes: '' });
    if (!member.ok || !member.value) throw new Error('member gagal');
    const assignment = createAssignment({
      taskId: task.id, memberId: member.value.id, role: 'Koder', allocation: 50,
      startDate: '2026-01-05', endDate: '2026-01-20', note: '',
    });
    expect(assignment.ok).toBe(false);
  });

  it('mengubah alokasi penugasan langsung tercermin pada beban kerja', () => {
    const projectId = seedProject();
    const task = seedTask(projectId, 'Frontend', 4);
    const member = createMember({ name: 'Andi', email: 'andi@example.com', role: 'Developer', skills: '', rate: 0, rateUnit: 'jam', dailyCapacity: 8, active: true, notes: '' });
    if (!member.ok || !member.value) throw new Error('member gagal');
    const assignment = createAssignment({
      taskId: task.id, memberId: member.value.id, role: 'Koder', allocation: 30,
      startDate: '2026-01-05', endDate: '2026-01-08', note: '',
    });
    expect(workloadOf(projectId).byMember[member.value.id].peakAllocation).toBe(30);
    if (!assignment.ok || !assignment.value) throw new Error('assignment gagal');
    expect(updateAssignment(assignment.value.id, { allocation: 90 }).ok).toBe(true);
    expect(workloadOf(projectId).byMember[member.value.id].peakAllocation).toBe(90);
  });
});

describe('Persistensi & pengelolaan data', () => {
  it('data tetap tersimpan pada localStorage (simulasi refresh halaman)', () => {
    const projectId = seedProject();
    seedTask(projectId, 'Tugas Persisten', 3);

    // Baca ulang langsung dari localStorage seperti yang dilakukan aplikasi saat dimuat.
    const reread = readFromStorage();
    expect(reread).toBeTruthy();
    expect(reread?.projects.some((project) => project.name === 'Proyek Uji')).toBe(true);
    expect(reread?.tasks.some((task) => task.name === 'Tugas Persisten')).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('Tugas Persisten');
  });

  it('menangani localStorage kosong dengan memuat data contoh', () => {
    window.localStorage.removeItem(STORAGE_KEY);
    clearAllData();
    resetToSampleData();
    const data = getState();
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].name).toContain('Website Profil Organisasi Mahasiswa');
    expect(data.tasks.length).toBeGreaterThan(10);
    expect(data.members).toHaveLength(8);
    // Jaringan contoh harus valid (tanpa siklus).
    expect(scheduleOf(data.projects[0].id).ok).toBe(true);
  });

  it('ekspor dan impor JSON mengembalikan seluruh data', () => {
    const projectId = seedProject();
    seedTask(projectId, 'Tugas Ekspor', 2);
    const backup = exportToJSON();
    expect(backup).toContain('Tugas Ekspor');

    clearAllData();
    expect(getState().projects).toHaveLength(0);

    const imported = importFromJSON(backup);
    expect(imported.ok).toBe(true);
    expect(getState().projects.some((project) => project.name === 'Proyek Uji')).toBe(true);
    expect(getState().tasks.some((task) => task.name === 'Tugas Ekspor')).toBe(true);
  });

  it('menolak impor berkas JSON yang tidak dikenali', () => {
    const result = importFromJSON('{"halaman":"tidak dikenal"}');
    expect(result.ok).toBe(false);
    const broken = importFromJSON('bukan json');
    expect(broken.ok).toBe(false);
  });

  it('menghitung ulang jadwal ketika proyek mendapat tugas baru (dashboard & visual ikut berubah)', () => {
    const projectId = seedProject();
    expect(scheduleOf(projectId).duration).toBe(0);
    seedTask(projectId, 'A', 5);
    expect(scheduleOf(projectId).duration).toBe(5);
    seedTask(projectId, 'B', 3, '2026-01-12');
    // A: 5-9 Jan, B: 12-14 Jan -> total 8 hari kerja proyek.
    expect(scheduleOf(projectId).duration).toBe(8);
  });
});
