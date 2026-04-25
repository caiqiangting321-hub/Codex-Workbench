import SwiftUI

struct ComposerView: View {
    @Binding var draft: String
    @Binding var selectedModel: String?
    let models: [ModelOption]
    let isRunning: Bool
    let send: () -> Void
    let stop: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                ModelMenu(selectedModel: $selectedModel, models: models)
                Spacer()
                Text("Attachments upload after host contract validation.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            HStack(alignment: .bottom, spacing: 10) {
                Button {
                    // File importer wiring belongs in the upload milestone.
                } label: {
                    Image(systemName: "paperclip")
                        .font(.title3)
                }
                .buttonStyle(.bordered)
                .accessibilityLabel("Attach file")

                TextField("Message CODEX WORKBENCH", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...5)

                Button(action: isRunning ? stop : send) {
                    Image(systemName: isRunning ? "stop.fill" : "arrow.up")
                        .font(.headline)
                        .frame(width: 20, height: 20)
                }
                .buttonStyle(.borderedProminent)
                .tint(isRunning ? WorkbenchTheme.danger : WorkbenchTheme.accent)
                .disabled(!isRunning && draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel(isRunning ? "Stop response" : "Send message")
            }
        }
        .padding()
        .background(WorkbenchTheme.panel)
    }
}

private struct ModelMenu: View {
    @Binding var selectedModel: String?
    let models: [ModelOption]

    var body: some View {
        Menu {
            Button("Default") {
                selectedModel = nil
            }
            ForEach(models) { model in
                Button(model.displayName) {
                    selectedModel = model.id
                }
            }
        } label: {
            Label(selectedTitle, systemImage: "cpu")
                .font(.caption.weight(.semibold))
        }
        .buttonStyle(.bordered)
    }

    private var selectedTitle: String {
        guard let selectedModel else {
            return "Default model"
        }
        return models.first { $0.id == selectedModel }?.displayName ?? selectedModel
    }
}
