# Changelog

## 0.3.0

- Republish of 0.2.0 with no functional changes.

## 0.2.0

- Default port changed from `3774` to `18774` to avoid Windows Hyper-V/WinNAT excluded port ranges (the previous default caused `EACCES: permission denied` on many Windows machines).
- New command `Copilot Token Bridge: Set Port` and a status-bar quick menu for changing port / starting / stopping without editing settings.
- Port changes in settings are picked up live — the server restarts automatically.
- Multi-window safety: secondary VS Code windows no longer spam `EADDRINUSE` errors. They detect an existing instance via `GET /ping` and enter a silent "shared mode" with a `$(link)` status bar indicator.
- Added `GET /ping` liveness/identification endpoint.

## 0.1.0

- Initial open-source release as **Copilot Token Bridge**.
- Single endpoint: `GET /token` exposing the cached GitHub Copilot internal token on `127.0.0.1:3774`.
