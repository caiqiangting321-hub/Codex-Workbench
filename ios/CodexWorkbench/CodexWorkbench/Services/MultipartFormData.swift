import Foundation

struct MultipartFormData {
    private let boundary: String
    private var data = Data()

    init(boundary: String) {
        self.boundary = boundary
    }

    func addingFile(
        fieldName: String,
        fileName: String,
        contentType: String,
        data fileData: Data
    ) -> MultipartFormData {
        var copy = self
        copy.append("--\(boundary)\r\n")
        copy.append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(fileName)\"\r\n")
        copy.append("Content-Type: \(contentType)\r\n\r\n")
        copy.data.append(fileData)
        copy.append("\r\n")
        return copy
    }

    func finalizedData() -> Data {
        var copy = data
        copy.appendString("--\(boundary)--\r\n")
        return copy
    }

    private mutating func append(_ string: String) {
        data.appendString(string)
    }
}

private extension Data {
    mutating func appendString(_ string: String) {
        append(Data(string.utf8))
    }
}
