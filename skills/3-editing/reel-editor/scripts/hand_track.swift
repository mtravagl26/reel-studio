// Added by By Mel Ross (0.23.0): a gold sparkle trail that follows the hand. Hand tracking with Apple Vision
// (VNDetectHumanHandPoseRequest), built into macOS, runs on this computer, nothing is downloaded or sent.
// Reads a video and prints JSON to stdout: {"fps":30,"w":1080,"h":1920,"frames":[{"t":0.033,"hands":[{"side":"left","conf":0.9,"palm":[x,y],"wrist":[x,y],"index":[x,y],"tips":[[x,y],...]}]}]}
// Points are in pixels, origin top-left, of the video as stored. Usage: hand-track <in.mp4> [maxHands]
import AVFoundation
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count >= 2 else {
    FileHandle.standardError.write("usage: hand-track <in.mp4> [maxHands]\n".data(using: .utf8)!)
    exit(2)
}
let maxHands = args.count > 2 ? (Int(args[2]) ?? 2) : 2
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
guard let track = asset.tracks(withMediaType: .video).first, let reader = try? AVAssetReader(asset: asset) else {
    FileHandle.standardError.write("cannot read video\n".data(using: .utf8)!)
    exit(3)
}
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(output)
reader.startReading()

let request = VNDetectHumanHandPoseRequest()
request.maximumHandCount = maxHands
let sequence = VNSequenceRequestHandler()
let fps = Double(track.nominalFrameRate > 0 ? track.nominalFrameRate : 30)
var frames: [String] = []
var W = 0, H = 0
var n = 0
func r2(_ v: Double) -> String { String(format: "%.1f", v) }

while let sample = output.copyNextSampleBuffer() {
    guard let pixels = CMSampleBufferGetImageBuffer(sample) else { continue }
    W = CVPixelBufferGetWidth(pixels); H = CVPixelBufferGetHeight(pixels)
    let t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
    var hands: [String] = []
    if (try? sequence.perform([request], on: pixels)) != nil, let obs = request.results {
        for o in obs {
            guard let pts = try? o.recognizedPoints(.all) else { continue }
            func pt(_ k: VNHumanHandPoseObservation.JointName, _ minConf: Float = 0.2) -> (Double, Double)? {
                guard let p = pts[k], p.confidence >= minConf else { return nil }
                return (Double(p.location.x) * Double(W), (1 - Double(p.location.y)) * Double(H))
            }
            let mcps = [pt(.indexMCP), pt(.middleMCP), pt(.ringMCP), pt(.littleMCP), pt(.wrist)].compactMap { $0 }
            if mcps.count < 3 { continue }                     // too little of the hand to place a trail
            let palm = (mcps.map { $0.0 }.reduce(0, +) / Double(mcps.count), mcps.map { $0.1 }.reduce(0, +) / Double(mcps.count))
            let tipNames: [VNHumanHandPoseObservation.JointName] = [.thumbTip, .indexTip, .middleTip, .ringTip, .littleTip]
            let tips = tipNames.compactMap { pt($0) }.map { "[\(r2($0.0)),\(r2($0.1))]" }.joined(separator: ",")
            let conf = pts.values.map { Double($0.confidence) }.reduce(0, +) / Double(max(pts.count, 1))
            let wrist = pt(.wrist).map { "[\(r2($0.0)),\(r2($0.1))]" } ?? "null"
            let index = pt(.indexTip).map { "[\(r2($0.0)),\(r2($0.1))]" } ?? "null"
            let side = o.chirality == .left ? "left" : (o.chirality == .right ? "right" : "unknown")
            hands.append("{\"side\":\"\(side)\",\"conf\":\(String(format: "%.2f", conf)),\"palm\":[\(r2(palm.0)),\(r2(palm.1))],\"wrist\":\(wrist),\"index\":\(index),\"tips\":[\(tips)]}")
        }
    }
    frames.append("{\"t\":\(String(format: "%.4f", t)),\"hands\":[\(hands.joined(separator: ","))]}")
    n += 1
}
print("{\"fps\":\(fps),\"w\":\(W),\"h\":\(H),\"frames\":[\(frames.joined(separator: ",\n"))]}")
FileHandle.standardError.write("hands: \(n) frames, \(W)x\(H)\n".data(using: .utf8)!)
