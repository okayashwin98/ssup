// Finds "um" and "uh" in speech with the Clarity filler detector (MIT, arkaydeus).
// Usage: recordly-filler-detector <model.mlmodelc> <audio.f32> <out.csv>
// The audio is raw 16 kHz mono float32. Each output line is one 10 ms frame:
// "<um + uh probability>,<speech probability>".
import CoreML
import Foundation

let args = CommandLine.arguments
guard args.count == 4 else {
	FileHandle.standardError.write("usage: recordly-filler-detector model.mlmodelc audio.f32 out.csv\n".data(using: .utf8)!)
	exit(2)
}
// The model's half-precision layers give wrong scores on the Neural Engine; the CPU is fast enough.
let config = MLModelConfiguration()
config.computeUnits = .cpuOnly
let model = try MLModel(contentsOf: URL(fileURLWithPath: args[1]), configuration: config)
let samples: [Float] = try Data(contentsOf: URL(fileURLWithPath: args[2])).withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }

// 6 s windows every 5 s; each frame is taken from a window where it is at least 0.5 s from an edge.
let window = 96000, hop = 80000, framesPerWindow = 600, margin = 50, frameSamples = 160
let frameCount = samples.count / frameSamples + 1
var filler = [Float](repeating: 0, count: frameCount)
var speech = [Float](repeating: 0, count: frameCount)
var start = 0
while true {
	let input = try MLMultiArray(shape: [1, NSNumber(value: window)], dataType: .float32)
	let pointer = input.dataPointer.bindMemory(to: Float.self, capacity: window)
	for i in 0..<window { pointer[i] = start + i < samples.count ? samples[start + i] : 0 }
	let output = try model.prediction(from: MLDictionaryFeatureProvider(dictionary: ["audio": input]))
	guard let probs = output.featureValue(for: "probs")?.multiArrayValue else { exit(3) }
	let isFirst = start == 0, isLast = start + window >= samples.count
	for f in 0..<framesPerWindow {
		if (!isFirst && f < margin) || (!isLast && f >= framesPerWindow - margin) { continue }
		let g = start / frameSamples + f
		if g >= frameCount { break }
		// Classes: other, speech, um, uh, stutter.
		speech[g] = probs[[0, NSNumber(value: f), 1]].floatValue
		filler[g] = probs[[0, NSNumber(value: f), 2]].floatValue + probs[[0, NSNumber(value: f), 3]].floatValue
	}
	if isLast { break }
	start += hop
}
var lines = ""
lines.reserveCapacity(frameCount * 12)
for g in 0..<frameCount { lines += String(format: "%.3f,%.3f\n", filler[g], speech[g]) }
try lines.write(toFile: args[3], atomically: true, encoding: .utf8)
