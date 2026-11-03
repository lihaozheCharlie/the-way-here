// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "TheWayHereMobile",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "TWHCore", targets: ["TWHCore"]), .executable(name: "verify-mobile-core", targets: ["CoreVerification"])],
    targets: [.target(name: "TWHCore"), .executableTarget(name: "CoreVerification", dependencies: ["TWHCore"], path: "Verification"), .testTarget(name: "TWHCoreTests", dependencies: ["TWHCore"])]
)
