# Copilot Token Bridge

A small VS Code extension that exposes your **GitHub Copilot internal token** over a local HTTP endpoint, so other local tools running on the same machine can call Copilot-backed endpoints using your existing IDE sign-in.

> The token is fetched through VS Code's standard `vscode.authentication` API. Nothing leaves `127.0.0.1`.

## What it does

When activated, the extension starts an HTTP server on `http://127.0.0.1:3774` with a single endpoint:

```
GET /token              # returns the cached Copilot internal token (JSON)
GET /token?force=true   # bypass cache and fetch a fresh token
```

Response shape (passthrough from `api.github.com/copilot_internal/v2/token`):

```json
{
  "token": "...",
  "expires_at": 1730000000
}
```

The token is cached in-memory until 60 seconds before its `expires_at`.

## Why

Tools that want to talk to Copilot-internal endpoints need a short-lived bearer token. Acquiring it normally requires re-implementing the GitHub OAuth → Copilot token exchange and managing the GitHub session. If you're already signed into Copilot inside VS Code, this extension lets you reuse that session: any local CLI or script can `curl http://127.0.0.1:3774/token` and get a fresh token.

## Install (from source)

```bash
npm install
npm run package
npx @vscode/vsce package --allow-missing-repository
code --install-extension copilot-token-bridge-*.vsix
```

The server starts automatically on VS Code launch. Commands:

- `Copilot Token Bridge: Start Server`
- `Copilot Token Bridge: Stop Server`

## Security

- Listens on `127.0.0.1` only — not reachable from other machines.
- No auth on the local endpoint: any process on your machine that can reach loopback can read your Copilot token. Same threat model as a credentials file in your home directory. Don't run untrusted code on a machine where this server is running.
- Requires you to be signed into GitHub in VS Code with Copilot access. Without a session the endpoint returns `500`.

## Development

```bash
npm install
npm run watch
# Press F5 in VS Code to launch an Extension Development Host
```

## License

MIT
