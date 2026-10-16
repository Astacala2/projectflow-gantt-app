/**
 * Util ekspor CSV dan berkas.
 */

/** Mengubah matriks nilai menjadi teks CSV (dengan escaping standar). */
export function toCSV(rows: (string | number | null | undefined)[][], delimiter = ','): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? '' : String(cell);
          if (value.includes('"') || value.includes(delimiter) || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(delimiter),
    )
    .join('\n');
}

/** Mengunduh teks sebagai berkas di browser. */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([`﻿${content}`], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]): void {
  downloadTextFile(filename, toCSV(rows), 'text/csv;charset=utf-8');
}

/** Nama berkas aman dari nama proyek. */
export function safeFilename(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'berkas'
  );
}
