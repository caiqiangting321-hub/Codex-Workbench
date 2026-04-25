import SwiftUI

struct ThreadListView: View {
    @Environment(AppState.self) private var appState
    let project: ProjectSummary
    @Binding var selection: ThreadSummary?
    @State private var threads: [ThreadSummary] = []
    @State private var showsSubagents = false
    @State private var isLoading = false
    @State private var errorMessage: String?

    private var visibleThreads: [ThreadSummary] {
        showsSubagents ? threads : threads.filter { isLikelySubagent($0) == false }
    }

    private var hiddenSubagentCount: Int {
        max(threads.count - visibleThreads.count, 0)
    }

    var body: some View {
        ZStack {
            WorkbenchTheme.pageBackground.ignoresSafeArea()

            List(selection: $selection) {
                Section {
                    ProjectConversationHeader(project: project, showsSubagents: $showsSubagents)
                        .listRowSeparator(.hidden)
                        .listRowBackground(Color.clear)
                }

                Section {
                    ForEach(visibleThreads) { thread in
                        ThreadRow(thread: thread)
                            .tag(thread)
                    }
                } header: {
                    Text("Conversations")
                } footer: {
                    if hiddenSubagentCount > 0 {
                        Text("\(hiddenSubagentCount) multi-agent subthreads hidden. Use the toggle above to inspect them.")
                    }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .overlay {
            ThreadListOverlay(
                isLoading: isLoading,
                isEmpty: threads.isEmpty,
                errorMessage: errorMessage,
                retry: reload
            )
        }
        .navigationTitle(project.name)
        .task(id: project.id) {
            await reloadAsync()
        }
        .refreshable {
            await reloadAsync()
        }
        .toolbar {
            Button("Refresh", systemImage: "arrow.clockwise", action: reload)
                .disabled(isLoading)
        }
    }

    private func isLikelySubagent(_ thread: ThreadSummary) -> Bool {
        thread.isSubagent || thread.parentThreadId != nil || thread.subagentDepth != nil || thread.title.localizedCaseInsensitiveContains("agent")
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
            threads = try await appState.apiClient.fetchThreads(projectID: project.id)
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }
}

private struct ProjectConversationHeader: View {
    let project: ProjectSummary
    @Binding var showsSubagents: Bool

    var body: some View {
        WorkbenchCard {
            VStack(alignment: .leading, spacing: 10) {
                Text(project.name)
                    .font(.title2.weight(.bold))
                if let path = project.path {
                    Text(path)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Toggle(isOn: $showsSubagents.animation()) {
                    Label("Show multi-agent subthreads", systemImage: "person.2.wave.2")
                }
                .font(.subheadline)
            }
        }
    }
}

private struct ThreadRow: View {
    let thread: ThreadSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                Text(thread.title)
                    .font(.headline)
                    .lineLimit(2)
                Spacer()
                RunStatePill(runState: thread.runState)
            }

            HStack {
                if let model = thread.model {
                    Label(model, systemImage: "cpu")
                }
                if let updatedAt = thread.updatedAt {
                    Text(updatedAt, style: .relative)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
    }
}

struct RunStatePill: View {
    let runState: ThreadRunState

    var body: some View {
        StatusPill(text: runState.rawValue.capitalized, systemImage: icon, tint: tint)
    }

    private var tint: Color {
        runState == .failed ? WorkbenchTheme.danger : WorkbenchTheme.accent
    }

    private var icon: String {
        if runState == .queued {
            "clock"
        } else if runState == .running || runState == .cancelling {
            "terminal"
        } else if runState == .failed {
            "exclamationmark.triangle"
        } else if runState == .completed {
            "checkmark.circle"
        } else if runState == .cancelled {
            "xmark.circle"
        } else {
            "circle"
        }
    }
}

private struct ThreadListOverlay: View {
    let isLoading: Bool
    let isEmpty: Bool
    let errorMessage: String?
    let retry: () -> Void

    var body: some View {
        if isLoading {
            ProgressView("Loading conversations")
        } else if let errorMessage {
            ContentUnavailableView {
                Label("Could Not Load Conversations", systemImage: "exclamationmark.bubble")
            } description: {
                Text(errorMessage)
            } actions: {
                Button("Retry", action: retry)
            }
        } else if isEmpty {
            ContentUnavailableView("No Conversations", systemImage: "message")
        }
    }
}
