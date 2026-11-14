# Changelog

All notable changes to this project are documented here. The format follows Keep a Changelog, and versions use semantic versioning once the project leaves 0.x.

## [0.1.0] — 2026-11-14

First public iteration: offline-first, local-only, demo-data complete.

### Added

- Home dashboard with recovery, strain and sleep rings, coach insight, stress/energy, sleep stages, timeline preview, nutrition summary and journal quick-log.
- Recovery detail with gated score, personal baselines, explainable components and trend chart.
- Sleep detail with hypnogram, stage cards, sleep bank, sleep need, time-to-fall-asleep and alarm sheet (smart/regular/sleep-need/none).
- Strain detail with cumulative chart, target range, daytime HR, total energy and activity-status effects.
- Fitness tab with weekly summary, cardio/muscular load, muscle freshness, routines, structured workout view, live timer and workout saving.
- Journal with yes/no, yes/neutral/no and numeric tags, pinned tags, custom tags and correlation insights after 5+5 entries.
- Biology with Biological Age, confidence, contributor equation, semi gauge, biomarkers, health records (local) and age projection.
- Nutrition with calories, macros, net energy, 11 food-quality contributors, search/custom food logging and g/percent detail sheet.
- Offline coach UI with scripted, metric-grounded replies, chat history, ghost mode, credits and settings.
- Settings: appearance, units, tab visibility, goals, calculations (HRV/RHR/temperature/HR zones), data sources, notifications, activity status, language, privacy and about.
- Backup & restore: manual download, daily on-device snapshot, validated file import, rejection of foreign/newer/incomplete backups.
- iOS and Android Capacitor shells with generated app icons and splash screens.
- PWA manifest, installable icon set and offline service-worker shell.
- Deterministic 60-day demo dataset that reproduces the reference screenshots (recovery 41%, sleep 74%, 2,304 kcal, −257 net, biological age 26.0).
- 13 domain tests covering gates, zones, nutrition points, biological-age contributors, muscle-freshness overlap and backup validation.
- Playwright screenshot, E2E, backup and offline-PWA checks.
- Documentation: architecture, scoring model, backup format, health-source roadmap, contributing, security, notice, code of conduct.

### Known limitations

- HealthKit and Health Connect are not implemented; the app runs on demo data and manual logs.
- Backups are unencrypted JSON.
- The coach is deterministic and offline; no language model is called.
- Native binaries must be built with Xcode/Android Studio; the repository includes the projects, not pre-built packages.
- Vendors' private score weights are unknown; this build uses the independent, documented model in `docs/SCORING.md`.
