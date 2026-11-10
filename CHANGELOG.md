# Changelog

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
