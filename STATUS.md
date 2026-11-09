# abang-gorengan-web — Status: PROTOTIPE (milestone 1)

## Apa ini
Game web 2D time-management: kamu abang gorengan di gerobak pinggir jalan. TypeScript + Vite 8 + Canvas 2D, tanpa engine dan tanpa file aset (semua gambar prosedural, suara sintetis). Main enak di HP portrait, bisa juga di desktop (stage portrait 400×760 di tengah, jalanan melebar ke samping).

Logika murni di `src/sim/` (`createDay` + `step(state, actions)`, tick tetap 60 Hz, RNG mulberry32 yang state-nya ikut di dalam state, tanpa DOM/`Math.random`). Render (`src/render/`), input (`src/input.ts`), suara (`src/audio.ts`) cuma membaca state dan event dari sim.

## Sudah ada
- Alur penuh: ambil adonan → celup tepung (yang ada titik biru) → wajan → angkat pas indikator hijau → peniris (netes 1,5 detik) → bungkus kertas/plastik (+cabe/saus) → serahkan ke pembeli
- Kontrol tap-tap dan drag (seret adonan lewat mangkuk tepung langsung ke wajan, seret bungkus ke pembeli, seret ke tong "Buang"). Shortcut keyboard opsional: `1`–`6`, `T`, `Q W E R`, `A`, `Z X`, `C V`, `7`–`0`, `J K L`, `M`, `P`
- Wajan 4 slot dengan indikator mentah → pas → gosong per gorengan. Kompor Kecil/Sedang/Besar. Suhu minyak naik-turun, turun waktu gorengan dingin masuk, dan bisa kepanasan di atas 205 °C (berasap, jendela "pas" menyempit, pembeli makin nggak sabar)
- 6 menu (bakwan, tahu isi, pisang goreng, tempe mendoan, cireng, combro), masing-masing dengan waktu matang dan jendela "pas" sendiri
- Pembeli antre di 4 tempat, dengan pesanan (item, kertas/plastik, cabe, saus) dan bar kesabaran. Telat = kabur. Salah bungkus = kesabarannya dipotong, plus komentar ("Cabenya mana?", "Plastik dong, bang!")
- Bayaran Rupiah + tip kalau cepat dan gorengannya kering/anget (ojol tipnya dobel). Reputasi ★ turun kalau ada yang gosong atau kabur, dan dibawa ke hari berikutnya
- Satu hari ±3 menit (06:00 → 17:00). Setelah tutup, yang masih antre tetap dilayani. Pembeli makin rame dan makin nggak sabar menjelang sore
- Level per hari: H1 bakwan/tahu/pisang, H2 +mendoan +ojol +plastik, H3 +cireng +pembeli rewel +saus, H4 +combro, lalu makin cepat. Ada setoran (target) per hari; kalau gagal, harinya diulang
- Menu (dengan demo bot main di belakang), intro tiap hari, jeda (otomatis saat tab disembunyikan), layar akhir hari (pendapatan, jualan/tip, puas/kabur, gosong, salah bungkus, reputasi). Rekor dan progres disimpan di localStorage
- Suara sintetis Web Audio: desis minyak (makin keras makin panas dan makin penuh wajannya) + letupan, ting saat matang, kresek bungkus, kerincing uang, pembeli kesal, klakson ojol "tin tin", alarm minyak kepanasan. Tombol 🔊 atau `M` buat mute. AudioContext baru dinyalakan di gesture pertama
- Petunjuk kontekstual di papan gerobak (lengkap di hari 1–2, setelah itu cuma peringatan)

## Tes
- `npm run verify`: 40 tes vitest + typecheck + build. Lulus 2026-11-05.
  - Sim: kematangan & gosong, kompor & kepanasan, slot wajan, peniris penuh, pesanan cocok/tidak, rewel, kapasitas bungkus, kesabaran & kabur, pendapatan/tip, kesulitan per hari, jam buka-tutup, determinisme (seed sama → hari identik, state lolos JSON di tengah hari)
  - Balancing pakai bot (`src/sim/bot.ts`): tap tiap 0,5 detik lulus hari 1–4, tap tiap 0,8 detik lulus hari 1 tapi gagal hari 4. Pemain yang diam saja gagal di hari 1
  - Hit-test layout dan ukuran target sentuh (≥44 unit)
- Browser pane (Chromium), desktop dan HP portrait 375×812: menu → hari 1 dimainkan pakai klik beneran (ambil, goreng, angkat, gosong dibuang, bungkus, serahkan, dapat tip) → sisa hari dipercepat pakai bot → ringkasan → hari 2. Drag adonan → tepung → wajan juga dicek. Tanpa error console di tab baru.
- Safari iOS (iPhone 17 simulator, 2026-11-05): halaman, font, HUD, dan layout portrait jalan. Sentuhan dicek untuk ambil adonan, celup tepung, goreng, angkat/buang gosong, dan kompor. Tampilan kepanasan dan gosong juga muncul. Tap beruntun yang cepat sempat hilang ditelan gesture Safari, sudah dibetulkan (`preventDefault` di touch event canvas).

## Gap
- Di iOS Simulator, langkah bungkus → serahkan belum berhasil dites lewat sentuhan: jeda antar-tap dari tool simulator ±3 detik game, jadi gorengan keburu gosong. Kodenya sama dengan jalur yang sudah lulus di Chromium, tapi tetap perlu dicoba di HP beneran
- Suara belum didengar manusia. Di iPhone, saklar silent ikut membisukan Web Audio
- Tuning feel belum dites manusia (jendela "pas", kecepatan antre, besarnya setoran). Angka balancing sekarang berasal dari bot
- Belum ada upgrade gerobak di antara hari (wajan lebih besar, kompor lebih bagus) dan belum ada musik
- Alat dev: `?debug` (log tap/aksi di layar) dan `?speed=0.3` (waktu diperlambat) cuma aktif di `npm run dev`
