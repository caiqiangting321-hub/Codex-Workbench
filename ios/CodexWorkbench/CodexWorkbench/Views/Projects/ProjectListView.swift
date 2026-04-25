import SwiftUI

struct ProjectListView: View {
    @Environment(AppState.self) private var appState
    @Binding var selection: ProjectSummary?
    @State private var projects: [ProjectSummary] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            WorkbenchTheme.pageBackground.ignoresSafeArea()

            List(selection: $selection) {
                Section {
                    HostSummaryCard(hostURL: appState.hostStore.hostURL)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }

                Section("Projects") {
                    ForEach(projects) { project in
                        ProjectRow(project: project)
                            .tag(project)
                    }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .overlay {
            ProjectListOverlay(
                isLoading: isLoading,
                isEmpty: projects.isEmpty,
                errorMessage: errorMessage,
                retry: reload
            )
        }
        .navigationTitle("Projects")
        .toolbar {
            Button("Refresh", systemImage: "arrow.clockwise", action: reload)
                .disabled(isLoading)
        }
        .task {
            await reloadAsync()
        }
        .refreshable {
            await reloadAsync()
        }
    }

    private func reload() {
        Task {
            await reloadAsync()
        }
    }

    private func reloadAsync() async {
        isLoading = true
        errorMessage = nil

        do {
            projects = try await appState.apiClient.fetchProjects()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}

private struct HostSummaryCard: View {
    let hostURL: URL

    var body: some View {
        WorkbenchCard {
            HStack(spacing: 12) {
                Image(systemName: "server.rack")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(WorkbenchTheme.accent)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Mac Host Service")
                        .font(.headline)
                    Text(hostURL.absoluteString)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                StatusPill(text: "Local", systemImage: "checkmark.circle")
            }
        }
    }
}

private struct ProjectRow: View {
    let project: ProjectSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(project.name)
                        .font(.headline)
                    if let path = project.path {
                        Text(path)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer()
                if let updatedAt = project.updatedAt {
                    Text(updatedAt, style: .relative)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            HStack {
                StatusPill(text: "Conversations", systemImage: "bubble.left.and.bubble.right")
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 6)
    }
}

private struct ProjectListOverlay: View {
    let isLoading: Bool
    let isEmpty: Bool
    let errorMessage: String?
    let retry: () -> Void

    var body: some View {
        if isLoading {
            ProgressView("Loading projects")
        } else if let errorMessage {
            ContentUnavailableView {
                Label("Could Not Load Projects", systemImage: "wifi.exclamationmark")
            } description: {
                Text(errorMessage)
            } actions: {
                Button("Retry", action: retry)
            }
        } else if isEmpty {
            ContentUnavailableView("No Projects", systemImage: "folder")
        }
    }
}
