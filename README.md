# Auto-Menfess Instagram Bot 💌✨

Bot Menfess Otomatis 24/7: Pengunjung mengirim pesan anonim melalui Web Form ➔ Sistem merender **Kartu Kawaii (PNG 1080×1080)** & **GIF Animasi (Story)** ➔ Gemini AI membuatkan caption lucu ➔ Otomatis di-post ke Feed & Story Instagram via Instagram Graph API.

---

## ⚙️ Cara Kerja Aplikasi Lengkap

Aplikasi ini dirancang dengan arsitektur hybrid yang mendukung **Serverless (Vercel)** dan **Server 24/7 (Node.js / Docker / VPS)**.

```mermaid
flowchart TD
    A[User Submit Menfess] --> B[Web Form /submit]
    B --> C[(Firebase Realtime Database)]
    C --> D{Mode Server}
    
    D -- Serverless / Vercel --E[Trigger Direct Processing /submit]
    D -- Node.js Server 24/7 -- F[Queue Listener Listener]
    
    E --> G[1. Render Canvas Card PNG]
    F --> G
    
    G --> H[2. Render Animated GIF 20-FPS]
    H --> I[3. Generate Gemini AI Caption]
    I --> J[4. Upload Image to Public Host]
    
    J -- Imgur / Freeimage -- K[Direct Image URL]
    K --> L[5. Instagram Graph API /media]
    L --> M[Instagram Media Container Created]
    M --> N[6. Publish Container /media_publish]
    N --> O[Update Firebase Status: success]
```

### 🔁 Detail 6 Tahap Pemrosesan:

#### 1. Pengiriman Pesan (Web Form & Preview)
- Pengunjung membuka web menfess, memilih tema/palet warna, dan mengetik pesan.
- Web menyediakan fitur **Live Preview Realtime** melalui API `/api/preview` tanpa menyimpan ke database.
- Saat tombol **Kirim** ditekan, data dikirim ke endpoint `/submit` dan disimpan ke **Firebase Realtime Database** di bawah node `/menfess_queue` dengan status `queued`.

#### 2. Antrean Realtime & Klaim Kunci (Queue Locking)
- **Mode 24/7 Server (Node.js)**: Worker mendengarkan event Firebase (`posted === false`).
- **Mode Serverless (Vercel)**: `/submit` langsung memicu fungsi `processSingleJob` secara instan sebelum merespons client.
- Untuk mencegah double-post dari multiple instance, worker melakukan transaksi atomic locking pada node Firebase (`status: "processing"`, `posted: true`).

#### 3. Machine-Rendering Kartu (Canvas 2D & GIF Engine)
- **PNG Card (1080×1080px)**: Digambar secara dinamis menggunakan `@napi-rs/canvas` tanpa gambar template eksternal. 
  - **Mood Detection**: AI/Heuristic menganalisis isi pesan (cinta, galau, kuliah, dll) untuk memilih palet warna dan ornamen pendukung.
  - **Kawaii Vector Elements**: Menambahkan ornamen awan, bintang, washi tape, border jahitan, dan ikon mood.
  - **Typography Auto-fit**: Teks pengirim disesuaikan ukurannya secara otomatis agar tidak meluap dari kartu.
- **GIF Animasi (480px / 20 FPS)**: Digambar frame-by-frame untuk menghasilkan efek animasi bernapas, kilau *sparkle*, dan jantung berdenyut yang siap dipakai di Instagram Story.

#### 4. Pembuatan Caption Otomatis (Gemini AI)
- Teks pengirim diproses oleh Google Gemini AI (`gemini-3.5-flash` dengan fallback `gemini-2.5-flash` / `gemini-2.0-flash`).
- Gemini menghasilkan caption yang relevan, ramah, dan lucu dilengkapi dengan hashtag otomatis.

