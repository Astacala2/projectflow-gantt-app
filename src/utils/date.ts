/**
 * Util tanggal murni bekerja dengan string ISO `YYYY-MM-DD`.
 * Semua operasi dilakukan pada tanggal (tanpa waktu) agar bebas masalah timezone/DST.
 */
import type { ISODate } from '../types';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const DAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Mengubah string ISO menjadi objek Date lokal. */
export function parseISO(value: ISODate): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Mengubah objek Date menjadi string ISO (tanggal lokal). */
export function toISO(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True jika string benar-benar mewakili tanggal valid. */
export function isValidISO(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return false;
  const date = parseISO(value);
  return !Number.isNaN(date.getTime()) && toISO(date) === value;
}

/** Menambah hari kalender. */
export function addDays(value: ISODate, amount: number): ISODate {
  const date = parseISO(value);
  date.setDate(date.getDate() + amount);
  return toISO(date);
}

/** Selisih hari kalender (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const ms = parseISO(b).getTime() - parseISO(a).getTime();
  return Math.round(ms / 86400000);
}

/** Perbandingan urut: negatif jika a < b, 0 jika sama, positif jika a > b. */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minISO(...values: ISODate[]): ISODate {
  return values.reduce((acc, v) => (compareISO(v, acc) < 0 ? v : acc));
}

export function maxISO(...values: ISODate[]): ISODate {
  return values.reduce((acc, v) => (compareISO(v, acc) > 0 ? v : acc));
}

/** Nomor hari dalam seminggu: 0 = Minggu ... 6 = Sabtu. */
export function weekdayOf(value: ISODate): number {
  return parseISO(value).getDay();
}

/** Tanggal hari ini (lokal) dalam format ISO. */
export function todayISO(): ISODate {
  return toISO(new Date());
}

/** Daftar semua tanggal (kalender) dari start sampai end inclusive. */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  if (compareISO(start, end) > 0) return out;
  let cursor = start;
  while (compareISO(cursor, end) <= 0) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Format tanggal menjadi "12 Mei 2026". */
export function formatDateID(value: ISODate): string {
  if (!isValidISO(value)) return value ? String(value) : '-';
  const date = parseISO(value);
  return `${date.getDate()} ${MONTH_NAMES_ID[date.getMonth()]} ${date.getFullYear()}`;
}

/** Format pendek: "12 Mei" atau "12 Mei 2026" bila tahun berbeda dari tahun berjalan. */
export function formatDateShortID(value: ISODate, referenceYear?: number): string {
  if (!isValidISO(value)) return '-';
  const date = parseISO(value);
  const year = referenceYear ?? new Date().getFullYear();
  const suffix = date.getFullYear() !== year ? ` ${date.getFullYear()}` : '';
  return `${date.getDate()} ${MONTH_NAMES_ID[date.getMonth()].slice(0, 3)}${suffix}`;
}

export function formatDayNameID(value: ISODate): string {
  return DAY_NAMES_ID[weekdayOf(value)];
}

/** "3 hari" / "1 hari" — durasi dalam hari kalender. */
export function formatDays(count: number): string {
  return `${count} hari`;
}

/** Validasi bahwa start <= end. */
export function isRangeValid(start: ISODate, end: ISODate): boolean {
  return isValidISO(start) && isValidISO(end) && compareISO(start, end) <= 0;
}
