import AppKit

// Follows System Settings' window so SuperShare can place its drag helper below it.
// Geometry only: SuperShare draws the helper and starts the file drag itself. This
// process never asks for, reads or grants any permission.
private func emit(_ event: String) {
    FileHandle.standardOutput.write(Data((event + "\n").utf8))
}

func option(_ name: String) -> String? {
    guard let index = CommandLine.arguments.firstIndex(of: name), index + 1 < CommandLine.arguments.count else { return nil }
    return CommandLine.arguments[index + 1]
}

final class SettingsFollower {
    let parentPID: Int32
    let width: CGFloat
    let height: CGFloat
    private var timer: Timer?
    private var sawSettings = false
    private let start = Date()
    private var lastEvent = ""

    init(parentPID: Int32, width: CGFloat, height: CGFloat) {
        self.parentPID = parentPID
        self.width = width
        self.height = height
    }

    func startFollowing() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.3, repeats: true) { [weak self] _ in self?.update() }
        emit("ready")
        update()
    }

    private func publish(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
              let event = String(data: data, encoding: .utf8), event != lastEvent else { return }
        lastEvent = event
        emit(event)
    }

    private func update() {
        // Ends with SuperShare, after five minutes, or once System Settings has closed.
        guard kill(parentPID, 0) == 0, Date().timeIntervalSince(start) < 300 else { NSApp.terminate(nil); return }
        let settings = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.systempreferences").first
        guard let settings, !settings.isTerminated else {
            publish(["visible": false])
            if sawSettings || Date().timeIntervalSince(start) > 10 { NSApp.terminate(nil) }
            return
        }
        // Shown only while System Settings or SuperShare is in front.
        let front = NSWorkspace.shared.frontmostApplication?.processIdentifier
        guard front == settings.processIdentifier || front == parentPID else { publish(["visible": false]); return }
        // Window bounds only: no screenshots, window titles or accessibility elements.
        let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
        guard let info = windows.first(where: {
            ($0[kCGWindowOwnerPID as String] as? Int32) == settings.processIdentifier &&
            ($0[kCGWindowLayer as String] as? Int) == 0 &&
            (($0[kCGWindowBounds as String] as? [String: CGFloat])?["Width"] ?? 0) > 300
        }), let bounds = info[kCGWindowBounds as String] as? [String: Any],
            let rect = CGRect(dictionaryRepresentation: bounds as CFDictionary), let primary = NSScreen.screens.first else {
            publish(["visible": false])
            return
        }
        sawSettings = true
        let cocoaRect = NSRect(x: rect.minX, y: primary.frame.maxY - rect.maxY, width: rect.width, height: rect.height)
        let screen = NSScreen.screens.max { $0.frame.intersection(cocoaRect).area < $1.frame.intersection(cocoaRect).area } ?? primary
        let visible = screen.visibleFrame
        // Below the window's right edge, kept on its screen.
        let x = min(max(cocoaRect.maxX - width, visible.minX), visible.maxX - width)
        let y = max(visible.minY + 8, cocoaRect.minY - height - 8)
        publish(["visible": true, "x": Int(x.rounded()), "y": Int((primary.frame.maxY - y - height).rounded()),
                 "width": Int(width), "height": Int(height)])
    }
}

private extension CGRect { var area: CGFloat { isNull ? 0 : width * height } }
let application = NSApplication.shared
application.setActivationPolicy(.accessory)
guard let bundle = option("--app-bundle"), bundle.hasSuffix(".app"),
      FileManager.default.fileExists(atPath: bundle),
      let permission = option("--permission"), ["screen", "accessibility"].contains(permission),
      let width = Double(option("--width") ?? ""), let height = Double(option("--height") ?? ""),
      width > 0, height > 0 else {
    fputs("Expected an existing --app-bundle, --permission screen|accessibility, --width and --height\n", stderr)
    exit(2)
}
let follower = SettingsFollower(
    parentPID: Int32(option("--parent-pid") ?? "") ?? getppid(),
    width: CGFloat(width),
    height: CGFloat(height)
)
DispatchQueue.global().async {
    while let line = readLine() {
        if line == "close" { DispatchQueue.main.async { NSApp.terminate(nil) }; return }
    }
    DispatchQueue.main.async { NSApp.terminate(nil) }
}
follower.startFollowing()
application.run()
