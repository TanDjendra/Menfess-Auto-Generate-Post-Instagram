# Auto-Menfess Instagram Bot

Bot menfess 24/7: pesan anonim masuk lewat form web → digambar jadi **kartu lucu (kawaii)** →
caption dibuat Gemini → diposting otomatis ke Instagram. Tiap kartu juga punya
**versi GIF animasi** untuk Instagram Story.

```
form web  ─→  Firebase RTDB (queue)  ─→  worker
                                          ├─ render kartu PNG 1080×1080
                                          ├─ render GIF animasi (loop mulus)
                                          ├─ caption Gemini
                                          └─ publish Instagram Graph API
```

## Tampilan kartu

Semua digambar dengan canvas (tanpa file gambar template), jadi ringan dan selalu tajam:

- 8 palet pastel: `strawberry-milk`, `mint-soda`, `lavender-dream`, `peach-sunset`,
  `blueberry-sky`, `matcha-latte`, `bubblegum-pop`, `cream-honey`
- header kartu: ikon surat bertangkai hati (semua ikon digambar sendiri, bukan emoji)
- 6 stiker: boba, awan pelangi, cupcake, surat cinta, bulan, bunga
- washi tape, border jahitan putus-putus, polkadot, awan bergerigi, hati & sparkle melayang
- **mood otomatis** dari isi pesan (cinta / sedih / kuliah / bahagia / makan / terima kasih / malam)
  menentukan palet + label kartu, lengkap dengan ikonnya sendiri (surat, buku, hati diplester, popper, mangkuk, tulip, bulan, sparkle)
- font imut bawaan (SIL OFL): Sniglet, Varela Round, Mali
- maskot hewan (beruang/kucing/kelinci/panda/kodok/anak ayam) tersedia tapi **default mati**;
  nyalakan dengan `CARD_MASCOT=true` kalau memang mau ada karakter di atas kartu

Emoji hanya dipakai kalau pengirim menulisnya sendiri di pesannya — semua ornamen kartu
digambar dengan path canvas, jadi tidak ada ikon "template" dan tampilannya sama di semua OS.

Animasi GIF: ikon surat mengambang & hatinya berdenyut, hati naik pelan, sparkle berkedip,
kilau menyapu kartu, background bernapas. Semua periodik, jadi loop-nya mulus.

> Catatan: Instagram Graph API **tidak menerima GIF** untuk post feed. Feed tetap pakai PNG;
> GIF-nya tersedia di `/media/...` dan di galeri web untuk dipakai manual di Story.

## Menjalankan

```bash
npm install
cp .env.example .env   # lalu isi kredensialmu
npm start
```

Buka `http://localhost:3000` untuk form kirim menfess + preview kartu langsung.

### Perintah lain

```bash
npm test                  # cek renderer, GIF, caption Gemini, dan kredensial IG
npm test -- --upload      # sekaligus tes upload gambar ke host publik
npm run samples           # render 1 kartu per tema ke temp/samples
npm run samples -- "teks menfess kamu"
```

## Endpoint

| Method | Path | Fungsi |
|--------|------|--------|
| GET | `/` | form kirim menfess + preview + galeri |
| POST | `/submit` | `{ "text": "..." }` → masuk antrian |
| GET/POST | `/api/preview?format=png\|gif&theme=&seed=` | render kartu langsung (tanpa menyimpan) |
| GET | `/api/gallery` | daftar kartu terbaru (PNG + GIF) |
| GET | `/api/themes` | daftar palet |
| GET | `/api/status` | status Firebase, Instagram, antrian, konfigurasi render |
| GET | `/health` | health check untuk Render/Railway |
| GET | `/media/<file>` | file kartu PNG/GIF |

## Konfigurasi penting

Semua opsi ada di [.env.example](.env.example). Yang paling berpengaruh:

- `PUBLIC_BASE_URL` — kalau diisi, Instagram menarik gambar langsung dari service ini
  (`/media/...`). Kalau kosong, gambar diupload dulu ke tmpfiles.org (berlaku ±60 menit).
- `DRY_RUN=true` — semua tetap dirender, tapi tidak diposting ke Instagram. Bagus untuk uji coba.
- `QUEUE_PATH` — pisahkan antrian staging dan produksi.
- `CARD_THEME` — pakai satu palet tetap (default: otomatis sesuai mood pesan).
- `CARD_MASCOT=true` — tampilkan maskot hewan di atas kartu (default ikon surat).
- `GIF_ENABLED`, `GIF_SIZE`, `GIF_FRAMES` — atur berat/ukuran GIF (480px × 20 frame ≈ 600 KB).
- `POST_INTERVAL_MS` — jarak minimum antar posting, biar tidak kena rate limit Instagram.

### Aturan Realtime Database

Supaya query antrian tidak memindai seluruh node, tambahkan index:

```json
{
  "rules": {
    "menfess_queue": {
      ".indexOn": "posted"
    }
  }
}
```

## Cara kerja antrian

1. `/submit` menulis `{ text, posted: false, status: "queued", createdAt }`.
2. Worker melihat item baru (`posted === false`), lalu **mengklaim** item lewat transaction
   Firebase (`posted → true`) sehingga dua instance tidak bisa memposting item yang sama.
3. Kartu PNG + GIF dirender, caption dibuat, gambar dipublikasikan, status ditulis balik:
   `theme`, `mascot`, `mood`, `imageFile`, `gifFile`, `caption`, `igPostId`, `postedAt`.
4. Kalau gagal: status `retrying` dengan backoff eksponensial (default 3 percobaan),
   lalu `failed` beserta `errorLog`.
5. File lama di `temp/` dan `temp/media/` dibersihkan otomatis setiap 30 menit.

## Struktur

```
src/
  server.js                  HTTP server + routing + rate limit
  queueListener.js           worker antrian (klaim, retry, throttle)
  config/firebase.js         inisialisasi Firebase (file JSON atau env string)
  public/index.html          form + preview langsung + galeri
  services/
    imageProcessor.js        render PNG & GIF, cleanup temp
    cardRenderer.js          layout kartu + adegan animasi (design space 1080×1080)
    kawaiiArt.js             kuas kawaii: hati, bintang, ikon mood, stiker, washi tape, maskot
    themes.js                palet, ikon mood, stiker, deteksi mood
    fonts.js                 registrasi font + fallback emoji (untuk teks pengirim)
    mediaStore.js            simpan/serve/prune kartu hasil render
    geminiService.js         caption Gemini + sanitasi + fallback offline
    instagramService.js      upload URL publik + publish Graph API
scripts/render-samples.js    render semua tema untuk dilihat cepat
assets/fonts/                font OFL (Sniglet, Varela Round, Mali, Noto Emoji)
```

## Troubleshooting

**`Error validating access token: Session has expired`** — token Instagram kedaluwarsa.
Buat ulang token lewat Meta Developers → Graph API Explorer, lalu tukar menjadi
long-lived token (berlaku ±60 hari) dan simpan di `IG_ACCESS_TOKEN`.

**Emoji jadi kotak kosong** — tidak ada font emoji sistem. Di Linux pasang
`fonts-noto-color-emoji`, atau taruh file emoji font di `assets/fonts/`.

**Teks terlalu panjang** — ukuran font menyusut otomatis; di atas batas kartu, teks
dipotong dengan `…`. Naikkan `MAX_TEXT_LENGTH` kalau mau pesan lebih panjang.

**GIF terlalu besar** — turunkan `GIF_SIZE` (mis. 400) atau `GIF_FRAMES` (mis. 14).

## Lisensi

Proyek ini dilindungi di bawah lisensi [MIT](LICENSE).

