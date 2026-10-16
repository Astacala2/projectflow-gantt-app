/**
 * Kalender kerja sebuah proyek: hari kerja dalam seminggu + hari libur khusus.
 * Seluruh perhitungan durasi & penjadwalan melewati kelas ini sehingga akhir pekan
 * dan hari libur tidak pernah dihitung sebagai hari kerja.
 */
import type { ISODate } from '../types';
import { addDays, compareISO, diffDays, isValidISO, parseISO, toISO, weekdayOf } from './date';

/** Epoch tetap untuk perhitungan ordinal (tidak berpengaruh pada hasil selisih). */
const EPOCH: ISODate = '1970-01-01';
const EPOCH_WEEKDAY = 4; // 1970-01-01 adalah hari Kamis
const MAX_SCAN_DAYS = 40000; // batas pencarian ordinal (~109 tahun)

export class WorkCalendar {
  private readonly workingDays: Set<number>;
  private readonly holidays: Set<ISODate>;
  private readonly perWeek: number;
  private ordinalCache = new Map<ISODate, number>();
  private dateCache = new Map<number, ISODate>();

  constructor(workingDays: number[], holidays: ISODate[]) {
    // Jika tidak ada hari kerja yang didefinisikan, seluruh hari (non-libur) dianggap kerja
    // agar perhitungan tidak pernah menggantung. Validasi form mencegah kondisi ini.
    const days = workingDays && workingDays.length > 0 ? workingDays : [0, 1, 2, 3, 4, 5, 6];
    this.workingDays = new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
    this.perWeek = this.workingDays.size;
    this.holidays = new Set((holidays ?? []).filter((h) => isValidISO(h)));
  }

  get workingDayList(): number[] {
    return [...this.workingDays].sort((a, b) => a - b);
  }

  isHoliday(date: ISODate): boolean {
    return this.holidays.has(date);
  }

  isWeekend(date: ISODate): boolean {
    return !this.workingDays.has(weekdayOf(date));
  }

  isWorkingDay(date: ISODate): boolean {
    return this.workingDays.has(weekdayOf(date)) && !this.holidays.has(date);
  }

  /** Hari kerja pertama >= date. */
  nextWorkingDay(date: ISODate): ISODate {
    let cursor = date;
    for (let i = 0; i < MAX_SCAN_DAYS; i += 1) {
      if (this.isWorkingDay(cursor)) return cursor;
      cursor = addDays(cursor, 1);
    }
    return date;
  }

  /** Hari kerja terakhir <= date. */
  previousWorkingDay(date: ISODate): ISODate {
    let cursor = date;
    for (let i = 0; i < MAX_SCAN_DAYS; i += 1) {
      if (this.isWorkingDay(cursor)) return cursor;
      cursor = addDays(cursor, -1);
    }
    return date;
  }

  /**
   * Tanggal hari kerja ke-n terhitung dari `start` (start dihitung sebagai hari ke-1
   * bila merupakan hari kerja; jika bukan, dihitung mulai hari kerja berikutnya).
   * n minimal 1.
   */
  addWorkingDays(start: ISODate, n: number): ISODate {
    const count = Math.max(1, Math.floor(n));
    const first = this.nextWorkingDay(start);
    const targetOrdinal = this.ordinal(first) + count - 1;
    return this.dateFromOrdinal(targetOrdinal);
  }

  /**
   * Jumlah hari kerja inklusif dari start sampai end.
   * Menghasilkan nilai negatif jika end berada sebelum start.
   */
  countWorkingDays(start: ISODate, end: ISODate): number {
    if (compareISO(end, start) < 0) return -this.countWorkingDays(end, start);
    const first = this.nextWorkingDay(start);
    if (compareISO(first, end) > 0) return 0;
    const last = this.previousWorkingDay(end);
    return this.ordinal(last) - this.ordinal(first) + 1;
  }

