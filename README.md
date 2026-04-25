# CODEX WORKBENCH

CODEX WORKBENCH is a local-first mobile workbench for controlling Codex Desktop from a phone. It includes a host service/PWA and an early native SwiftUI iOS client.

## What is included

- Local host service that reads Codex Desktop state and exposes authenticated HTTP/WebSocket APIs.
- Mobile PWA for browsing projects, opening threads, viewing message/tool history, sending messages, stopping runs, retrying, uploading attachments, and changing models.
- Native SwiftUI iOS app skeleton under `ios/CodexWorkbench`, intended for a future App Store-ready client.

## Run the web workbench

```bash
npm install
cp .env.example .env
npm start
```

For LAN/mobile access, set:

```bash
CODEX_REMOTE_HOST=0.0.0.0
CODEX_REMOTE_PORT=8787
CODEX_REMOTE_PASSWORD=change-this-password
```

Then open:

```text
http://<your-mac-lan-ip>:8787/
```

## Development

```bash
npm test
npm run build
```

## iOS app

The native SwiftUI app is in:

```text
ios/CodexWorkbench
```

It is currently an App Store-oriented native skeleton that targets the existing CODEX WORKBENCH host service. See `ios/CodexWorkbench/README.md` for iOS-specific notes.

## Security notes

- Do not expose the host service directly to the public internet.
- Use a VPN or trusted LAN for first versions.
- Keep real `.env` files, local Codex state, tokens, and uploads out of Git.
