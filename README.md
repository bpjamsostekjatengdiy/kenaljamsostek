# Pemahaman JDIY

Aplikasi web statis untuk belajar bersama dan melihat pemahaman program dari butir pilihan ganda yang disimpan di spreadsheet publik.

Spreadsheet publik default sudah disambungkan ke aplikasi.
Peserta memilih sesi `Absensi` atau `Feedback`, lalu aplikasi memuat bahan sesuai tema aktif dari kolom `nama_modul`.
Timer mulai saat peserta masuk ke Bagian 2 dan berhenti saat ringkasan akhir tampil.
Aplikasi mengambil 10 butir per sesi, memilihnya secara acak dengan proporsi seimbang per `PROGRAM`, lalu mengacak urutan butir dan opsi setiap sesi.
Setelah butir terakhir, peserta melihat halaman konfirmasi sebelum menekan `Kirim Refleksi`.

## Format Spreadsheet

Publikasikan spreadsheet sebagai CSV, atau gunakan link Google Sheets publik. Baris pertama harus berisi header:

```csv
pertanyaan,opsi_a,opsi_b,opsi_c,opsi_d,kunci
Apa tujuan utama program?,Sosialisasi,Peningkatan pemahaman,Arsip,Distribusi dokumen,B
```

Kolom `opsi_e` boleh ditambahkan bila membutuhkan lima pilihan.
Kolom tambahan seperti `nama_modul`, `program`, `pembahasan`, dan `status` akan dipakai bila tersedia.
Kolom `nama_modul` dipakai untuk membuat daftar tema harian.

## Merekam Refleksi ke Spreadsheet

1. Buka spreadsheet bahan pemahaman.
2. Tambahkan sheet baru bernama `jawaban`.
3. Buka `Extensions > Apps Script`.
4. Tempel isi file `apps-script-jawaban.gs`.
5. Deploy sebagai Web App dengan akses `Anyone`.
6. Salin URL Web App ke konstanta `RESPONSE_ENDPOINT_URL` di `app.js`.

Kolom hasil mencakup lama pengerjaan dalam detik, teks durasi, waktu mulai, dan waktu selesai.

## Menjalankan Lokal

Karena aplikasi mengambil data dari URL spreadsheet, jalankan dari server lokal:

```bash
python -m http.server 5173
```

Lalu buka `http://localhost:5173`.
