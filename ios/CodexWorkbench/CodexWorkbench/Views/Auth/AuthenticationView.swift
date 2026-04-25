import SwiftUI

struct AuthenticationView: View {
    @Environment(AppState.self) private var appState
    @State private var password = ""
    @State private var newPassword = ""
    @State private var setupMode = SetupMode.connect
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                WorkbenchTheme.pageBackground.ignoresSafeArea()

                Form {
                    Section {
                        FirstRunHero()
                        Picker("Mode", selection: $setupMode) {
                            ForEach(SetupMode.allCases) { mode in
                                Text(mode.title).tag(mode)
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                    .listRowBackground(Color.clear)

                    Section {
                        if setupMode == .connect {
                            SecureField("Host password", text: $password)
                                .textContentType(.password)
                            Button("Continue", action: login)
                                .disabled(password.isEmpty || isLoading)
                        } else {
                            SecureField("New host password", text: $newPassword)
                                .textContentType(.newPassword)
                            Button("Create Host Password") {
                                // First-run setup endpoint belongs to the host/auth integration milestone.
                                password = newPassword
                                login()
                            }
                            .disabled(newPassword.count < 8 || isLoading)
                        }
                    } header: {
                        Text(setupMode.title)
                    } footer: {
                        Text(setupMode.footer)
                    }

                    Section("Host") {
                        HostURLField(hostStore: appState.hostStore)
                    }

                    Section("Project Bootstrap") {
                        Label("Projects and conversations load after host authentication.", systemImage: "folder.badge.gearshape")
                        Text("The first native release mirrors desktop Workbench structure: project groups, conversation lists, and a focused chat detail.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }

                    if let errorMessage {
                        Section {
                            Text(errorMessage)
                                .foregroundStyle(.red)
                        }
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("First Run")
        }
    }

    private func login() {
        isLoading = true
        errorMessage = nil

        Task {
            do {
                let session = try await appState.apiClient.login(password: password)
                await MainActor.run {
                    appState.updateSession(session)
                    isLoading = false
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isLoading = false
                }
            }
        }
    }
}

private enum SetupMode: CaseIterable, Identifiable {
    case connect
    case firstRun

    var id: Self { self }

    var title: String {
        switch self {
        case .connect:
            "Connect"
        case .firstRun:
            "First Run"
        }
    }

    var footer: String {
        switch self {
        case .connect:
            "Use the password configured by your Mac Host Service."
        case .firstRun:
            "Setup mode is a UI placeholder until the host setup endpoint is connected."
        }
    }
}

private struct FirstRunHero: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            StatusPill(text: "Native SwiftUI", systemImage: "iphone")
            Text("CODEX WORKBENCH")
                .font(.system(.largeTitle, design: .rounded, weight: .black))
                .foregroundStyle(WorkbenchTheme.ink)
            Text("Connect this iPhone app to your local Mac host, then continue into native project and chat screens.")
                .font(.callout)
                .foregroundStyle(WorkbenchTheme.mutedInk)
        }
        .padding(.vertical, 8)
    }
}
