import SwiftUI

struct SettingsView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        NavigationStack {
            ZStack {
                WorkbenchTheme.pageBackground.ignoresSafeArea()

                Form {
                    Section("Host Service") {
                        NavigationLink {
                            HostConfigView()
                        } label: {
                            SettingsRow(
                                title: "Host Configuration",
                                detail: appState.hostStore.hostURL.absoluteString,
                                systemImage: "server.rack"
                            )
                        }
                        Text("Local network access is intended for connecting to your own Mac Host Service during this first native release.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    Section("Account") {
                        Button("Sign Out", role: .destructive) {
                            appState.updateSession(nil)
                        }
                    }

                    Section("Interface") {
                        SettingsRow(
                            title: "Project Groups",
                            detail: "Desktop-style project and conversation split",
                            systemImage: "rectangle.stack"
                        )
                        SettingsRow(
                            title: "Subthreads",
                            detail: "Multi-agent threads collapsed by default",
                            systemImage: "person.2.wave.2"
                        )
                    }

                    Section("App Store Readiness") {
                        Label("Uses public Apple APIs only", systemImage: "checkmark.seal")
                        Label("Includes local network usage purpose string", systemImage: "network")
                        Label("HTTP is limited to local-network ATS policy", systemImage: "lock.shield")
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Settings")
        }
    }
}

private struct SettingsRow: View {
    let title: String
    let detail: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .frame(width: 28, height: 28)
                .foregroundStyle(WorkbenchTheme.accent)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
    }
}

struct HostURLField: View {
    @Bindable var hostStore: HostURLStore
    @State private var hostText: String
    @State private var errorMessage: String?

    init(hostStore: HostURLStore) {
        self.hostStore = hostStore
        _hostText = State(initialValue: hostStore.hostURL.absoluteString)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Host URL", text: $hostText)

            HStack {
                Button("Save Host", action: save)
                Button("Use Default") {
                    hostText = HostURLStore.defaultHostString
                    save()
                }
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
    }

    private func save() {
        do {
            let url = try hostStore.update(from: hostText)
            hostText = url.absoluteString
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
