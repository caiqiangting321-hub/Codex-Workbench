import Foundation
import Observation

@Observable
final class HostURLStore {
    static let defaultHostString = "http://192.168.1.204:8787/"

    var hostURL: URL {
        get {
            guard
                let storedValue = userDefaults.string(forKey: key),
                let url = Self.normalizedURL(from: storedValue)
            else {
                return URL(string: Self.defaultHostString)!
            }
            return url
        }
        set {
            userDefaults.set(newValue.absoluteString, forKey: key)
        }
    }

    private let userDefaults: UserDefaults
    private let key: String

    init(
        userDefaults: UserDefaults = .standard,
        key: String = "codexWorkbench.hostURL"
    ) {
        self.userDefaults = userDefaults
        self.key = key
    }

    @discardableResult
    func update(from input: String) throws -> URL {
        guard let url = Self.normalizedURL(from: input) else {
            throw HostURLStoreError.invalidURL
        }
        hostURL = url
        return url
    }

    static func normalizedURL(from input: String) -> URL? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else {
            return nil
        }

        let candidate = trimmed.contains("://") ? trimmed : "http://\(trimmed)"
        guard
            var components = URLComponents(string: candidate),
            let scheme = components.scheme?.lowercased(),
            ["http", "https"].contains(scheme),
            components.host?.isEmpty == false
        else {
            return nil
        }

        components.scheme = scheme
        if components.path.isEmpty {
            components.path = "/"
        }
        return components.url
    }
}

enum HostURLStoreError: LocalizedError {
    case invalidURL

    var errorDescription: String? {
        "Enter a valid http:// or https:// host URL."
    }
}
