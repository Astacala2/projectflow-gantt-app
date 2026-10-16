import { useRef, useState } from 'react';
import { db, useAction, useAppData } from '../hooks/useAppData';
import { ConfirmDialog } from '../components/Modal';
import { SectionCard } from '../components/ui';
import { downloadTextFile } from '../utils/csv';
import { STORAGE_KEY } from '../services/storage';

/** Halaman pengaturan: preferensi aplikasi dan pengelolaan data localStorage. */
export function SettingsPage() {
  const data = useAppData();
  const runAction = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmSample, setConfirmSample] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [pendingImport, setPendingImport] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<string>(() => estimateSize());

  function estimateSize(): string {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return '0 KB';
      return `${(raw.length / 1024).toFixed(1)} KB`;
    } catch {
      return 'tidak tersedia';
    }
  }

  const onImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImport(String(reader.result ?? ''));
      setConfirmImport(true);
    };
    reader.readAsText(file);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Pengaturan</h1>
          <p>Preferensi aplikasi dan pengelolaan data proyek tersimpan di localStorage browser.</p>
        </div>
      </div>

      <div className="settings-grid">
        <SectionCard title="Preferensi tampilan &amp; perhitungan">
          <div className="setting-row">
            <div>
              <strong>Perhitungan estimasi biaya sumber daya</strong>
              <p className="text-muted small">
                Mengaktifkan estimasi biaya dari tarif anggota. Ini bukan sistem penggajian otomatis.
              </p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={data.settings.costCalculationEnabled}
                onChange={(event) => runAction(
                  () => db.setCostCalculationEnabled(event.target.checked),
                  'Pengaturan biaya diperbarui.',
                )}
              />
              <span className="slider" />
            </label>
          </div>
          <div className="setting-row">
            <div>
              <strong>Skala waktu default Gantt Chart</strong>
              <p className="text-muted small">Dapat diubah sewaktu-waktu pada halaman Gantt Chart.</p>
            </div>
            <select
              value={data.settings.ganttScale}
              onChange={(event) => db.setGanttScale(event.target.value as 'hari' | 'minggu' | 'bulan')}
              aria-label="Skala waktu default Gantt"
            >
              <option value="hari">Harian</option>
              <option value="minggu">Mingguan</option>
              <option value="bulan">Bulanan</option>
            </select>
          </div>
        </SectionCard>

        <SectionCard
          title="Pencadangan &amp; pemulihan data"
          subtitle="Ekspor seluruh data (proyek, tugas, dependensi, anggota, penugasan, kalender) sebagai berkas JSON."
        >
          <div className="button-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                downloadTextFile(
                  `projectflow-backup-${new Date().toISOString().slice(0, 10)}.json`,
                  db.exportToJSON(),
                  'application/json',
                );
              }}
            >
              Ekspor JSON
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              Impor JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImportFile(file);
                event.target.value = '';
              }}
            />
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmSample(true)}>
              Pulihkan data contoh
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setConfirmClear(true)}>
              Kosongkan semua data
            </button>
          </div>
          <p className="text-muted small">
            Data tersimpan pada kunci <code>{STORAGE_KEY}</code> dengan ukuran saat ini {storageInfo} dan versi skema{' '}
            {data.schemaVersion}. Muat ulang halaman untuk memastikan data tetap tersimpan.
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => setStorageInfo(estimateSize())}>
            Perbarui ukuran data
          </button>
        </SectionCard>

        <SectionCard title="Batasan penyimpanan localStorage">
          <ul className="summary-list">
            <li>
              <span>Kapasitas browser biasanya sekitar 5 MB per domain; proyek sangat besar dapat mencapai batas ini.</span>
            </li>
            <li>
              <span>Data hanya tersedia pada peramban &amp; perangkat tempat aplikasi dibuka (tidak sinkron antar perangkat).</span>
            </li>
            <li>
              <span>Membersihkan data peramban akan menghapus seluruh proyek — gunakan Ekspor JSON secara berkala.</span>
            </li>
            <li>
              <span>
                Jangan menyimpan kata sandi atau data rahasia di localStorage; aplikasi ini bukan sistem autentikasi
                multi-pengguna.
              </span>
            </li>
          </ul>
        </SectionCard>
      </div>

      <ConfirmDialog
        open={confirmSample}
        title="Pulihkan data contoh?"
        message="Seluruh data proyek saat ini akan diganti dengan data contoh studi kasus (Pengembangan Website Profil Organisasi Mahasiswa). Sebaiknya ekspor JSON terlebih dahulu."
        confirmLabel="Pulihkan contoh"
        danger={false}
        onConfirm={() => {
          const result = runAction(() => db.resetToSampleData(), 'Data contoh berhasil dipulihkan.');
          if (result.ok) setConfirmSample(false);
        }}
        onCancel={() => setConfirmSample(false)}
      />
      <ConfirmDialog
        open={confirmClear}
        title="Kosongkan semua data?"
        message="Seluruh proyek, tugas, dependensi, anggota, penugasan, dan hari libur akan dihapus permanen. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Kosongkan"
        onConfirm={() => {
          const result = runAction(() => db.clearAllData(), 'Seluruh data dikosongkan.');
          if (result.ok) setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
      <ConfirmDialog
        open={confirmImport}
        title="Impor berkas backup?"
        message="Data saat ini akan diganti dengan isi berkas backup yang dipilih."
        confirmLabel="Impor sekarang"
        danger={false}
        onConfirm={() => {
          if (!pendingImport) return;
          const result = runAction(() => db.importFromJSON(pendingImport), 'Data backup berhasil diimpor.');
          if (result.ok) {
            setConfirmImport(false);
            setPendingImport(null);
          }
        }}
        onCancel={() => {
          setConfirmImport(false);
          setPendingImport(null);
        }}
      />
    </div>
  );
}
