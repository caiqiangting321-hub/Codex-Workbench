import SwiftUI

@main
struct CodexWorkbenchApp: App {
    @State private var appState = AppState.bootstrap()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
        }
    }
}
