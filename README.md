# ProjectFlow — Sistem Manajemen Proyek Pengembangan Website & Aplikasi

ProjectFlow adalah aplikasi web untuk merencanakan, menjadwalkan, dan memantau proyek pengembangan
perangkat lunak (mulai analisis kebutuhan hingga deployment). Aplikasi membantu manajer proyek
mengatur tugas & subtugas, ketergantungan pekerjaan, kalender kerja, anggota tim, pembagian beban
kerja, serta memantau perkembangan proyek melalui **Gantt Chart**, **PERT Chart**,
**Critical Path Analysis**, dan **Resource Chart**.

## Teknologi

| Komponen | Teknologi |
| --- | --- |
| UI | React 18 + TypeScript (strict) |
| Build tool | Vite 5 |
| Routing | React Router 6 (`HashRouter`) |
| Grafik dashboard | Recharts |
| Gantt / PERT / Resource Chart | Implementasi SVG+HTML dinamis buatan sendiri (lihat penjelasan di bawah) |
| Penyimpanan | `localStorage` (frontend-only, tanpa backend) |
| Pengujian | Vitest + Testing Library (jsdom) |

### Mengapa Gantt/PERT dibuat sendiri, bukan library pihak ketiga?

Spesifikasi fitur membutuhkan hubungan dependensi **FS dan SS dengan lag**, penandaan **jalur
kritis** hasil perhitungan CPM, sinkronisasi penuh dengan kalender kerja proyek, serta penghitungan
ulang otomatis saat data berubah. Library Gantt populer (frappe-gantt, dhtmlx-gantt versi gratis)
umumnya hanya mendukung FS tanpa lag, tidak mendukung SS, dan tidak bisa menandai jalur kritis dari
algoritma kita. Karena itu grafik dibangun dengan SVG yang benar-benar dinamis — setiap batang,
node, dan panah dihitung dari data aktual — sesuai opsi yang diizinkan spesifikasi. Recharts tetap
digunakan untuk grafik dashboard.

## Fitur utama (8 kelompok fitur wajib)

1. **Manajemen proyek & kalender kerja** — CRUD proyek; hari kerja per minggu yang dapat
   dikonfigurasi; hari libur khusus (tambah/ubah/hapus); kalender bulanan dengan jadwal tugas;
   seluruh durasi dihitung dalam **hari kerja** (akhir pekan & libur tidak dihitung).
2. **Manajemen tugas & subtugas** — CRUD + pencarian + filter (status/prioritas/anggota); struktur
   tugas induk–subtugas; prioritas & status sesuai spesifikasi; tanggal selesai dihitung dari
   kalender kerja.
3. **Task dependencies** — dependensi **FS** (Finish-to-Start) dan **SS** (Start-to-Start) dengan
   **lag hari kerja**; validasi: self-loop ditolak, lintas proyek ditolak, **siklus ditolak**, lag
   harus bulat ≥ 0, duplikat ditolak; jadwal selalu dihitung dari dependensi (bukan sekadar teks).
4. **Resource management** — CRUD anggota tim (peran, keahlian, tarif opsional, kapasitas harian,
   aktif/nonaktif), daftar tugas masing-masing anggota, serta ketidakhadiran (mulai, selesai,
   alasan) yang diperhitungkan pada beban kerja.
5. **Resource assignment** — penugasan multi-anggota ke tugas dengan **persentase alokasi kapasitas
   (0–100%)**; penugasan >100% pada periode sama ditandai sebagai potensi kelebihan beban; konflik
   dengan ketidakhadiran diberi **peringatan** (data tidak diubah/dihapus otomatis).
6. **Gantt Chart & PERT Chart** — Gantt dengan daftar tugas kiri + garis waktu kanan, skala
   harian/mingguan/bulanan, progres pada batang, panah dependensi, penanda kritis, detail saat
   batang diklik, scroll horizontal, serta **drag untuk menggeser jadwal dan resize untuk mengubah
   durasi** (divalidasi terhadap dependensi sebelum disimpan). PERT menampilkan node (nama, durasi,
   status, tanggal, indikator kritis) dan panah berlabel FS/SS + lag.
7. **Critical Path Analysis** — forward pass & backward pass menghasilkan ES/EF/LS/LF, Total Float,
   status kritis, durasi minimum proyek, dan perkiraan tanggal selesai; beberapa jalur kritis
   ditampilkan semuanya; tugas hampir kritis diberi peringatan; hasil valid terhadap siklus & data
   rusak (tidak menampilkan hasil palsu).
8. **Resource Chart** — baris anggota × sumbu waktu; blok penugasan mengikuti tanggal & alokasi
   aktual; ketidakhadiran tampil sebagai blok bergaris; hari dengan alokasi >100% ditandai; filter
   rentang tanggal & anggota; daftar anggota tanpa penugasan.

Plus: **Dashboard** (statistik aktual, grafik progres & distribusi status, tugas mendekati tenggat,
peringatan beban kerja), **Laporan** (3 bagian + **ekspor CSV** tugas/dependensi/beban kerja +
**cetak**), **Pengaturan** (ekspor/impor **JSON**, pemulihan data contoh, pengosongan data,
preferensi).

## Instalasi & menjalankan

```bash
npm install        # pasang dependensi
npm run dev        # jalankan di http://localhost:5173
```

Perintah lain:

