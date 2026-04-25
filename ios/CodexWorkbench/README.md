# CODEX WORKBENCH iOS

Native SwiftUI client skeleton for CODEX WORKBENCH.

## Scope

This project is intentionally not a WKWebView wrapper. The first milestone provides a native SwiftUI app shell, typed service boundaries, and placeholder API/WebSocket clients that can be aligned with the Host Service contract.

## Open In Xcode

Open:

```sh
ios/CodexWorkbench/CodexWorkbench.xcodeproj
```

Scheme:

```sh
CodexWorkbench
```

## Host Service

The default Host URL is:

```text
http://192.168.1.204:8787/
```

Users can change it in the sign-in screen or Settings. `Info.plist` includes `NSLocalNetworkUsageDescription` and `NSAppTransportSecurity.NSAllowsLocalNetworking` for first-party local-network Host Service access.

## Implemented Skeleton

- SwiftUI app entry and tab/navigation shell.
- Project list, thread list, chat detail, auth, and settings screens.
- `APIClient` with async/await endpoints for auth, projects, threads, messages, cancel, retry, model list, and attachment upload.
- `WebSocketClient` placeholder for streaming `MessageEvent` updates.
- `HostURLStore`, `TokenStore`, temporary `UserDefaultsTokenStore`, and `KeychainTokenStore`.
- Native models for projects, threads, messages, run state, auth session, models, and attachments.
- Privacy manifest with no collected data declared for the current skeleton.
- XCTest coverage for host URL normalization.

## Still Skeleton / Contract Pending

- Host API paths and payload shapes must be confirmed against the current service before relying on live data.
- First-run password setup UI is represented by the sign-in skeleton; wire it once the setup/status endpoints are confirmed.
- WebSocket streaming is implemented as a typed placeholder but not integrated into `ChatView` yet.
- Attachment upload service exists; file importer UI is intentionally left for the next milestone.
- App icon, launch branding, and App Store metadata are not yet included.
