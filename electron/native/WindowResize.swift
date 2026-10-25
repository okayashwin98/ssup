import AppKit
import ApplicationServices
import Foundation

// Resizes another app's window through Accessibility, for the picker's Resize presets.
// Input (argv[1]): {"pid", "x", "y", "width", "height", "newWidth", "newHeight"} in global
// top-left points. The window is the app's one closest to that frame. It keeps its
// top-left corner unless the new size would leave the screen, then it moves just enough.
// Output: the window's frame afterwards, {"x", "y", "width", "height"}.

struct Request: Decodable {
	let pid: Int32
	let x: Double
	let y: Double
	let width: Double
	let height: Double
	let newWidth: Double
	let newHeight: Double
}

func fail(_ message: String) -> Never {
	FileHandle.standardError.write(Data("\(message)\n".utf8))
	exit(1)
}

func axValue(_ element: AXUIElement, _ attribute: String) -> AXValue? {
	var raw: CFTypeRef?
	guard AXUIElementCopyAttributeValue(element, attribute as CFString, &raw) == .success,
		  let raw, CFGetTypeID(raw) == AXValueGetTypeID() else { return nil }
	return (raw as! AXValue)
}

func frame(of window: AXUIElement) -> CGRect? {
	var origin = CGPoint.zero
	var size = CGSize.zero
	guard let position = axValue(window, kAXPositionAttribute),
		  AXValueGetValue(position, .cgPoint, &origin),
		  let extent = axValue(window, kAXSizeAttribute),
		  AXValueGetValue(extent, .cgSize, &size) else { return nil }
	return CGRect(origin: origin, size: size)
}

func setPosition(_ window: AXUIElement, _ point: CGPoint) -> Bool {
	var copy = point
	guard let value = AXValueCreate(.cgPoint, &copy) else { return false }
	return AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, value) == .success
}

func setSize(_ window: AXUIElement, _ size: CGSize) -> Bool {
	var copy = size
	guard let value = AXValueCreate(.cgSize, &copy) else { return false }
	return AXUIElementSetAttributeValue(window, kAXSizeAttribute as CFString, value) == .success
}

guard CommandLine.arguments.count >= 2,
	  let data = CommandLine.arguments[1].data(using: .utf8),
	  let request = try? JSONDecoder().decode(Request.self, from: data) else {
	fail("Invalid request")
}
guard AXIsProcessTrusted() else { fail("Accessibility permission is required to resize windows") }

let app = AXUIElementCreateApplication(request.pid)
var windowsRef: CFTypeRef?
guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &windowsRef) == .success,
	  let windows = windowsRef as? [AXUIElement], !windows.isEmpty else {
	fail("The window could not be found")
}
let target = CGRect(x: request.x, y: request.y, width: request.width, height: request.height)
let distance = { (rect: CGRect) in
	abs(rect.minX - target.minX) + abs(rect.minY - target.minY)
		+ abs(rect.width - target.width) + abs(rect.height - target.height)
}
guard let window = windows
	.compactMap({ window in frame(of: window).map { (window, $0) } })
	.min(by: { distance($0.1) < distance($1.1) })?.0 else {
	fail("The window could not be found")
}

// Keep the window on the screen it is on: shift it left/up when the new size overflows.
let primaryHeight = NSScreen.screens.first?.frame.height ?? 0
let screen = NSScreen.screens.first { screen in
	// NSScreen frames are bottom-left; turn them into top-left to compare with AX.
	let visible = screen.visibleFrame
	let topLeft = CGRect(
		x: visible.minX,
		y: primaryHeight - visible.maxY,
		width: visible.width,
		height: visible.height
	)
	return topLeft.contains(CGPoint(x: target.midX, y: target.midY))
}
var origin = target.origin
if let screen {
	let visible = screen.visibleFrame
	let bounds = CGRect(
		x: visible.minX,
		y: primaryHeight - visible.maxY,
		width: visible.width,
		height: visible.height
	)
	origin.x = max(bounds.minX, min(origin.x, bounds.maxX - request.newWidth))
	origin.y = max(bounds.minY, min(origin.y, bounds.maxY - request.newHeight))
}

_ = setPosition(window, origin)
guard setSize(window, CGSize(width: request.newWidth, height: request.newHeight)) else {
	fail("This window cannot be resized")
}

let result = frame(of: window) ?? CGRect(origin: origin, size: CGSize(width: request.newWidth, height: request.newHeight))
print("{\"x\":\(result.minX),\"y\":\(result.minY),\"width\":\(result.width),\"height\":\(result.height)}")