  /** Daftar hari kerja dalam rentang (inklusif, dibatasi `limit` untuk keamanan tampilan). */
  listWorkingDays(start: ISODate, end: ISODate, limit = 2000): ISODate[] {
    const out: ISODate[] = [];
    if (compareISO(start, end) > 0) return out;
    let cursor = this.nextWorkingDay(start);
    while (compareISO(cursor, end) <= 0 && out.length < limit) {
      if (this.isWorkingDay(cursor)) out.push(cursor);
      cursor = addDays(cursor, 1);
    }
    return out;
  }

  /**
   * Ordinal hari kerja: jumlah hari kerja dari EPOCH sampai `date` (inklusif bila hari kerja).
   * Ordinal adalah representasi integer yang dipakai algoritma CPM.
   */
  ordinal(date: ISODate): number {
    const cached = this.ordinalCache.get(date);
    if (cached !== undefined) return cached;

    let value: number;
    if (compareISO(date, EPOCH) >= 0) {
      const totalDays = diffDays(EPOCH, date) + 1;
      const fullWeeks = Math.floor(totalDays / 7);
      const remainder = totalDays - fullWeeks * 7;
      let count = fullWeeks * this.perWeek;
      for (let i = 0; i < remainder; i += 1) {
        if (this.workingDays.has((EPOCH_WEEKDAY + i) % 7)) count += 1;
      }
      // Kurangi hari libur yang jatuh pada hari kerja biasa di rentang tersebut.
      for (const holiday of this.holidays) {
        if (compareISO(holiday, date) <= 0 && this.workingDays.has(weekdayOf(holiday))) {
          count -= 1;
        }
      }
      value = count;
    } else {
      // Tanggal sebelum epoch: negatif dari jumlah hari kerja setelahnya.
      let count = 0;
      let cursor = addDays(date, 1);
      while (compareISO(cursor, EPOCH) <= 0) {
        if (this.workingDays.has(weekdayOf(cursor)) && !this.holidays.has(cursor)) count += 1;
        cursor = addDays(cursor, 1);
      }
      value = -count;
    }

    this.ordinalCache.set(date, value);
    return value;
  }

  /** Kebalikan dari ordinal(): tanggal pertama yang ordinal-nya >= n (yaitu hari kerja ke-n). */
  dateFromOrdinal(n: number): ISODate {
    const cached = this.dateCache.get(n);
    if (cached !== undefined) return cached;

    let low = 0;
    let high = MAX_SCAN_DAYS;
    let result = addDays(EPOCH, high);
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const date = addDays(EPOCH, mid);
      if (this.ordinal(date) >= n) {
        result = date;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    this.dateCache.set(n, result);
    return result;
  }
}

/** Memo: satu WorkCalendar per proyek agar perhitungan ordinal tidak diulang. */
const calendarCache = new Map<string, { key: string; calendar: WorkCalendar }>();

/**
 * Mendapatkan (dan mencache) WorkCalendar untuk sebuah proyek.
 * `key` harus berubah jika konfigurasi kalender berubah (mis. gabungan jumlah hari libur + hari kerja).
 */
export function getProjectCalendar(
  projectId: string,
  workingDays: number[],
  holidays: ISODate[],
): WorkCalendar {
  const key = `${workingDays.join(',') }|${[...holidays].sort().join(',')}`;
  const cached = calendarCache.get(projectId);
  if (cached && cached.key === key) return cached.calendar;
  const calendar = new WorkCalendar(workingDays, holidays);
  calendarCache.set(projectId, { key, calendar });
  return calendar;
}

/** Uji coba apakah sebuah tanggal berada di masa lalu dibanding hari ini. */
export function isPastDate(date: ISODate): boolean {
  return compareISO(date, toISO(new Date())) < 0;
}

/** Nama hari kerja untuk ditampilkan pada form kalender. */
export const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Minggu',
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
};

/** Konversi tanggal menjadi objek {tahun, bulan} untuk tampilan kalender bulanan. */
export function yearMonthOf(date: ISODate): { year: number; month: number } {
  const parsed = parseISO(date);
  return { year: parsed.getFullYear(), month: parsed.getMonth() };
}
