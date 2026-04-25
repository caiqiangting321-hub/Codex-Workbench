import Foundation
import Security

protocol TokenStore {
    func loadSession() -> AuthSession?
    func saveSession(_ session: AuthSession?)
}

final class UserDefaultsTokenStore: TokenStore {
    private let userDefaults: UserDefaults
    private let key: String
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(
        userDefaults: UserDefaults = .standard,
        key: String = "codexWorkbench.authSession"
    ) {
        self.userDefaults = userDefaults
        self.key = key
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    func loadSession() -> AuthSession? {
        guard let data = userDefaults.data(forKey: key) else {
            return nil
        }
        return try? decoder.decode(AuthSession.self, from: data)
    }

    func saveSession(_ session: AuthSession?) {
        guard let session else {
            userDefaults.removeObject(forKey: key)
            return
        }
        guard let data = try? encoder.encode(session) else {
            return
        }
        userDefaults.set(data, forKey: key)
    }
}

final class KeychainTokenStore: TokenStore {
    private let service = "com.codexworkbench.ios.auth"
    private let account = "session"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init() {
        encoder.dateEncodingStrategy = .iso8601
        decoder.dateDecodingStrategy = .iso8601
    }

    func loadSession() -> AuthSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return try? decoder.decode(AuthSession.self, from: data)
    }

    func saveSession(_ session: AuthSession?) {
        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]

        guard let session, let data = try? encoder.encode(session) else {
            SecItemDelete(baseQuery as CFDictionary)
            return
        }

        let attributes: [String: Any] = [kSecValueData as String: data]
        let status = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var addQuery = baseQuery
            addQuery[kSecValueData as String] = data
            addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(addQuery as CFDictionary, nil)
        }
    }
}
