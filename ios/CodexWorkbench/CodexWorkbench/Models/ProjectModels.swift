import Foundation

struct ProjectSummary: Identifiable, Codable, Hashable, Sendable {
    var id: String { cwd }
    var name: String { label }
    var path: String? { cwd }
    var updatedAt: Date? { lastUpdatedAt }

    var cwd: String
    var label: String
    var lastUpdatedAt: Date
    var threadCount: Int
    var recentThreads: [ThreadSummary]

    init(
        cwd: String,
        label: String,
        lastUpdatedAt: Date,
        threadCount: Int = 0,
        recentThreads: [ThreadSummary] = []
    ) {
        self.cwd = cwd
        self.label = label
        self.lastUpdatedAt = lastUpdatedAt
        self.threadCount = threadCount
        self.recentThreads = recentThreads
    }

    static let preview = ProjectSummary(
        cwd: "/Users/darklord/Documents/Codex",
        label: "CODEX WORKBENCH",
        lastUpdatedAt: Date(),
        threadCount: 1,
        recentThreads: []
    )
}

struct ThreadSummary: Identifiable, Codable, Hashable, Sendable {
    var projectId: String { cwd }
    var runState: ThreadRunState { ThreadRunState(threadId: id, phase: status) }

    var id: String
    var title: String
    var cwd: String
    var updatedAt: Date?
    var status: String
    var rolloutPath: String?
    var gitBranch: String
    var model: String?
    var effectiveModel: String?
    var parentThreadId: String?
    var isSubagent: Bool
    var agentNickname: String
    var agentRole: String
    var subagentDepth: Int?
    var subagents: [ThreadSummary]

    init(
        id: String,
        title: String,
        cwd: String,
        updatedAt: Date? = nil,
        status: String = "idle",
        rolloutPath: String? = nil,
        gitBranch: String = "",
        model: String? = nil,
        effectiveModel: String? = nil,
        parentThreadId: String? = nil,
        isSubagent: Bool = false,
        agentNickname: String = "",
        agentRole: String = "",
        subagentDepth: Int? = nil,
        subagents: [ThreadSummary] = []
    ) {
        self.id = id
        self.title = title
        self.cwd = cwd
        self.updatedAt = updatedAt
        self.status = status
        self.rolloutPath = rolloutPath
        self.gitBranch = gitBranch
        self.model = model
        self.effectiveModel = effectiveModel
        self.parentThreadId = parentThreadId
        self.isSubagent = isSubagent
        self.agentNickname = agentNickname
        self.agentRole = agentRole
        self.subagentDepth = subagentDepth
        self.subagents = subagents
    }

    static let preview = ThreadSummary(
        id: "preview-thread",
        title: "Native iOS client planning",
        cwd: "/Users/darklord/Documents/Codex",
        updatedAt: Date(),
        status: "idle",
        model: "gpt-5-codex"
    )
}

struct ThreadRunState: Codable, Hashable, Sendable {
    var threadId: String?
    var activeRunId: String?
    var turnId: String?
    var phase: String
    var canCancel: Bool
    var canRetry: Bool
    var transport: String?
    var updatedAt: Date?

    var rawValue: String { phase }

    init(
        threadId: String? = nil,
        activeRunId: String? = nil,
        turnId: String? = nil,
        phase: String,
        canCancel: Bool = false,
        canRetry: Bool = false,
        transport: String? = nil,
        updatedAt: Date? = nil
    ) {
        self.threadId = threadId
        self.activeRunId = activeRunId
        self.turnId = turnId
        self.phase = phase
        self.canCancel = canCancel
        self.canRetry = canRetry
        self.transport = transport
        self.updatedAt = updatedAt
    }

    static let idle = ThreadRunState(phase: "idle")
    static let queued = ThreadRunState(phase: "queued")
    static let running = ThreadRunState(phase: "running")
    static let starting = ThreadRunState(phase: "starting")
    static let cancelling = ThreadRunState(phase: "cancelling")
    static let failed = ThreadRunState(phase: "failed")
    static let completed = ThreadRunState(phase: "completed")
    static let cancelled = ThreadRunState(phase: "cancelled")

    static func == (lhs: ThreadRunState, rhs: ThreadRunState) -> Bool {
        lhs.phase == rhs.phase
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(phase)
    }
}

struct ModelOption: Identifiable, Codable, Hashable, Sendable {
    var id: String
    var displayName: String
}

struct ModelInfo: Codable, Hashable, Sendable {
    var threadId: String?
    var model: String

    var option: ModelOption {
        ModelOption(id: model, displayName: model)
    }
}

struct SystemStatus: Codable, Hashable, Sendable {
    var hostOnline: Bool
    var codexHome: String
    var stateDbReadable: Bool
    var sessionIndexReadable: Bool
    var activeRuns: Int
    var checkedAt: Date
    var sendMode: String?
    var model: String?
    var codexCli: Bool?
    var appServer: AppServerStatus?
}

struct AppServerStatus: Codable, Hashable, Sendable {
    var connected: Bool?
    var url: String?
}

enum WorkbenchDateCoding {
    static let decodeDate: @Sendable (Decoder) throws -> Date = { decoder in
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        if let date = fractionalISO8601.date(from: value) ?? plainISO8601.date(from: value) {
            return date
        }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid ISO 8601 date: \(value)")
    }

    private static let fractionalISO8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let plainISO8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}
