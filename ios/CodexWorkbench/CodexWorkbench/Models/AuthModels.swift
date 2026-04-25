import Foundation

struct AuthSession: Codable, Equatable, Sendable {
    var accessToken: String
    var refreshToken: String?
    var expiresAt: Date?

    var isExpired: Bool {
        guard let expiresAt else {
            return false
        }
        return expiresAt <= Date()
    }
}

struct LoginRequest: Codable, Equatable, Sendable {
    var password: String
}

struct LoginResponse: Codable, Equatable, Sendable {
    var accessToken: String
    var refreshToken: String?
    var expiresIn: Int?
    var expiresAt: Date?

    var session: AuthSession {
        AuthSession(
            accessToken: accessToken,
            refreshToken: refreshToken,
            expiresAt: expiresAt ?? expiresIn.map { Date().addingTimeInterval(TimeInterval($0)) }
        )
    }
}

typealias AuthTokenPair = LoginResponse

struct AuthStatus: Codable, Equatable, Sendable {
    var configured: Bool
    var setupRequired: Bool
    var source: String
}

struct ChangePasswordRequest: Codable, Equatable, Sendable {
    var currentPassword: String
    var newPassword: String
}

struct RefreshTokenRequest: Codable, Equatable, Sendable {
    var refreshToken: String
}
