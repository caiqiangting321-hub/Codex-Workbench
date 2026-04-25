import SwiftUI

enum WorkbenchTheme {
    static let pageBackground = Color(red: 0.965, green: 0.957, blue: 0.925)
    static let panel = Color(red: 0.996, green: 0.988, blue: 0.955)
    static let ink = Color(red: 0.105, green: 0.12, blue: 0.12)
    static let mutedInk = Color(red: 0.39, green: 0.42, blue: 0.40)
    static let line = Color.black.opacity(0.09)
    static let accent = Color(red: 0.05, green: 0.36, blue: 0.30)
    static let accentSoft = Color(red: 0.80, green: 0.91, blue: 0.84)
    static let warning = Color(red: 0.83, green: 0.47, blue: 0.18)
    static let danger = Color(red: 0.72, green: 0.18, blue: 0.16)
}

struct WorkbenchCard<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .background(WorkbenchTheme.panel, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .stroke(WorkbenchTheme.line)
            }
            .shadow(color: .black.opacity(0.05), radius: 16, y: 10)
    }
}

struct StatusPill: View {
    var text: String
    var systemImage: String?
    var tint: Color = WorkbenchTheme.accent

    var body: some View {
        Label {
            Text(text)
                .font(.caption.weight(.semibold))
        } icon: {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.caption.weight(.bold))
            }
        }
        .labelStyle(.titleAndIcon)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .foregroundStyle(tint)
        .background(tint.opacity(0.12), in: Capsule())
    }
}

struct EmptyStateView: View {
    var title: String
    var message: String
    var systemImage: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 38, weight: .semibold))
                .foregroundStyle(WorkbenchTheme.accent)
            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(WorkbenchTheme.ink)
            Text(message)
                .font(.callout)
                .multilineTextAlignment(.center)
                .foregroundStyle(WorkbenchTheme.mutedInk)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(32)
    }
}