#### 5. Public Media Hosting (Imgur & Freeimage)
- Instagram Graph API memerlukan **Direct Image URL** (URL publik langsung bersuffiks `.png`/`.jpg`).
- Sistem secara otomatis meng-upload kartu PNG yang sudah dirender ke **Imgur API** (fallback **FreeImage.host**) untuk mendapatkan URL publik sementara yang valid.
- Jika `PUBLIC_BASE_URL` diisi (pada server tersendiri), gambar disajikan langsung melalui endpoint `/media/<filename>`.

#### 6. Posting ke Instagram Graph API
- **Container Creation**: Mengirimkan Direct Image URL & Caption ke Instagram Graph API (`POST /{ig-user-id}/media`).
- **Status Polling**: Menunggu Instagram selesai memproses ingest media (`FINISHED`).
- **Publish**: Menerbitkan media ke Feed Instagram (`POST /{ig-user-id}/media_publish`).
- **Update Database**: Mengubah status item di Firebase menjadi `success` beserta `igPostId` dan waktu terbit.

---

## 🎨 Fitur Utama

- 🎨 **8 Palet Warna Pastel Kawaii**: `strawberry-milk`, `mint-soda`, `lavender-dream`, `peach-sunset`, `blueberry-sky`, `matcha-latte`, `bubblegum-pop`, `cream-honey`.
- 🤖 **Gemini AI Caption Engine**: Dibuat otomatis sesuai isi menfess.
- 🎬 **Generator GIF Story**: Animasi halus 20 FPS untuk Instagram Story.
- 📱 **Multi-Host Upload Fallback**: Imgur & FreeImage host terintegrasi.
- ⚡ **Support Serverless & 24/7 Worker**: Siap di-deploy ke Vercel, Render, Docker, atau VPS.

---

## 🚀 Cara Menjalankan Secara Lokal

### 1. Instalasi
```bash
git clone https://github.com/TanDjendra/Menfess-Auto-Generate-Post-Instagram.git
cd Menfess-Auto-Generate-Post-Instagram
npm install
```

### 2. Konfigurasi Environment (`.env`)
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Isi variabel berikut:
```env
FIREBASE_DATABASE_URL=https://database-kamu.firebaseio.com
FIREBASE_CREDENTIALS={"type":"service_account",...}
IG_USER_ID=178414xxxxxxxxxx
IG_ACCESS_TOKEN=EAAxxxxxxxxx
GEMINI_API_KEY=AIzaSyxxxxxxxxx
```

### 3. Jalankan Aplikasi
```bash
npm start
```
Buka browser di **`http://localhost:3005`** untuk membuka form menfess dan live preview.

---

## 🛠️ API Endpoints

| Method | Path | Deskripsi |
|--------|------|-----------|
| `GET` | `/` | Web Form Menfess, Live Preview, & Galeri Hasil Render |
| `POST` | `/submit` | Mengirim menfess baru ke antrean |
| `GET` / `POST` | `/api/preview` | Merender preview kartu PNG/GIF tanpa menyimpan |
| `GET` | `/api/status` | Mengecek koneksi Firebase, token Instagram, & antrean |
| `GET` | `/api/gallery` | Mengambil daftar hasil render terbaru |
| `GET` | `/health` | Endpoint health check |

---

## ❓ Troubleshooting

- **`OAuthException Code 190` (Session Expired)**: Token Instagram kedaluwarsa. Perbarui `IG_ACCESS_TOKEN` dari Meta Graph API Explorer & perpanjang via Access Token Debugger (60 hari).
- **`Format Gambar Tidak Diketahui`**: Instagram menolak URL hosting gambar yang berbentuk HTML redirect. Aplikasi ini sudah dilengkapi pemutus otomatis ke Imgur direct URL.
- **`EADDRINUSE 3005`**: Port 3005 sedang digunakan oleh proses Node.js lain. Hentikan proses lama dengan `Stop-Process -Name node -Force` (PowerShell) atau `pkill node` (Linux).

---

## 📄 Lisensi

Proyek ini dilindungi di bawah lisensi [MIT](LICENSE).
