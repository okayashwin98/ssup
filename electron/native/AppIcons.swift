import AppKit
import Foundation

// Sharp app icons for the picker's window cards, from macOS itself (as the Dock shows them).
// Input: argv[1] is the icon's size in pixels, then one or more process ids.
// Output: {"<pid>": "data:image/png;base64,…"} for every pid that belongs to an app.

func png(of image: NSImage, size: Int) -> Data? {
	guard let bitmap = NSBitmapImageRep(
		bitmapDataPlanes: nil,
		pixelsWide: size,
		pixelsHigh: size,
		bitsPerSample: 8,
		samplesPerPixel: 4,
		hasAlpha: true,
		isPlanar: false,
		colorSpaceName: .deviceRGB,
		bytesPerRow: 0,
		bitsPerPixel: 0
	) else { return nil }
	NSGraphicsContext.saveGraphicsState()
	NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
	NSGraphicsContext.current?.imageInterpolation = .high
	image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
	NSGraphicsContext.restoreGraphicsState()
	return bitmap.representation(using: .png, properties: [:])
}

let arguments = CommandLine.arguments.dropFirst()
guard let size = arguments.first.flatMap({ Int($0) }), size > 0, size <= 1024 else {
	FileHandle.standardError.write(Data("Usage: recordly-app-icons <size> <pid>...\n".utf8))
	exit(1)
}

var icons: [String: String] = [:]
for pid in Set(arguments.dropFirst().compactMap { Int32($0) }) {
	guard let app = NSRunningApplication(processIdentifier: pid),
		  let icon = app.icon,
		  let data = png(of: icon, size: size) else { continue }
	icons[String(pid)] = "data:image/png;base64," + data.base64EncodedString()
}
let output = try JSONSerialization.data(withJSONObject: icons)
FileHandle.standardOutput.write(output)