```bash
npm run typecheck  # verifikasi tipe TypeScript (tsc --noEmit)
npm run test       # jalankan seluruh pengujian (Vitest, mode sekali jalan)
npm run test:watch # pengujian mode pantau
npm run build      # typecheck + build produksi ke folder dist/
npm run preview    # pratinjau hasil build
```

## Penyimpanan data (localStorage)

- Seluruh data (proyek, kalender, hari libur, tugas, dependensi, anggota, ketidakhadiran, penugasan,
  pengaturan) tersimpan pada kunci `projectflow.data` dengan **versi skema** untuk migrasi sederhana
  (`src/services/storage.ts`).
- Data contoh (studi kasus *Pengembangan Website Profil Organisasi Mahasiswa*) **hanya** dimuat
  ketika penyimpanan benar-benar kosong, atau saat pengguna memilih *"Pulihkan data contoh"*. Data
  pengguna tidak pernah ditimpa saat aplikasi dibuka.
- **Ekspor/Impor JSON** tersedia di halaman Pengaturan untuk pencadangan manual — localStorage
  memiliki batas ±5 MB per domain dan tidak tersinkron antar perangkat.
- **Nota keamanan:** localStorage hanya untuk data non-rahasia. Jangan menyimpan kata sandi di
  sini; aplikasi ini bukan sistem autentikasi multi-pengguna.
- Logika penyimpanan terpisah di `src/services/` sehingga dapat diganti dengan API/database tanpa
  mengubah komponen UI.

**Metode perhitungan progres proyek:** rata-rata terbobot progres tugas daun terhadap durasi hari
kerjanya — `(Σ progres × durasi) / Σ durasi`. Metode yang sama dipakai di seluruh halaman.

**Konvensi penjadwalan** (didokumentasikan agar hasil bisa direproduksi):
- `ES`/`EF` dalam satuan ordinal hari kerja kalender proyek; `EF = ES + durasi − 1`.
- `FS + lag L` → `ES_penerus ≥ EF_pendahulu + 1 + L` (penerus paling cepat mulai hari kerja
  berikutnya setelah pendahulu selesai, ditambah L hari kerja).
- `SS + lag L` → `ES_penerus ≥ ES_pendahulu + L`.
- `LS = LF − durasi + 1`; tugas tanpa penerus: `LF = finish proyek`; **kritis bila Total Float = 0**.
- Tanggal mulai milik pengguna dihormati selama tidak melanggar dependensi; bila melanggar, jadwal
  mengikuti aturan dependensi dan **peringatan konflik ditampilkan**.
- Tugas induk adalah agregasi subtugasnya (rentang dari anak; float = float terkecil anak) dan
  tidak dijadwalkan independen; dependensi pada tugas induk diterapkan ke seluruh subtugasnya.

## Struktur kode

```
src/
  types/          # tipe data terpusat (Task, Project, Dependency, Member, dst.)
  utils/          # logika murni: kalender kerja, engine jadwal, CPM, beban kerja,
                  # validasi, ekspor CSV, struktur pohon tugas, util tanggal
  services/       # lapisan data: localStorage + store + CRUD tervalidasi + data contoh
  hooks/          # hook React (useSyncExternalStore) untuk berlangganan data
  components/     # komponen UI bersama (sidebar, modal, form, toast, badge, dsb.)
  features/
    gantt/        # Gantt Chart interaktif
    pert/         # PERT Chart / Network Diagram
    resource-chart/ # Resource Chart (timeline beban kerja)
  pages/          # 11 halaman sesuai menu sidebar
  *.test.ts(x)    # pengujian unit & komponen
```

## Pengujian

`npm run test` menjalankan 85 pengujian yang mencakup, di antaranya:

- CRUD proyek/tugas/subtugas & kaskade penghapusan pada lapisan data.
- Perhitungan durasi berbasis kalender kerja: akhir pekan, hari libur, kalender 6 hari kerja.
- Dependensi FS & SS dengan lag nol dan lag positif; penolakan siklus; koreksi tanggal yang
  melanggar dependensi; perubahan jadwal pendahulu yang memperbarui penerus.
- Algoritma CPM pada jaringan berhasil diketahui (durasi 13 hari kerja; jalur kritis A→C→D;
  float B=2, E=4; backward pass LS/LF) dan deteksi beberapa jalur kritis.
- Deteksi kelebihan beban (50%+60%=110%), konflik ketidakhadiran, anggota nonaktif, anggota tanpa
  penugasan, dan estimasi biaya.
- Tampilan Gantt (batang, panah dependensi, penanda kritis, pembaruan saat data berubah), PERT
  (jumlah node/panah, label FS/SS + lag, penanda kritis), Resource Chart (blok penugasan, blok
  ketidakhadiran), dan pembaruan dashboard saat data berubah.
- Persistensi localStorage setelah "refresh", ekspor/impor JSON, penolakan backup tidak valid,
  serta pemulihan data contoh.

## Batasan versi ini

- Tanpa backend: data hanya ada di localStorage browser tempat aplikasi dibuka.
- Drag-and-drop Gantt menggeser tanggal mulai/ubah durasi (dengan snap ke hari kerja dan validasi
  dependensi); pengeditan jadwal yang lebih presisi tetap direkomendasikan lewat formulir tugas.
- Estimasi biaya (dari tarif anggota) bersifat informasional, bukan penggajian.
- Bundle >500 kB setelah minify karena Recharts; untuk produksi sebaiknya code-splitting
  ditambahkan bila dibutuhkan.
