import Foundation

enum WebSocketConnectionState: Equatable, Sendable {
    case offline
    case connecting
    case online
}

final class WebSocketClient {
    private let hostStore: HostURLStore
    private let tokenStore: TokenStore
    private let decoder: JSONDecoder
    private var task: URLSessionWebSocketTask?

    private(set) var connectionState: WebSocketConnectionState = .offline

    init(hostStore: HostURLStore, tokenStore: TokenStore) {
        self.hostStore = hostStore
        self.tokenStore = tokenStore

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(WorkbenchDateCoding.decodeDate)
        self.decoder = decoder
    }

    func connect() throws -> AsyncThrowingStream<WorkbenchSocketEvent, Error> {
        let request = try makeRequest()
        let task = URLSession.shared.webSocketTask(with: request)
        self.task = task
        connectionState = .connecting
        task.resume()
        connectionState = .online

        return AsyncThrowingStream { continuation in
            Task {
                do {
                    while Task.isCancelled == false {
                        let message = try await task.receive()
                        if let event = try self.decode(message) {
                            continuation.yield(event)
                        }
                    }
                    continuation.finish()
                } catch {
                    self.connectionState = .offline
                    continuation.finish(throwing: error)
                }
            }
        }
    }

    func connect(threadID: String) async throws -> AsyncThrowingStream<WorkbenchSocketEvent, Error> {
        try connect()
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        connectionState = .offline
    }

    private func makeRequest() throws -> URLRequest {
        guard let session = tokenStore.loadSession(), session.isExpired == false else {
            throw APIClientError.unauthorized
        }
        guard var components = URLComponents(url: hostStore.hostURL, resolvingAgainstBaseURL: false) else {
            throw APIClientError.invalidURL("/ws")
        }

        switch components.scheme {
        case "https":
            components.scheme = "wss"
        case "http":
            components.scheme = "ws"
        default:
            throw APIClientError.invalidURL("/ws")
        }

        let basePath = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        components.path = "/" + [basePath, "ws"].filter { $0.isEmpty == false }.joined(separator: "/")
        components.queryItems = [URLQueryItem(name: "token", value: session.accessToken)]

        guard let url = components.url else {
            throw APIClientError.invalidURL("/ws")
        }

        return URLRequest(url: url)
    }

    private func decode(_ message: URLSessionWebSocketTask.Message) throws -> WorkbenchSocketEvent? {
        let data: Data
        switch message {
        case .data(let value):
            data = value
        case .string(let string):
            data = Data(string.utf8)
        @unknown default:
            return nil
        }
        return try decoder.decode(WorkbenchSocketEvent.self, from: data)
    }
}
