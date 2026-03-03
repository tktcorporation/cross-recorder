// capture-system-audio.swift
// Captures system audio using ScreenCaptureKit and outputs raw PCM Int16LE to stdout.
// Requires macOS 13.0+.
//
// Usage: capture-system-audio [--sample-rate 48000] [--channels 2]
// Output: Raw PCM Int16LE interleaved data on stdout
// Status: JSON messages on stderr ({"status":"started"}, {"level":0.42}, {"error":"..."})
// Stop:   SIGTERM or SIGINT

import Foundation
import ScreenCaptureKit
import CoreMedia

// MARK: - Configuration

struct Config {
    var sampleRate: Int = 48000
    var channels: Int = 2
}

func parseArgs() -> Config {
    var config = Config()
    let args = CommandLine.arguments
    var i = 1
    while i < args.count {
        switch args[i] {
        case "--sample-rate":
            i += 1
            if i < args.count, let rate = Int(args[i]) {
                config.sampleRate = rate
            }
        case "--channels":
            i += 1
            if i < args.count, let ch = Int(args[i]) {
                config.channels = ch
            }
        default:
            break
        }
        i += 1
    }
    return config
}

func writeStatus(_ dict: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: dict),
       let str = String(data: data, encoding: .utf8) {
        FileHandle.standardError.write(Data((str + "\n").utf8))
    }
}

// MARK: - Audio Recorder

@available(macOS 13.0, *)
class SystemAudioRecorder: NSObject, SCStreamDelegate, SCStreamOutput {
    private var stream: SCStream?
    private let config: Config
    private var isRunning = false
    private let stdoutHandle = FileHandle.standardOutput
    private var levelAccumulator: Float = 0
    private var levelSampleCount: Int = 0
    private let levelReportInterval: Int

    init(config: Config) {
        self.config = config
        // Report level approximately every 100ms
        self.levelReportInterval = config.sampleRate / 10
        super.init()
    }

    func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(
            false, onScreenWindowsOnly: false
        )

        guard let display = content.displays.first else {
            writeStatus(["error": "No displays found"])
            exit(1)
        }

        let filter = SCContentFilter(
            display: display,
            excludingApplications: [],
            exceptingWindows: []
        )

        let streamConfig = SCStreamConfiguration()
        streamConfig.capturesAudio = true
        streamConfig.excludesCurrentProcessAudio = true
        streamConfig.sampleRate = config.sampleRate
        streamConfig.channelCount = config.channels

        // Minimize video overhead — SCStream requires a display anchor but we
        // only need audio. Use the smallest possible frame at 1 fps.
        streamConfig.width = 2
        streamConfig.height = 2
        streamConfig.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        streamConfig.showsCursor = false

        stream = SCStream(
            filter: filter,
            configuration: streamConfig,
            delegate: self
        )
        try stream?.addStreamOutput(
            self,
            type: .audio,
            sampleHandlerQueue: DispatchQueue(
                label: "audio-capture",
                qos: .userInteractive
            )
        )
        try await stream?.startCapture()
        isRunning = true
        writeStatus(["status": "started"])
    }

    func stop() async {
        guard isRunning else { return }
        isRunning = false
        try? await stream?.stopCapture()
        stream = nil
        writeStatus(["status": "stopped"])
    }

    // MARK: SCStreamOutput

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .audio, isRunning else { return }

        guard let blockBuffer = sampleBuffer.dataBuffer else { return }
        let length = CMBlockBufferGetDataLength(blockBuffer)
        guard length > 0 else { return }

        var dataPointer: UnsafeMutablePointer<Int8>?
        var lengthAtOffset: Int = 0
        let status = CMBlockBufferGetDataPointer(
            blockBuffer,
            atOffset: 0,
            lengthAtOffsetOut: &lengthAtOffset,
            totalLengthOut: nil,
            dataPointerOut: &dataPointer
        )

        guard status == kCMBlockBufferNoErr, let ptr = dataPointer else { return }

        // ScreenCaptureKit outputs Float32 PCM — convert to Int16LE
        let float32Count = length / MemoryLayout<Float32>.size
        let floatPtr = UnsafeRawPointer(ptr).bindMemory(
            to: Float32.self, capacity: float32Count
        )

        var int16Data = Data(count: float32Count * MemoryLayout<Int16>.size)
        int16Data.withUnsafeMutableBytes { rawBuf in
            let int16Ptr = rawBuf.bindMemory(to: Int16.self)
            for i in 0..<float32Count {
                let sample = max(-1.0, min(1.0, floatPtr[i]))
                int16Ptr[i] = Int16(sample * 32767.0)

                // Accumulate RMS for level reporting
                levelAccumulator += sample * sample
                levelSampleCount += 1
            }
        }

        // Write PCM data to stdout
        stdoutHandle.write(int16Data)

        // Report audio level periodically
        if levelSampleCount >= levelReportInterval {
            let rms = sqrt(levelAccumulator / Float(levelSampleCount))
            let level = min(1.0, rms * 2.0)
            writeStatus(["level": level])
            levelAccumulator = 0
            levelSampleCount = 0
        }
    }

    // MARK: SCStreamDelegate

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        writeStatus(["error": "Stream stopped: \(error.localizedDescription)"])
        isRunning = false
        exit(1)
    }
}

// MARK: - Main

if #available(macOS 13.0, *) {
    let config = parseArgs()
    let recorder = SystemAudioRecorder(config: config)

    // Handle SIGTERM
    let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    signal(SIGTERM, SIG_IGN)
    termSource.setEventHandler {
        Task {
            await recorder.stop()
            exit(0)
        }
    }
    termSource.resume()

    // Handle SIGINT
    let intSource = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    signal(SIGINT, SIG_IGN)
    intSource.setEventHandler {
        Task {
            await recorder.stop()
            exit(0)
        }
    }
    intSource.resume()

    Task {
        do {
            try await recorder.start()
        } catch {
            writeStatus(["error": error.localizedDescription])
            exit(1)
        }
    }

    RunLoop.main.run()
} else {
    writeStatus(["error": "macOS 13.0 or later is required for system audio capture"])
    exit(1)
}
