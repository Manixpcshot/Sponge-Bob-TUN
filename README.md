# Sponge bob tun (باب اسفنجی) 🧽🟣🟡

<div align="center">

**Bilingual (Persian / English) Windows Desktop VLESS Proxy Client built with Electron, React, TypeScript & Xray-core**

**کلاینت دسکتاپ ویندوز VLESS با ظاهر انیمیشنی باب‌اسفنجی، زبان فارسی و انگلیسی، پروکسی محلی Xray (بدون TUN و Wintun)**

[English Documentation](#-english) • [راهنمای فارسی](#-فارسی) • [Releases](https://github.com/Manixpcshot/Sponge-Bob-TUN/releases)

</div>

---

## 🌍 English

### ✨ Features
- **Local Xray Proxy Only (No TUN / No Wintun):** Runs `xray.exe` cleanly as local **SOCKS5 (`127.0.0.1:10808`)** & **HTTP (`127.0.0.1:10809`)** proxies with automatic Windows System Proxy management and crash-safe restoration — no Wintun drivers or Administrator UAC required.
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
  - Encrypted vault storage via Electron `safeStorage` (Windows DPAPI) with AES-256-GCM fallback.
  - Ephemeral Xray configuration streamed over `stdin` (`xray run -c stdin: -format json`) — never written in plaintext to disk.
  - Strict log sanitizer redacting subscription URLs, `vless://` links, UUIDs, server IPs, Reality keys, and tokens from every log entry.
- **GitHub Auto-Update on Launch:** Automatically checks GitHub Releases via `electron-updater` on startup, downloads the new release, cleanly tears down proxy settings, closes, and relaunches the updated version automatically.

### 🚀 Development & Build

```bash
# 1. Install dependencies
npm install

# 2. Download official Xray-core binary for your OS (SHA-256 verified)
npm run xray:download

# 3. Run typecheck, tests & production build
npm run typecheck
npm test
npm run build

# 4. Build Windows NSIS installer + Portable zip + latest.yml
npm run dist:win
```

### 📦 Releases & Auto-Update Workflow
Every release tagged `vX.Y.Z` or published in GitHub Releases automatically triggers `.github/workflows/release.yml` on `windows-latest` to bundle `xray.exe` and publish `Sponge-bob-tun-Setup-<version>.exe`, `.blockmap`, `latest.yml`, and portable `.zip`.

---

## 🇮🇷 فارسی

### ✨ امکانات برنامه
- **پروکسی محلی Xray بدون TUN و Wintun:** هسته `xray.exe` فقط در حالت پروکسی محلی (**SOCKS5** و **HTTP**) اجرا می‌شود؛ بدون نیاز به درایور Wintun یا دسترسی ادمین، همراه با تنظیم خودکار و امن پروکسی سیستم ویندوز و بازگردانی خودکار هنگام قطع اتصال یا خروج.
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
  - ذخیره رمزنگاری‌شده لینک اشتراک و اطلاعات سرورها با `safeStorage` (DPAPI ویندوز)
  - ارسال کانفیگ به Xray فقط از طریق `stdin` بدون ساخت فایل متنی روی دیسک
  - فیلتر سخت‌گیرانه لاگ‌ها؛ هیچ لینک اشتراک، UUID، آی‌پی یا کلیدی هرگز در لاگ نمایش داده نمی‌شود.
- **آپدیت خودکار گیت‌هاب هنگام اجرا:** بررسی خودکار GitHub Releases در هنگام باز شدن برنامه؛ در صورت انتشار نسخه جدید، به‌صورت خودکار دانلود شده، برنامه یک‌بار بسته شده، نصب و مجدداً اجرا می‌شود.

---

## 📄 License
Open-source under the [MIT License](./LICENSE).
