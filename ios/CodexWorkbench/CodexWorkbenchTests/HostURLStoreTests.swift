import XCTest
@testable import CodexWorkbench

final class HostURLStoreTests: XCTestCase {
    func testDefaultHostUsesLANService() {
        XCTAssertEqual(
            HostURLStore.defaultHostString,
            "http://192.168.1.204:8787/"
        )
    }

    func testNormalizedURLAddsHTTPSchemeAndTrailingSlash() {
        let url = HostURLStore.normalizedURL(from: "127.0.0.1:8787")

        XCTAssertEqual(url?.absoluteString, "http://127.0.0.1:8787/")
    }

    func testNormalizedURLKeepsHTTPS() {
        let url = HostURLStore.normalizedURL(from: "https://workbench.example.test")

        XCTAssertEqual(url?.absoluteString, "https://workbench.example.test/")
    }

    func testNormalizedURLRejectsUnsupportedSchemes() {
        XCTAssertNil(HostURLStore.normalizedURL(from: "file:///tmp/workbench"))
    }
}
