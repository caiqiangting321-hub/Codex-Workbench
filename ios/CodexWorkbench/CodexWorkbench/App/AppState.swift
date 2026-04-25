import Foundation
import Observation

@Observable
final class AppState {
    var selectedProject: ProjectSummary?
    var selectedThread: ThreadSummary?
    var session: AuthSession?

    let hostStore: HostURLStore
    let tokenStore: TokenStore
    let apiClient: APIClient
    let webSocketClient: WebSocketClient

    init(
        hostStore: HostURLStore,
        tokenStore: TokenStore,
        apiClient: APIClient,
        webSocketClient: WebSocketClient
    ) {
        self.hostStore = hostStore
        self.tokenStore = tokenStore
        self.apiClient = apiClient
        self.webSocketClient = webSocketClient
        self.session = tokenStore.loadSession()
    }

    static func bootstrap() -> AppState {
        let hostStore = HostURLStore()
        let tokenStore = UserDefaultsTokenStore()
        let apiClient = APIClient(hostStore: hostStore, tokenStore: tokenStore)
        let webSocketClient = WebSocketClient(hostStore: hostStore, tokenStore: tokenStore)

        return AppState(
            hostStore: hostStore,
            tokenStore: tokenStore,
            apiClient: apiClient,
            webSocketClient: webSocketClient
        )
    }

    func updateSession(_ session: AuthSession?) {
        self.session = session
        tokenStore.saveSession(session)
    }
}
