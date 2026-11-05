// Added by By Mel Ross. Person matte with Apple Vision (VNGeneratePersonSegmentationRequest), which is built into macOS and runs
// on this computer. Reads a video and writes one raw 8-bit gray frame (W x H, white = person) per video frame to stdout.
// cutout.py compiles this and pipes it into ffmpeg; run it by hand as:
//   cutout-matte <in.mp4> <W> <H> [accurate|balanced|fast] | ffmpeg -f rawvideo -pix_fmt gray -s WxH -r 30 -i - ...
import AVFoundation
import CoreImage
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count >= 4, let W = Int(args[2]), let H = Int(args[3]) else {
    FileHandle.standardError.write("usage: cutout-matte <in.mp4> <W> <H> [accurate|balanced|fast]\n".data(using: .utf8)!)
    exit(2)
}
let quality: VNGeneratePersonSegmentationRequest.QualityLevel =
    args.count > 4 && args[4] == "fast" ? .fast : (args.count > 4 && args[4] == "balanced" ? .balanced : .accurate)

let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
guard let track = asset.tracks(withMediaType: .video).first, let reader = try? AVAssetReader(asset: asset) else {
    FileHandle.standardError.write("cannot read video\n".data(using: .utf8)!)
    exit(3)
}
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(output)
reader.startReading()

let request = VNGeneratePersonSegmentationRequest()
request.qualityLevel = quality
request.outputPixelFormat = kCVPixelFormatType_OneComponent8
let sequence = VNSequenceRequestHandler()          // stateful across frames: steadier edges
let context = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull()])
var gray = [UInt8](repeating: 0, count: W * H)
var frames = 0

while let sample = output.copyNextSampleBuffer() {
    guard let pixels = CMSampleBufferGetImageBuffer(sample) else { continue }
    do { try sequence.perform([request], on: pixels) } catch { gray = [UInt8](repeating: 0, count: W * H) }
    if let mask = request.results?.first?.pixelBuffer {
        let image = CIImage(cvPixelBuffer: mask)
        let scaled = image.transformed(by: CGAffineTransform(scaleX: CGFloat(W) / image.extent.width, y: CGFloat(H) / image.extent.height))
        gray.withUnsafeMutableBytes { p in
            context.render(scaled, toBitmap: p.baseAddress!, rowBytes: W, bounds: CGRect(x: 0, y: 0, width: W, height: H), format: .L8, colorSpace: nil)
        }
    }
    FileHandle.standardOutput.write(Data(gray))      // always one frame out per frame in, so the matte stays frame-locked
    frames += 1
}
FileHandle.standardError.write("matte: \(frames) frames, \(W)x\(H)\n".data(using: .utf8)!)
