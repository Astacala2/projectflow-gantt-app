import { describe, expect, it } from 'vitest';
import { WorkCalendar } from './calendar';

const MON_FRI = [1, 2, 3, 4, 5];

describe('WorkCalendar — hari kerja dasar', () => {
  it('menghitung durasi tanpa melewati akhir pekan', () => {
    const cal = new WorkCalendar(MON_FRI, []);
    // Senin 2026-01-05 + 5 hari kerja = Jumat 2026-01-09 (5,6,7,8,9).
    expect(cal.addWorkingDays('2026-01-05', 5)).toBe('2026-01-09');
    // Durasi melewati akhir pekan: 5 Jan Senin + 6 hari kerja = 12 Jan.
    expect(cal.addWorkingDays('2026-01-05', 6)).toBe('2026-01-12');
  });

  it('durasi 1 hari kerja dari hari kerja = hari itu juga', () => {
    const cal = new WorkCalendar(MON_FRI, []);
    expect(cal.addWorkingDays('2026-01-05', 1)).toBe('2026-01-05');
  });

  it('tanggal mulai pada akhir pekan digeser ke hari kerja berikutnya', () => {
    const cal = new WorkCalendar(MON_FRI, []);
    // 2026-01-10 = Sabtu -> mulai kerja Senin 2026-01-12.
    expect(cal.addWorkingDays('2026-01-10', 1)).toBe('2026-01-12');
    expect(cal.isWorkingDay('2026-01-10')).toBe(false);
    expect(cal.isWeekend('2026-01-10')).toBe(true);
  });

  it('menghitung jumlah hari kerja inklusif', () => {
    const cal = new WorkCalendar(MON_FRI, []);
    // 5 Jan s.d. 12 Jan: 5,6,7,8,9,12 = 6 hari kerja.
    expect(cal.countWorkingDays('2026-01-05', '2026-01-12')).toBe(6);
    // Rentang terbalik menghasilkan nilai negatif.
    expect(cal.countWorkingDays('2026-01-12', '2026-01-05')).toBe(-6);
  });

  it('rentang tanpa hari kerja bernilai nol', () => {
    const cal = new WorkCalendar(MON_FRI, []);
    expect(cal.countWorkingDays('2026-01-10', '2026-01-11')).toBe(0); // Sabtu-Minggu
  });
});

describe('WorkCalendar — hari libur', () => {
  it('hari libur tidak dihitung sebagai hari kerja', () => {
    const cal = new WorkCalendar(MON_FRI, ['2026-01-07']); // Rabu libur
    expect(cal.isWorkingDay('2026-01-07')).toBe(false);
    expect(cal.isHoliday('2026-01-07')).toBe(true);
    // 5 Jan + 5 hari kerja (lewati libur 7 Jan) = 12 Jan.
    expect(cal.addWorkingDays('2026-01-05', 5)).toBe('2026-01-12');
    expect(cal.countWorkingDays('2026-01-05', '2026-01-12')).toBe(5);
  });

  it('libur pada akhir pekan tidak mengurangi hari kerja dua kali', () => {
    const weekendHoliday = new WorkCalendar(MON_FRI, ['2026-01-10']); // Sabtu
    expect(weekendHoliday.countWorkingDays('2026-01-05', '2026-01-09')).toBe(5);
    expect(weekendHoliday.addWorkingDays('2026-01-05', 5)).toBe('2026-01-09');
  });
});

describe('WorkCalendar — konfigurasi lain', () => {
  it('mendukung kalender 6 hari kerja (Sabtu masuk)', () => {
    const cal = new WorkCalendar([1, 2, 3, 4, 5, 6], []);
    // Senin + 6 hari kerja = Sabtu 2026-01-10.
    expect(cal.addWorkingDays('2026-01-05', 6)).toBe('2026-01-10');
    expect(cal.isWorkingDay('2026-01-10')).toBe(true);
    expect(cal.isWorkingDay('2026-01-11')).toBe(false);
  });

  it('daftar hari kerja kosong dianggap seluruh hari kerja (keamanan)', () => {
    const cal = new WorkCalendar([], []);
    expect(cal.isWorkingDay('2026-01-10')).toBe(true);
    expect(cal.addWorkingDays('2026-01-05', 7)).toBe('2026-01-11');
  });

  it('ordinal dan dateFromOrdinal saling membalikan', () => {
    const cal = new WorkCalendar(MON_FRI, ['2026-01-07']);
    const dates = ['2026-01-05', '2026-01-06', '2026-01-08', '2026-01-09', '2026-01-12'];
    for (const date of dates) {
      expect(cal.dateFromOrdinal(cal.ordinal(date))).toBe(date);
    }
    // Ordinal berurutan pada hari kerja berurutan (7 Jan libur dilewati).
    expect(cal.ordinal('2026-01-08')).toBe(cal.ordinal('2026-01-06') + 1);
  });

  it('listWorkingDays hanya memuat hari kerja', () => {
    const cal = new WorkCalendar(MON_FRI, ['2026-01-07']);
    // 7 Jan hari Rabu libur, sehingga tidak ikut dalam daftar.
    expect(cal.listWorkingDays('2026-01-05', '2026-01-09')).toEqual(['2026-01-05', '2026-01-06', '2026-01-08', '2026-01-09']);
    expect(new WorkCalendar(MON_FRI, []).listWorkingDays('2026-01-05', '2026-01-09')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
    ]);
  });
});
