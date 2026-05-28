# Copilot Token Bridge

A small VS Code extension that exposes your **GitHub Copilot internal token** over a local HTTP endpoint, so other local tools running on the same machine can call Copilot-backed endpoints using your existing IDE sign-in.

> The token is fetched through VS Code's standard `vscode.authentication` API. Nothing leaves `127.0.0.1`.

## Quick start

Once installed, the extension auto-starts an HTTP server on `http://127.0.0.1:18774` when VS Code launches. From any local shell:

```bash
$ curl http://127.0.0.1:18774/token
{
  "token": "tid=...;exp=...;sku=...",
  "expires_at": 1730000000,
  "refresh_in": 1500,
  "endpoints": { "api": "https://api.individual.githubcopilot.com", "...": "..." }
}
```

The token is cached in-memory until 60 seconds before its `expires_at`. Use `?force=true` to bypass the cache:

```bash
$ curl 'http://127.0.0.1:18774/token?force=true'
```

## What it does

A single HTTP endpoint:

```
GET /token              # returns the cached Copilot internal token (JSON)
GET /token?force=true   # bypass cache and fetch a fresh token
GET /ping               # liveness probe — returns {"service":"copilot-token-bridge","pid":<n>}
```

Response of `/token` is the raw JSON body returned by `api.github.com/copilot_internal/v2/token`.

## Why

Tools that want to talk to Copilot-internal endpoints need a short-lived bearer token. Acquiring it normally requires re-implementing the GitHub OAuth → Copilot token exchange and managing the GitHub session. If you're already signed into Copilot inside VS Code, this extension lets you reuse that session: any local CLI or script can `curl http://127.0.0.1:18774/token` and get a fresh token.

## Install (from source)

```bash
npm install
npx @vscode/vsce package
code --install-extension copilot-token-bridge-*.vsix
```

Then reload VS Code. Server starts automatically. Commands available in the palette:

- `Copilot Token Bridge: Start Server`
- `Copilot Token Bridge: Stop Server`
- `Copilot Token Bridge: Set Port` — prompts for a new port and restarts the server
- `Copilot Token Bridge: Show Menu` — quick-pick menu (also opened by clicking the status bar item)

Click the `$(key) Copilot Token :<port>` status bar item to open the quick menu (change port / start / stop).

## Configuration

Setting | Default | Description
---|---|---
`copilot-token-bridge.port` | `18774` | TCP port for the local endpoint. Bound to `127.0.0.1`. Changes are picked up live — the server restarts automatically.

> **Windows note:** ports inside Hyper-V / WinNAT excluded ranges (check with `netsh interface ipv4 show excludedportrange protocol=tcp`) will fail to bind with `EACCES`. The default `18774` is outside the typical reserved ranges; pick another high port if it conflicts on your machine.

## Multiple VS Code windows

The extension activates in every VS Code window, but only one can own the port. To avoid noisy `EADDRINUSE` errors:

- The first window to start binds the port and shows `$(key) Copilot Token :<port>` in the status bar.
- Subsequent windows probe the port via `GET /ping`. If the response identifies an existing instance of this extension, the window silently enters **shared mode** and shows `$(link) Copilot Token :<port>` (it does not run its own server, but the status bar / commands still work).
- If the port is held by something else entirely, the first auto-start stays silent in the log; running `Start Server` manually surfaces the error.
- Closing the owning window releases the port. Shared-mode windows do not auto-promote — run `Copilot Token Bridge: Start Server` (or pick `Change port...` to move to a different port) in one of them to take over.

## Security

- Listens on `127.0.0.1` only — not reachable from other machines.
- No auth on the local endpoint: any process on your machine that can reach loopback can read your Copilot token. Same threat model as a credentials file in your home directory. Don't run untrusted code on a machine where this server is running.
- Requires you to be signed into GitHub in VS Code with Copilot access. Without a session the endpoint returns `500`.
- The in-memory token cache is cleared whenever you stop the server, so switching GitHub accounts only requires `Stop Server` → `Start Server`.

## Development

```bash
npm install
npm run watch
# Press F5 in VS Code to launch an Extension Development Host
```

## License

MIT
