import SwiftUI

struct MessageListView: View {
    let messages: [MessageEvent]

    var body: some View {
        ScrollViewReader { proxy in
            List(messages) { message in
                MessageBubble(message: message)
                    .id(message.id)
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .overlay {
                if messages.isEmpty {
                    ContentUnavailableView("No Messages Yet", systemImage: "text.bubble")
                }
            }
            .onChange(of: messages.count) {
                guard let lastID = messages.last?.id else {
                    return
                }
                withAnimation {
                    proxy.scrollTo(lastID, anchor: .bottom)
                }
            }
        }
    }
}

private struct MessageBubble: View {
    let message: MessageEvent

    private var isUser: Bool {
        message.role == .user
    }

    private var isTool: Bool {
        message.role == .tool
    }

    var body: some View {
        HStack {
            if isUser {
                Spacer(minLength: 44)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label(message.role.rawValue.capitalized, systemImage: roleIcon)
                        .font(.caption.weight(.semibold))
                    Text(message.createdAt, style: .time)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Text(message.content)
                    .textSelection(.enabled)

                if message.attachmentIDs.isEmpty == false {
                    AttachmentIDStrip(attachmentIDs: message.attachmentIDs)
                }
            }
            .padding(12)
            .foregroundStyle(isUser ? .white : WorkbenchTheme.ink)
            .background(backgroundStyle, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(isUser ? Color.clear : WorkbenchTheme.line)
            }

            if isUser == false {
                Spacer(minLength: 44)
            }
        }
    }

    private var roleIcon: String {
        switch message.role {
        case .user:
            "person.fill"
        case .assistant:
            "sparkles"
        case .system:
            "gearshape"
        case .tool:
            "terminal"
        }
    }

    private var backgroundStyle: Color {
        if isUser {
            WorkbenchTheme.accent
        } else if isTool {
            WorkbenchTheme.accentSoft.opacity(0.75)
        } else {
            WorkbenchTheme.panel
        }
    }
}

private struct AttachmentIDStrip: View {
    let attachmentIDs: [String]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack {
                ForEach(attachmentIDs, id: \.self) { attachmentID in
                    Label(attachmentID, systemImage: "paperclip")
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(.black.opacity(0.07), in: Capsule())
                }
            }
        }
    }
}
