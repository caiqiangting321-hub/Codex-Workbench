import SwiftUI

struct ProjectsSplitView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var appState = appState

        NavigationSplitView {
            ProjectListView(selection: $appState.selectedProject)
        } content: {
            if let project = appState.selectedProject {
                ThreadListView(project: project, selection: $appState.selectedThread)
            } else {
                ContentUnavailableView("Select a Project", systemImage: "folder")
            }
        } detail: {
            if let thread = appState.selectedThread {
                ChatView(thread: thread)
            } else {
                ContentUnavailableView("Select a Conversation", systemImage: "message")
            }
        }
    }
}
