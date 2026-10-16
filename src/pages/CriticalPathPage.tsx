import { useMemo } from 'react';
import { db, useAppData, useSelectedProject } from '../hooks/useAppData';
import { findCriticalPaths, nearCriticalTasks } from '../utils/criticalPath';
import { expandDependencies } from '../utils/schedule';
import { EmptyState, SectionCard, WarningPanel } from '../components/ui';
import { formatDateID } from '../utils/date';

/** Halaman Critical Path Analysis (CPM) dengan forward & backward pass. */
export function CriticalPathPage() {
  const data = useAppData();
  const { project } = useSelectedProject();

  const schedule = useMemo(() => (project ? db.scheduleOf(project.id) : null), [project, data]);
  const dependencies = useMemo(() => (project ? db.dependenciesOf(project.id) : []), [project, data]);
  const tasks = useMemo(() => (project ? db.tasksOf(project.id) : []), [project, data]);
  const taskName = (id: string) => tasks.find((task) => task.id === id)?.name ?? id;

  const paths = useMemo(
    () => (schedule?.ok ? findCriticalPaths(schedule, expandDependencies(tasks, dependencies).edges) : null),
    [schedule, tasks, dependencies],
  );
  const nearCritical = useMemo(
    () => (schedule?.ok ? nearCriticalTasks(schedule, 5) : []),
    [schedule],
  );

  if (!project || !schedule) {
    return (
      <div className="page">
        <EmptyState title="Belum ada proyek" message="Buat atau pilih proyek untuk menganalisis jalur kritis." />
      </div>
    );
  }

  if (!schedule.ok) {
    return (
      <div className="page">
        <h1>Analisis Jalur Kritis</h1>
        <WarningPanel items={schedule.warnings} title="Analisis tidak dapat dihitung" />
        <SectionCard>
          <p>
            Perbaiki data proyek <strong>{project.name}</strong> (siklus dependensi, durasi tidak valid, atau tugas
            yatim) sebelum analisis jalur kritis dapat dijalankan. Sistem tidak menampilkan hasil seolah-olah valid
            ketika data belum memadai.
          </p>
        </SectionCard>
      </div>
    );
  }

  const criticalEntries = schedule.criticalIds
    .map((id) => schedule.entries[id])
    .filter((entry): entry is NonNullable<typeof entry> => !!entry);
  const nonCriticalEntries = Object.values(schedule.entries).filter((entry) => !entry.isCritical && !entry.isSummary);
  const lateWarnings = schedule.warnings.filter(
    (warning) => warning.code === 'START_CONFLICT' || warning.code === 'INVALID_DURATION' || warning.code === 'INVALID_START',
  );
  const riskyTasks = nonCriticalEntries
    .filter((entry) => entry.totalFloat <= 2)
    .sort((a, b) => a.totalFloat - b.totalFloat);
  const finishVsTarget = schedule.projectFinish
    ? schedule.projectFinish > project.targetEndDate
      ? 'lewat'
      : 'sebelum'
    : null;

  const allEntries = Object.values(schedule.entries).sort((a, b) => a.startOrdinal - b.startOrdinal);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Analisis Jalur Kritis (CPM)</h1>
          <p>
            {project.name} · dihitung dengan forward pass &amp; backward pass memakai durasi hari kerja, dependensi
            FS/SS + lag, dan kalender kerja proyek.
          </p>
        </div>
      </div>

      <WarningPanel items={lateWarnings} />

      <div className="stat-grid">
        <div className="stat-card">
          <span>Estimasi durasi minimum proyek</span>
          <strong>{schedule.duration} hari kerja</strong>
        </div>
        <div className="stat-card">
          <span>Perkiraan tanggal penyelesaian</span>
          <strong>{schedule.projectFinish ? formatDateID(schedule.projectFinish) : '-'}</strong>
        </div>
        <div className="stat-card">
          <span>Target tanggal selesai</span>
          <strong>{formatDateID(project.targetEndDate)}</strong>
        </div>
        <div className="stat-card">
          <span>Posisi terhadap target</span>
          <strong className={finishVsTarget === 'lewat' ? 'text-danger' : 'text-success'}>
            {finishVsTarget === 'lewat' ? 'Berpotensi terlambat' : finishVsTarget === 'sebelum' ? 'Masih sesuai target' : '-'}
          </strong>
        </div>
        <div className="stat-card">
          <span>Jumlah tugas kritis</span>
          <strong>{criticalEntries.length} dari {schedule.leafIds.length} tugas</strong>
        </div>
        <div className="stat-card">
          <span>Jumlah jalur kritis ditemukan</span>
          <strong>{paths?.paths.length ?? 0}</strong>
        </div>
      </div>

      <SectionCard
        title="Urutan tugas pada jalur kritis"
        subtitle="Tugas dengan total float nol. Keterlambatan pada salah satu tugas ini langsung menunda penyelesaian proyek."
      >
        {paths && paths.paths.length > 0 ? (
          <div className="path-list">
            {paths.paths.map((path, index) => (
              <div key={`${path.join('-')}-${index}`} className="path-item">
                <div className="path-head">
                  Jalur {index + 1} · {paths.durations[index]} hari kerja
                </div>
                <div className="path-steps">
                  {path.map((taskId, stepIndex) => (
                    <span key={taskId} className="path-step">
                      {stepIndex > 0 ? <span className="path-arrow">→</span> : null}
                      <span className="chip-critical">
                        {stepIndex + 1}. {taskName(taskId)}
                        <small>{schedule.entries[taskId]?.duration} hr</small>
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted">
            Tidak ada jalur kritis yang dapat ditampilkan (kemungkinan seluruh tugas memiliki float atau belum ada
            dependensi).
          </p>
        )}
      </SectionCard>

      <SectionCard title="Daftar tugas kritis" subtitle="ES = Earliest Start, EF = Earliest Finish, LS = Latest Start, LF = Latest Finish.">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tugas</th>
                <th>Durasi</th>
                <th>ES</th>
                <th>EF</th>
                <th>LS</th>
                <th>LF</th>
                <th>Total float</th>
              </tr>
            </thead>
            <tbody>
              {criticalEntries.map((entry) => (
                <tr key={entry.taskId} className="row-critical">
                  <td>{taskName(entry.taskId)}{entry.isSummary ? ' (tugas induk)' : ''}</td>
                  <td>{entry.duration} hr</td>
                  <td>{formatDateID(entry.start)}</td>
                  <td>{formatDateID(entry.end)}</td>
                  <td>{formatDateID(entry.lateStart)}</td>
                  <td>{formatDateID(entry.lateFinish)}</td>
                  <td><span className="badge badge-danger">{entry.totalFloat} hr</span></td>
                </tr>
              ))}
              {criticalEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted">
                    Belum ada tugas kritis. Tambahkan dependensi agar urutan kerja terbentuk.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Daftar tugas nonkritis" subtitle={`Total ${nonCriticalEntries.length} tugas dengan float di atas nol.`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tugas</th>
                <th>Durasi</th>
                <th>ES</th>
                <th>EF</th>
                <th>LS</th>
                <th>LF</th>
                <th>Total float</th>
              </tr>
            </thead>
            <tbody>
              {nonCriticalEntries.map((entry) => (
                <tr key={entry.taskId}>
                  <td>{taskName(entry.taskId)}</td>
                  <td>{entry.duration} hr</td>
                  <td>{formatDateID(entry.start)}</td>
                  <td>{formatDateID(entry.end)}</td>
                  <td>{formatDateID(entry.lateStart)}</td>
                  <td>{formatDateID(entry.lateFinish)}</td>
                  <td>
                    <span className={`badge ${entry.totalFloat <= 2 ? 'badge-warning' : 'badge-neutral'}`}>
                      {entry.totalFloat} hr
                    </span>
                  </td>
                </tr>
              ))}
              {nonCriticalEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted">
                    Semua tugas berada pada jalur kritis.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Peringatan keterlambatan" subtitle="Tugas yang hampir kritis (float ≤ 2 hari kerja) wajib dipantau.">
        {riskyTasks.length > 0 ? (
          <ul className="summary-list">
            {riskyTasks.map((entry) => (
              <li key={entry.taskId}>
                <span>
                  {taskName(entry.taskId)} — float {entry.totalFloat} hari kerja
                </span>
                <span className="badge badge-warning">Waspada</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">Tidak ada tugas dengan float sangat kecil saat ini.</p>
        )}
        {nearCritical.length > 0 ? (
          <p className="text-muted small">
            Kandidat jalur kritis berikutnya: {nearCritical.map((id) => taskName(id)).join(' → ')}.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Tabel lengkap ES/EF/LS/LF" subtitle="Termasuk tugas induk (agregasi dari subtugasnya).">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tugas</th>
                <th>Jenis</th>
                <th>Durasi</th>
                <th>ES</th>
                <th>EF</th>
                <th>LS</th>
                <th>LF</th>
                <th>Float</th>
                <th>Penanda</th>
              </tr>
            </thead>
            <tbody>
              {allEntries.map((entry) => (
                <tr key={entry.taskId} className={entry.isCritical && !entry.isSummary ? 'row-critical' : ''}>
                  <td>{taskName(entry.taskId)}</td>
                  <td>{entry.isSummary ? 'Induk' : db.hasChildren(entry.taskId) ? 'Induk' : 'Detail'}</td>
                  <td>{entry.duration} hr</td>
                  <td>{formatDateID(entry.start)}</td>
                  <td>{formatDateID(entry.end)}</td>
                  <td>{formatDateID(entry.lateStart)}</td>
                  <td>{formatDateID(entry.lateFinish)}</td>
                  <td>{entry.totalFloat} hr</td>
                  <td>{entry.isCritical ? <span className="badge badge-danger">Kritis</span> : <span className="badge badge-neutral">Non-kritis</span>}</td>
                </tr>
              ))}
              {allEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-muted">
                    Belum ada tugas terjadwal.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
