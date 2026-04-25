import SwiftUI

struct RootView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        Group {
            if appState.session == nil {
                AuthenticationView()
            } else {
                MainTabView()
            }
        }
    }
}
