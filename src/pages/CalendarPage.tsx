import { useMemo, useState } from 'react';
import type { Holiday, ISODate, Task } from '../types';
import { db, useAction, useAppData, useSelectedProject } from '../hooks/useAppData';
import { ConfirmDialog } from '../components/Modal';
import { EmptyState, Field, SectionCard } from '../components/ui';
import { WEEKDAY_LABELS } from '../utils/calendar';
import { compareISO, formatDateID, formatDayNameID, isValidISO, parseISO, toISO, todayISO } from '../utils/date';
import type { FieldErrors } from '../utils/validation';

const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function monthLabel(year: number, month: number) {
  return `${MONTHS_ID[month]} ${year}`;
}

/** Halaman kalender kerja: konfigurasi hari kerja, hari libur, dan jadwal tugas bulanan. */
export function CalendarPage() {
  const data = useAppData();
  const { project } = useSelectedProject();
  const runAction = useAction();
  const today = todayISO();
  const [cursor, setCursor] = useState(() => {
    const now = parseISO(today);
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayName, setHolidayName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const [selectedDay, setSelectedDay] = useState<ISODate | null>(null);

  const holidays = useMemo(
    () => (project ? data.holidays.filter((holiday) => holiday.projectId === project.id) : []),
    [data.holidays, project],
  );
  const calendar = useMemo(
    () => (project ? db.calendarOf(project.id) : null),
    [project, data],
  );
  const schedule = useMemo(() => (project ? db.scheduleOf(project.id) : null), [project, data]);
  const tasks = useMemo(() => (project ? db.tasksOf(project.id) : []), [project, data]);

  if (!project || !calendar) {
    return (
      <div className="page">
        <EmptyState title="Belum ada proyek" message="Buat proyek terlebih dahulu untuk mengonfigurasi kalender kerja." />
      </div>
    );
  }

  // Grid bulan (7 kolom, dimulai Minggu).
  const firstOfMonth = toISO(new Date(cursor.year, cursor.month, 1));
  const lastOfMonth = toISO(new Date(cursor.year, cursor.month + 1, 0));
  const leadingBlanks = parseISO(firstOfMonth).getDay();
  const daysInMonth = parseISO(lastOfMonth).getDate();
  const cells: (ISODate | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => toISO(new Date(cursor.year, cursor.month, index + 1))),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const tasksOnDay = (date: ISODate): Task[] => {
    const entry = schedule?.entries;
    return tasks.filter((task) => {
      const taskEntry = entry?.[task.id];
      if (!taskEntry) return compareISO(task.startDate, date) === 0;
      return compareISO(taskEntry.start, date) <= 0 && compareISO(date, taskEntry.end) <= 0;
    });
  };

  const shiftMonth = (delta: number) => {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const toggleWorkingDay = (day: number) => {
    const next = project.workingDays.includes(day)
      ? project.workingDays.filter((item) => item !== day)
      : [...project.workingDays, day];
    const result = runAction(
      () => db.setProjectWorkingDays(project.id, next),
      'Kalender kerja diperbarui; seluruh jadwal dihitung ulang.',
    );
    if (!result.ok) {
      setErrors({ workingDays: result.error });
    } else {
      setErrors({});
    }
  };

  const addHoliday = () => {
    const result = runAction(
      () => db.addHoliday(project.id, { date: holidayDate, name: holidayName }),
      'Hari libur ditambahkan; jadwal otomatis menyesuaikan.',
    );
    if (!result.ok) {
      setErrors({ holiday: result.error });
      return;
    }
    setErrors({});
    setHolidayDate('');
    setHolidayName('');
  };

  const dayTasks = selectedDay ? tasksOnDay(selectedDay) : [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Kalender Kerja</h1>
          <p>
            Proyek <strong>{project.name}</strong> — hari kerja:{' '}
            {project.workingDays.map((day) => WEEKDAY_LABELS[day]).join(', ')} · {holidays.length} hari libur
          </p>
        </div>
      </div>

      <div className="calendar-layout">
        <SectionCard
          title={monthLabel(cursor.year, cursor.month)}
          subtitle="Klik tanggal untuk melihat tugas yang berjalan pada hari itu."
          actions={
            <div className="toolbar">
              <button type="button" className="btn btn-ghost" onClick={() => shiftMonth(-1)}>
                ← Bulan sebelumnya
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  const now = parseISO(today);
                  setCursor({ year: now.getFullYear(), month: now.getMonth() });
                }}
              >
                Bulan ini
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => shiftMonth(1)}>
                Bulan berikutnya →
              </button>
            </div>
          }
        >
          <div className="calendar-grid calendar-head">
            {['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((day) => (
              <div key={day} className="calendar-cell calendar-dayname">
                {day}
              </div>
            ))}
          </div>
          <div className="calendar-grid">
            {cells.map((date, index) => {
              if (!date) return <div key={`blank-${index}`} className="calendar-cell is-blank" />;
              const nonWorking = !calendar.isWorkingDay(date);
              const holiday = holidays.find((item) => item.date === date);
              const dayTasksList = tasksOnDay(date);
              const isToday = date === today;
              return (
                <button
                  key={date}
                  type="button"
                  className={`calendar-cell ${nonWorking ? 'is-nonworking' : ''} ${isToday ? 'is-today' : ''} ${
                    selectedDay === date ? 'is-selected' : ''
                  }`}
                  onClick={() => setSelectedDay(date)}
                >
                  <span className="calendar-date">{parseISO(date).getDate()}</span>
                  {holiday ? <span className="calendar-holiday-tag">{holiday.name}</span> : null}
                  <span className="calendar-task-count">{dayTasksList.length > 0 ? `${dayTasksList.length} tugas` : ''}</span>
                </button>
              );
            })}
          </div>
          <p className="text-muted small">
            Sel abu-abu = akhir pekan menurut konfigurasi proyek. Sel bertanda merah = hari libur khusus.
            Perubahan kalender langsung memengaruhi durasi, jadwal, jalur kritis, dan seluruh visualisasi.
          </p>
        </SectionCard>

        <div className="calendar-side">
          <SectionCard title="Hari kerja">
            <div className="weekday-picker">
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <label key={day} className={`weekday-chip ${project.workingDays.includes(day) ? 'is-active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={project.workingDays.includes(day)}
                    onChange={() => toggleWorkingDay(day)}
                  />
                  {WEEKDAY_LABELS[day]}
                </label>
              ))}
            </div>
            {errors.workingDays ? <p className="field-error">{errors.workingDays}</p> : null}
          </SectionCard>

          <SectionCard title="Hari libur khusus" subtitle="Hari libur tidak dihitung sebagai hari kerja.">
            {errors.holiday ? <div className="alert alert-error">{errors.holiday}</div> : null}
            <div className="form-inline">
              <Field label="Tanggal" htmlFor="holiday-date" error={errors.date} required>
                <input id="holiday-date" type="date" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} />
              </Field>
              <Field label="Nama hari libur" htmlFor="holiday-name" error={errors.name} required>
                <input
                  id="holiday-name"
                  value={holidayName}
                  onChange={(event) => setHolidayName(event.target.value)}
                  placeholder="mis. Hari Libur Nasional"
                />
              </Field>
              <button type="button" className="btn btn-primary" onClick={addHoliday} disabled={!isValidISO(holidayDate) || !holidayName.trim()}>
                Tambah
              </button>
            </div>
            <ul className="holiday-list">
              {holidays
                .slice()
                .sort((a, b) => compareISO(a.date, b.date))
                .map((holiday) => (
                  <li key={holiday.id}>
                    <span>
                      <strong>{formatDateID(holiday.date)}</strong> — {holiday.name}{' '}
                      <small className="text-muted">({formatDayNameID(holiday.date)})</small>
                    </span>
                    <button type="button" className="btn-icon" title="Hapus hari libur" onClick={() => setDeleting(holiday)}>
                      🗑
                    </button>
                  </li>
                ))}
              {holidays.length === 0 ? <li className="text-muted">Belum ada hari libur khusus.</li> : null}
            </ul>
          </SectionCard>

          <SectionCard title={selectedDay ? `Tugas pada ${formatDateID(selectedDay)}` : 'Pilih tanggal'}>
            {selectedDay ? (
              dayTasks.length === 0 ? (
                <p className="text-muted">Tidak ada tugas yang berjalan pada tanggal tersebut.</p>
              ) : (
                <ul className="holiday-list">
                  {dayTasks.map((task) => (
                    <li key={task.id}>
                      <span>{task.name}</span>
                      <span className="badge badge-info">{task.status}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="text-muted">Klik salah satu tanggal pada kalender untuk melihat jadwal tugas.</p>
            )}
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title="Hapus hari libur?"
        message={`"${deleting?.name}" (${deleting ? formatDateID(deleting.date) : ''}) akan dihapus dari kalender kerja proyek dan jadwal dihitung ulang.`}
        onConfirm={() => {
          if (!deleting) return;
          const result = runAction(() => db.deleteHoliday(deleting.id), 'Hari libur dihapus; jadwal dihitung ulang.');
          if (result.ok) setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
