import SwiftUI

struct HostConfigView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        ZStack {
            WorkbenchTheme.pageBackground.ignoresSafeArea()

            Form {
                Section {
                    HostURLField(hostStore: appState.hostStore)
                } header: {
                    Text("Mac Host")
                } footer: {
                    Text("Persistence is handled by HostURLStore. Health checks and auth setup can be wired once the host API contract is stable.")
                }

                Section("Connection Checklist") {
                    Label("Local network permission", systemImage: "network")
                    Label("Host password or setup token", systemImage: "key")
                    Label("Project index and session database access", systemImage: "folder")
                }

                Section("Actions") {
                    Button {
                        // Future: call host health endpoint and present result.
                    } label: {
                        Label("Test Connection", systemImage: "antenna.radiowaves.left.and.right")
                    }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("Host Config")
    }
}
