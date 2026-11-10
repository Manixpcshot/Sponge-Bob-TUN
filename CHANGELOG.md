# Changelog

## [v1.2.0] - 2026-11-10

### Changed & Added / تغییرات و افزوده‌ها
- **Edge Sidebar Navigation (`SideNav.tsx`):** Organized the entire interface into clean, dedicated sections along a collapsible edge sidebar (RTL right side in Persian, LTR left side in English) with live status indicators and Bikini Bottom scene previews:
  - **Connection & Bandwidth (`اتصال و پهنای باند`):** Focused uncluttered workspace containing only the Connection Hero card (with SpongeBob's Pineapple House vignette) and expanded Live Bandwidth & Peak Traffic monitor.
  - **Configs & Servers (`کانفیگ‌ها و سرورها`):** Dedicated section for encrypted Subscription URL vault, `.npvs`/`.txt` import & export, Mr. Krabs Quota Guard (with The Krusty Krab backdrop), Patrick Star empty-state helper, and full-height VLESS Server List.
  - **Live Console (`کنسول زنده`):** Dedicated Squidward Control Room terminal displaying real-time sanitized Xray-core & proxy diagnostics, level filters (`All`/`Info`/`Warn`/`Error`), search, auto-scroll, copy, and clear controls.
  - **Settings & Bikini Bottom Gallery (`تنظیمات و گالری`):** Full-section settings view featuring language/theme controls, custom mascot uploads, network/smart-fallback tuning, auto-update controls, and an interactive Bikini Bottom Artwork Gallery with lightbox preview.
- **Title Bar (`TitleBar.tsx`):** Removed the fullscreen diagonal-arrow icon button as requested, keeping Minimize, Maximize/Restore, and Close controls pinned cleanly on the right.
- **Expanded Bikini Bottom Artwork (`src/assets/*.webp`):** Added 5 custom WebP illustrations matching the neon-purple & golden-yellow aesthetic: SpongeBob's Pineapple House (`pineapple-house.webp`), Squidward Tentacles & Moai House (`squidward-mascot.webp`), The Krusty Krab Restaurant (`krusty-krab.webp`), Patrick Star & Rock House (`patrick-mascot.webp`), and Bikini Bottom Conch Street Panorama (`bikini-bottom-scene.webp`).

## [v1.1.0] - 2026-11-10

### Added / افزوده‌ها
- **Full Rust + Tauri v2 Desktop Backend (`src-tauri/`):**
  - Complete native Rust backend achieving 100% feature parity with Electron while sharing the React UI (`src/` via `src/bridge.ts` auto-detecting Electron vs Tauri v2).
  - Native Windows **DPAPI** (`CryptProtectData` / `CryptUnprotectData`) + AES-256-GCM encrypted vault (`secure_store.rs`).
  - Native Windows **Registry + WinINet** (`InternetSetOptionW`) local system proxy manager with atomic backup & stale-crash recovery (`system_proxy.rs`), strictly local SOCKS5/HTTP with zero TUN/Wintun (`xray_config.rs`).
  - Native pure-Rust HTTP/2 gRPC `StatsService/QueryStats` bandwidth monitor (`xray_stats.rs`).
  - Native VLESS/Base64 parser (`vless_parser.rs`), `.npvs` PBKDF2-SHA256 + AES-256-GCM / OpenSSL `Salted__` codec (`npvs_codec.rs`), `SafeLogger` secret sanitizer (`log_sanitizer.rs`), `subscription.rs` with Mr. Krabs quota guard, concurrent latency probing + smart fallback (`latency.rs`), native system tray & single-instance guard (`lib.rs`).
  - Launch-time GitHub Releases updater supporting both NSIS Setup & single-file Portable self-replacement (`updater.rs`).
- **Bug-Free Zero-Setup Portable Editions (Both Electron & Rust/Tauri):**
  - **Tauri Single-File Portable EXE** (`Sponge-bob-tun-Tauri-Portable-1.1.0.exe`): Built with `--features embed-xray`, embedding gzip-compressed + SHA-256-verified `xray.exe` directly inside the standalone binary and extracting/storing `SpongeBobTUN-Data/` alongside the executable (with WebView2 data directory isolation and read-only `%APPDATA%` fallback).
  - **Tauri Portable ZIP** (`Sponge-bob-tun-Tauri-Portable-1.1.0-win-x64.zip`) & **Tauri NSIS Setup** (`Sponge-bob-tun-Tauri-Setup-1.1.0.exe`).
  - **Electron Portable EXE** (`Sponge-bob-tun-Electron-Portable-1.1.0.exe`) & **Electron Portable ZIP** (`Sponge-bob-tun-Electron-Portable-1.1.0-win-x64.zip`): Fixed portable data directory persistence (`PORTABLE_EXECUTABLE_DIR` / `PORTABLE_MODE.txt`), disabled `app-update.yml` error loops in portable mode, and added PE-verified GitHub portable `.exe` self-updating.
- **CI/CD Pipelines (`.github/workflows/{ci,release}.yml`):** Added Linux & Windows Rust test verification and automated multi-target Windows builds + PE binary integrity checks for all 8 release artifacts.

## [v1.0.0] - 2026-11-10

### Added / افزوده‌ها
- Initial open-source release of **Sponge bob tun (باب اسفنجی)** built with Electron, React, TypeScript, Tailwind CSS, Framer Motion, and Xray-core.
- **Local Xray Proxy Only:** SOCKS5 (`127.0.0.1:10808`) and HTTP (`127.0.0.1:10809`) without TUN or Wintun drivers, with safe Windows System Proxy management and stale-proxy crash recovery.
- **Subscription & VLESS Parser:** Fetches TXT subscriptions, decodes Base64 / double-Base64 / URL-safe Base64, parses VLESS URIs & JSON configs, and reads `subscription-userinfo`.
- **`.npvs` & Password Support:** Reads and exports password-protected `.npvs` configs (`sponge-npvs-v1` PBKDF2-SHA256 + AES-256-GCM and OpenSSL/CryptoJS `Salted__`), with in-app password prompt modal.
- **Auto Best Server & Smart Fallback:** Background latency probing, pinned Auto selector, and automatic failover after `N` consecutive health-check failures.
- **Live Bandwidth Graph:** Real-time Upload/Download area curve & session byte counters powered by Xray's gRPC `StatsService`.
- **Mr. Krabs Quota Guard:** Automated toast & Windows tray notifications at ≥ 80% usage or < 3 days remaining.
- **Pinned Favorites & Country Flag Filters:** Starred servers stay pinned at top; crisp SVG country flags + filter chips.
- **Bilingual & Dual Themes:** Persian (`RTL`) + English (`LTR`), Obsidian Dark & SpongeBob Yellow-Purple themes, custom mascot artwork + upload option, and window controls fixed on the right side.
- **GitHub Auto-Update & CI/CD:** Launch-time GitHub Releases check, silent update + single automatic close & relaunch via `electron-updater`, plus automated Windows release workflow.
