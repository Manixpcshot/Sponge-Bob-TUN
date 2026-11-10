# Sponge bob tun (باب اسفنجی) 🧽🟣🟡

<div align="center">

**Bilingual (Persian / English) Windows Desktop VLESS Proxy Client — Available in both Electron and Rust + Tauri v2 Editions (Setup & Zero-Install Portable)**

**کلاینت دسکتاپ ویندوز VLESS با ظاهر انیمیشنی باب‌اسفنجی، دو زبان فارسی و انگلیسی، پروکسی محلی Xray (بدون TUN و Wintun) — ارائه شده در دو نسخه Electron و Rust/Tauri (نصبی و پرتابل بدون نیاز به نصب)**

[English Documentation](#-english) • [راهنمای فارسی](#-فارسی) • [Releases](https://github.com/Manixpcshot/Sponge-Bob-TUN/releases)

</div>

---

## 🌍 English

### 🧭 Which Edition Should I Download?
All editions share the exact same React UI, animations, themes, security guarantees, and Xray-core local proxy behavior:

| Artifact | Engine | Type | Highlights |
|---|---|---|---|
| `Sponge-bob-tun-Tauri-Portable-<ver>.exe` | **Rust + Tauri v2** | **Single-file Portable** | Zero install, tiny memory footprint (~40 MB RAM), embeds SHA-256-verified `xray.exe`, stores encrypted vault in `SpongeBobTUN-Data/` |
| `Sponge-bob-tun-Tauri-Portable-<ver>-win-x64.zip` | **Rust + Tauri v2** | **Portable ZIP** | Extract anywhere & run with `SpongeBobTUN-Data/` portable storage |
| `Sponge-bob-tun-Tauri-Setup-<ver>.exe` | **Rust + Tauri v2** | **NSIS Installer** | Fast lightweight native Windows installer using WebView2 |
| `Sponge-bob-tun-Electron-Portable-<ver>.exe` | **Electron** | **Single-file Portable** | Zero install, self-contained Chromium runtime, stores vault in `SpongeBobTUN-Data/` |
| `Sponge-bob-tun-Electron-Portable-<ver>-win-x64.zip` | **Electron** | **Portable ZIP** | Extract anywhere & run cleanly without registry installer entries |
| `Sponge-bob-tun-Setup-<ver>.exe` | **Electron** | **NSIS Installer** | Full desktop installer with `electron-updater` silent auto-updates |

### ✨ Features
- **Local Xray Proxy Only (No TUN / No Wintun):** Runs `xray.exe` strictly as local **SOCKS5 (`127.0.0.1:10808`)** & **HTTP (`127.0.0.1:10809`)** proxies with automatic Windows Registry + WinINet System Proxy management and crash-safe restoration — no Wintun drivers or Administrator UAC required.
- **Zero-Setup Portable Architecture:** Portable `.exe` and `.zip` builds keep your encrypted vault (`vault.sbx`), crash-safe proxy backup (`proxy-backup.json`), and runtime cache cleanly in `SpongeBobTUN-Data/` alongside the executable (falling back automatically to `%APPDATA%` on read-only media), skip missing `app-update.yml` crashes cleanly, and support portable single-file self-updating from GitHub Releases.
- **VLESS Subscription & Base64 Decoding:** Fetches TXT/Base64/Double-Base64 subscriptions, parses `vless://` nodes (TCP, Reality, Vision, WebSocket, gRPC, HTTPUpgrade, XHTTP, TLS), and reads `subscription-userinfo` quota & expiry headers.
- **`.npvs` & Password-Protected Configs:** Supports importing `.npvs` / `.txt` / `.json` files (drag-and-drop or file picker), decrypting password-protected `.npvs` files (`sponge-npvs-v1` PBKDF2+AES-256-GCM and OpenSSL/CryptoJS `Salted__`), and exporting password-encrypted `.npvs` backups.
- **Auto / Best Server Mode & Smart Fallback:** Periodically probes latencies in the background, includes an **Auto** option at the top of the server list that always picks the fastest healthy server, and automatically fails over to the next fastest server after `N` consecutive health-check failures.
- **Live Bandwidth Graph & Session Usage:** Queries Xray's built-in gRPC `StatsService` over local HTTP/2 every second to plot real-time Upload/Download curves and session byte counters.
- **Mr. Krabs Quota Guard Alerts:** Tracks consumed data and remaining days from `subscription-userinfo`, firing in-app toasts and Windows OS Tray notifications when usage reaches **≥ 80%** or **< 3 days** remain.
- **Pinned Favorites & SVG Country Flags:** Star servers to keep them pinned on top, filter by crisp SVG country flag chips (rendered cleanly on Windows 10/11), and search nodes instantly.
- **Dual Animated Themes & Bilingual UI:**
  - **Obsidian Dark** (sleek black with SpongeBob yellow & jellyfish purple accents — default)
  - **SpongeBob Yellow & Purple** (vibrant Bikini Bottom palette)
  - Full **Persian (RTL)** and **English (LTR)** switcher, custom SpongeBob & Mr. Krabs animations (plus custom mascot image upload in Settings), and **Minimize / Maximize / Fullscreen / Close buttons pinned strictly on the right side**.
- **Privacy & Security First:**
  - Encrypted vault storage via Windows DPAPI (`CryptProtectData` / Electron `safeStorage`) with AES-256-GCM fallback.
  - Ephemeral Xray configuration streamed over `stdin` (`xray run -c stdin: -format json`) — never written in plaintext to disk.
  - Strict log sanitizer redacting subscription URLs, `vless://` links, UUIDs, server IPs, Reality keys, and tokens from every log entry.
- **GitHub Auto-Update on Launch:** Automatically checks GitHub Releases on startup, downloads the matching Setup or Portable update (verified via PE header checks), cleanly tears down proxy settings & Xray, and relaunches the updated version automatically.

### 🚀 Development & Build

```bash
# 1. Install dependencies
npm install

# 2. Download official Xray-core binary for your OS (SHA-256 verified)
npm run xray:download

# 3. Run typecheck, JS tests, Rust tests & frontend build
npm run typecheck
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run build

# 4. Build Electron (NSIS + Portable EXE + Portable ZIP)
npm run dist:win

# 5. Build Rust + Tauri v2 (NSIS or single-file embedded Portable EXE)
npm run build:tauri
npx tauri build --no-bundle --features embed-xray
```

### 📦 Releases & Auto-Update Workflow
Every release tagged `vX.Y.Z` or published in GitHub Releases triggers `.github/workflows/release.yml` on `windows-latest` to run JS + Rust test suites, bundle SHA-256-verified `xray.exe`, verify every generated PE executable, and publish all Electron & Rust/Tauri Setup + Portable artifacts.

---

## 🇮🇷 فارسی

### 🧭 کدام نسخه را دانلود کنم؟
هر دو نسخه **Rust + Tauri v2** (بسیار سبک، سریع و کم‌مصرف) و **Electron** رابط کاربری یکسان، انیمیشن‌ها، دو تم، زبان فارسی/انگلیسی و امنیت کامل را ارائه می‌دهند:

- **`Sponge-bob-tun-Tauri-Portable-<ver>.exe` (پیشنهادی پرتابل تک‌فایل Rust/Tauri):** بدون نیاز به نصب، مصرف رم بسیار پایین، هسته `xray.exe` به‌صورت فشرده و امن داخل خود فایل، ذخیره اطلاعات رمزنگاری‌شده در پوشه `SpongeBobTUN-Data` کنار برنامه.
- **`Sponge-bob-tun-Tauri-Portable-<ver>-win-x64.zip` (پرتابل زیپ Rust/Tauri):** اکسترکت و اجرا در هر مسیر یا فلش مموری.
- **`Sponge-bob-tun-Tauri-Setup-<ver>.exe` (نصبی سبک Rust/Tauri):** نصب‌کننده استاندارد و سریع ویندوز.
- **`Sponge-bob-tun-Electron-Portable-<ver>.exe` و `.zip` (پرتابل Electron):** نسخه پرتابل بدون نیاز به نصب و بدون خطای `app-update.yml`.
- **`Sponge-bob-tun-Setup-<ver>.exe` (نصبی Electron):** نصب‌کننده کامل همراه با آپدیت خودکار.

### ✨ امکانات برنامه
- **پروکسی محلی Xray بدون TUN و Wintun:** هسته `xray.exe` فقط در حالت پروکسی محلی (**SOCKS5** و **HTTP**) اجرا می‌شود؛ بدون نیاز به درایور Wintun یا دسترسی ادمین، همراه با تنظیم خودکار و امن پروکسی سیستم ویندوز و بازگردانی خودکار هنگام قطع اتصال یا خروج.
- **حالت پرتابل واقعی و بدون خطا:** ذخیره امن تنظیمات، کلیدها و فایل بکاپ پروکسی در پوشه `SpongeBobTUN-Data` کنار فایل اجرایی (با بازگشت خودکار به `%APPDATA%` در مسیرهای فقط-خواندنی)، بررسی بدون خطای آپدیت گیت‌هاب، و خروج تمیز بدون باقی ماندن پنجره کنسول یا پروکسی سیستم.
- **دریافت اشتراک و رمزگشایی Base64:** دریافت لینک اشتراک TXT، بازگشایی Base64 و استخراج خودکار کانفیگ‌های **VLESS** (با پشتیبانی از Reality، Vision، WS، gRPC، HTTPUpgrade، XHTTP و TLS).
- **خواندن فایل‌های `.npvs` و فایل‌های رمزدار:** پشتیبانی از باز کردن و رهاکردن (Drag & Drop) فایل‌های `.npvs` / `.txt`، پنجره ورود رمز عبور برای فایل‌ها و لینک‌های رمزنگاری‌شده، و خروجی گرفتن به‌صورت `.npvs` رمزدار.
- **حالت خودکار (بهترین سرور) + سوئیچ هوشمند:** تست تأخیر دوره‌ای در پس‌زمینه، گزینه **خودکار** در بالای لیست سرورها برای اتصال همیشگی به سریع‌ترین سرور سالم، و سوئیچ خودکار به سرور بعدی پس از `N` خطای پیاپی.
- **نمودار زنده پهنای باند:** اتصال مستقیم به Stats API داخلی Xray (gRPC روی HTTP/2) و رسم نمودار زنده سرعت آپلود و دانلود به‌همراه شمارنده حجم مصرف‌شده هر نشست.
- **نگهبان سهمیه آقای خرچنگ:** نمایش درصد مصرف و روزهای باقی‌مانده از روی `subscription-userinfo`؛ با رد شدن مصرف از **۸۰٪** یا باقی ماندن **کمتر از ۳ روز** تا انقضا، توست و اعلان سیستمی (Tray Notification) ارسال می‌شود.
- **پین سرورها و فیلتر پرچم کشورها:** ستاره‌دار کردن سرورهای محبوب در بالای لیست، پرچم SVG باکیفیت برای کشورها در ویندوز و چیپ‌های فیلتر کشور (🇩🇪، 🇹🇷، 🇳🇱 و ...).
- **ظاهر مدرن باب‌اسفنجی با دو تم و دکمه‌های سمت راست:**
  - **تم مشکی (پیش‌فرض)** با ترکیب شیک زرد و بنفش باب‌اسفنجی
  - **تم زرد و بنفش کامل باب‌اسفنجی**
  - کاراکترهای انیمیشنی باب‌اسفنجی و آقای خرچنگ (با امکان آپلود تصویر دلخواه در تنظیمات)
  - تغییر زبان آنی بین **فارسی (RTL)** و **انگلیسی (LTR)**
  - دکمه‌های **مینیمایز، بزرگ‌نمایی/فول‌اسکرین و بستن همیشه در سمت راست** نوار عنوان.
- **امنیت و حفظ حریم خصوصی:**
  - ذخیره رمزنگاری‌شده لینک اشتراک و اطلاعات سرورها با **Windows DPAPI** (`CryptProtectData` / `safeStorage`) و رمزنگاری AES-256-GCM.
  - ارسال کانفیگ به Xray فقط از طریق `stdin` بدون ساخت فایل متنی روی دیسک.
  - فیلتر سخت‌گیرانه لاگ‌ها؛ هیچ لینک اشتراک، UUID، آی‌پی یا کلیدی هرگز در لاگ نمایش داده نمی‌شود.
- **آپدیت خودکار گیت‌هاب هنگام اجرا:** بررسی خودکار GitHub Releases در هنگام باز شدن برنامه؛ در صورت انتشار نسخه جدید، نسخه متناسب (نصبی یا پرتابل) دانلود شده، پروکسی و هسته به‌شکل امن بسته می‌شوند و نسخه جدید جایگزین و اجرا می‌شود.

---

## 📄 License
Open-source under the [MIT License](./LICENSE).
