import SwiftUI

struct ChatView: View {
    @Environment(AppState.self) private var appState
    let thread: ThreadSummary
    @State private var messages: [MessageEvent] = []
    @State private var draft = ""
    @State private var selectedModel: String?
    @State private var availableModels: [ModelOption] = []
    @State private var runState: ThreadRunState
    @State private var errorMessage: String?

    init(thread: ThreadSummary) {
        self.thread = thread
        _runState = State(initialValue: thread.runState)
    }

    var body: some View {
        VStack(spacing: 0) {
            ChatHeader(thread: thread, selectedModel: selectedModel ?? thread.model, runState: runState)
            Divider()
            MessageListView(messages: messages)
            Divider()
            ComposerView(
                draft: $draft,
                selectedModel: $selectedModel,
                models: availableModels,
                isRunning: runState == .running || runState == .queued,
                send: send,
                stop: stop
            )
        }
        .background(WorkbenchTheme.pageBackground)
        .navigationTitle(thread.title)
        .toolbar {
            Button("Retry", systemImage: "arrow.counterclockwise", action: retry)
        }
        .task(id: thread.id) {
            await loadThread()
            await loadModels()
        }
        .alert("Conversation Error", isPresented: hasErrorMessage) {
            Button("OK", role: .cancel) {
                errorMessage = nil
            }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var hasErrorMessage: Binding<Bool> {
        Binding(
            get: { errorMessage != nil },
            set: { if $0 == false { errorMessage = nil } }
        )
    }

    private func loadThread() async {
        do {
            let detail = try await appState.apiClient.fetchThread(threadID: thread.id)
            messages = detail.messages
            runState = detail.state ?? detail.thread.runState
            selectedModel = detail.thread.model
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadModels() async {
        do {
            availableModels = try await appState.apiClient.fetchModels()
        } catch {
            availableModels = []
        }
    }

    private func send() {
        let content = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard content.isEmpty == false else {
            return
        }

        draft = ""
        runState = .queued

        Task {
            do {
                let detail = try await appState.apiClient.sendMessage(
                    threadID: thread.id,
                    content: content,
                    model: selectedModel,
                    attachmentIDs: []
                )
                await MainActor.run {
                    messages = detail.messages
                    runState = detail.state ?? detail.thread.runState
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    runState = .failed
                }
            }
        }
    }

    private func stop() {
        runState = .cancelling

        Task {
            do {
                try await appState.apiClient.cancelRun(threadID: thread.id)
                await MainActor.run {
                    runState = .idle
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    runState = .failed
                }
            }
        }
    }

    private func retry() {
        runState = .queued

        Task {
            do {
                let detail = try await appState.apiClient.retry(threadID: thread.id)
                await MainActor.run {
                    messages = detail.messages
                    runState = detail.state ?? detail.thread.runState
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    runState = .failed
                }
            }
        }
    }
}

private struct ChatHeader: View {
    let thread: ThreadSummary
    let selectedModel: String?
    let runState: ThreadRunState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(thread.title)
                        .font(.headline)
                    if let selectedModel {
                        Label(selectedModel, systemImage: "cpu")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                RunStatePill(runState: runState)
            }

            ToolRunStatusPlaceholder(runState: runState)
        }
        .padding(14)
        .background(WorkbenchTheme.panel)
    }
}

private struct ToolRunStatusPlaceholder: View {
    let runState: ThreadRunState

    var body: some View {
        HStack(spacing: 10) {
            if runState == .running || runState == .queued || runState == .cancelling {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: "wrench.and.screwdriver")
                    .foregroundStyle(WorkbenchTheme.accent)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text("Tool and run status")
                    .font(.subheadline.weight(.semibold))
                Text(statusText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(12)
        .background(WorkbenchTheme.accentSoft.opacity(0.55), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var statusText: String {
        if runState == .idle {
            "Waiting for the next request."
        } else if runState == .queued {
            "Queued on the host."
        } else if runState == .running {
            "Codex is running tools or generating a response."
        } else if runState == .cancelling {
            "Stop requested."
        } else if runState == .failed {
            "Last run failed. Retry is available from the toolbar."
        } else if runState == .completed {
            "Last run completed."
        } else if runState == .cancelled {
            "Last run was cancelled."
        } else {
            runState.phase.capitalized
        }
    }
}
