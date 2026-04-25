import Foundation

struct MessageEvent: Identifiable, Codable, Hashable, Sendable {
    var id: String
    var threadId: String
    var role: MessageRole
    var kind: MessageKind
    var text: String?
    var toolName: String?
    var toolStatus: String?
    var outputPreview: String?
    var activityType: String?
    var activityLabel: String?
    var createdAt: Date
    var attachmentIDs: [String]

    var content: String {
        text ?? outputPreview ?? activityLabel ?? ""
    }

    init(
        id: String,
        threadId: String,
        role: MessageRole,
        kind: MessageKind = .message,
        text: String? = nil,
        content: String? = nil,
        toolName: String? = nil,
        toolStatus: String? = nil,
        outputPreview: String? = nil,
        activityType: String? = nil,
        activityLabel: String? = nil,
        createdAt: Date,
        attachmentIDs: [String] = []
    ) {
        self.id = id
        self.threadId = threadId
        self.role = role
        self.kind = kind
        self.text = text ?? content
        self.toolName = toolName
        self.toolStatus = toolStatus
        self.outputPreview = outputPreview
        self.activityType = activityType
        self.activityLabel = activityLabel
        self.createdAt = createdAt
        self.attachmentIDs = attachmentIDs
    }

    static let previewUser = MessageEvent(
        id: "preview-user-message",
        threadId: "preview-thread",
        role: .user,
        content: "Build the native SwiftUI skeleton.",
        createdAt: Date()
    )

    static let previewAssistant = MessageEvent(
        id: "preview-assistant-message",
        threadId: "preview-thread",
        role: .assistant,
        content: "I will create the navigation, services, and models first.",
        createdAt: Date()
    )
}

enum MessageRole: String, Codable, Sendable {
    case system
    case user
    case assistant
    case tool
}

enum MessageKind: String, Codable, Sendable {
    case message
    case toolCall = "tool_call"
    case toolOutput = "tool_output"
    case runState = "run_state"
}

struct ThreadDetail: Codable, Equatable, Sendable {
    var thread: ThreadSummary
    var state: ThreadRunState?
    var messages: [MessageEvent]

    init(thread: ThreadSummary, state: ThreadRunState? = nil, messages: [MessageEvent] = []) {
        self.thread = thread
        self.state = state
        self.messages = messages
    }
}

struct SendMessageRequest: Codable, Equatable, Sendable {
    var message: String
    var attachments: [UploadedFile]

    init(message: String, attachments: [UploadedFile] = []) {
        self.message = message
        self.attachments = attachments
    }
}

struct UploadRequestFile: Codable, Hashable, Sendable {
    var name: String
    var type: String
    var dataBase64: String
}

struct UploadedFile: Codable, Hashable, Sendable {
    var name: String
    var type: String
    var size: Int
    var path: String
}

struct UploadResponse: Codable, Hashable, Sendable {
    var uploads: [UploadedFile]
}

struct AttachmentUploadResponse: Codable, Equatable, Sendable {
    var id: String
    var fileName: String
    var contentType: String
}

struct CancelResponse: Codable, Hashable, Sendable {
    var cancelled: Bool
    var state: ThreadRunState
}

enum JSONValue: Codable, Hashable, Sendable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else {
            self = .object(try container.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        case .object(let value):
            try container.encode(value)
        case .array(let value):
            try container.encode(value)
        case .null:
            try container.encodeNil()
        }
    }
}

enum WorkbenchSocketEventType: String, Codable, Sendable {
    case systemConnected = "system.connected"
    case projectUpdated = "project.updated"
    case threadUpdated = "thread.updated"
    case threadStatus = "thread.status"
    case messageAppended = "message.appended"
    case runStarted = "run.started"
    case runFinished = "run.finished"
    case runFailed = "run.failed"
    case runEvent = "run.event"
    case runOutput = "run.output"
    case modelChanged = "model.changed"
    case unknown
}

struct WorkbenchSocketEvent: Codable, Hashable, Sendable {
    var type: WorkbenchSocketEventType
    var payload: JSONValue?
    var at: Date?
    var rawType: String

    private enum CodingKeys: String, CodingKey {
        case type
        case payload
        case at
    }

    init(type: WorkbenchSocketEventType, payload: JSONValue? = nil, at: Date? = nil, rawType: String? = nil) {
        self.type = type
        self.payload = payload
        self.at = at
        self.rawType = rawType ?? type.rawValue
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let rawType = try container.decode(String.self, forKey: .type)
        self.type = WorkbenchSocketEventType(rawValue: rawType) ?? .unknown
        self.rawType = rawType
        self.payload = try container.decodeIfPresent(JSONValue.self, forKey: .payload)
        self.at = try container.decodeIfPresent(Date.self, forKey: .at)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(rawType, forKey: .type)
        try container.encodeIfPresent(payload, forKey: .payload)
        try container.encodeIfPresent(at, forKey: .at)
    }
}
