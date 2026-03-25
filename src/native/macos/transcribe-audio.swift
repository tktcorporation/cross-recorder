// transcribe-audio.swift
// macOS の Speech.framework (SFSpeechRecognizer) を使用して音声ファイルを文字起こしする。
// API キー不要・オフラインで動作可能（macOS 13+ のオンデバイスモデル使用時）。
//
// Usage: transcribe-audio <wav-file-path> [--language ja-JP] [--check]
// Output: 文字起こしテキストを stdout に出力
// Status: JSON メッセージを stderr に出力 ({"status":"started"}, {"error":"..."})
// macOS 10.15+ 必須（Speech.framework の要件）

import Foundation
import Speech

// MARK: - Configuration

struct Config {
    var filePath: String = ""
    var language: String = "ja-JP"
    var checkOnly: Bool = false
}

func parseArgs() -> Config {
    var config = Config()
    let args = CommandLine.arguments
    var i = 1
    while i < args.count {
        switch args[i] {
        case "--language":
            i += 1
            if i < args.count {
                config.language = args[i]
            }
        case "--check":
            config.checkOnly = true
        default:
            // 最初の非オプション引数をファイルパスとして扱う
            if !args[i].hasPrefix("--") && config.filePath.isEmpty {
                config.filePath = args[i]
            }
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

// MARK: - Transcription

/// SFSpeechRecognizer を使用してローカルで音声ファイルを文字起こしする。
/// macOS 13+ ではオンデバイスモデルが利用可能で、ネットワーク不要。
/// それ以前のバージョンでは Apple のサーバーに音声が送信される。
@available(macOS 10.15, *)
func transcribeFile(filePath: String, language: String) {
    let fileURL = URL(fileURLWithPath: filePath)

    guard FileManager.default.fileExists(atPath: filePath) else {
        writeStatus(["error": "File not found: \(filePath)"])
        exit(1)
    }

    let locale = Locale(identifier: language)
    guard let recognizer = SFSpeechRecognizer(locale: locale) else {
        writeStatus(["error": "Speech recognizer not available for language: \(language)"])
        exit(1)
    }

    guard recognizer.isAvailable else {
        writeStatus(["error": "Speech recognizer is not available. Check system settings."])
        exit(1)
    }

    // 権限チェック
    let semaphore = DispatchSemaphore(value: 0)
    var authStatus: SFSpeechRecognizerAuthorizationStatus = .notDetermined

    SFSpeechRecognizer.requestAuthorization { status in
        authStatus = status
        semaphore.signal()
    }
    semaphore.wait()

    guard authStatus == .authorized else {
        let reason: String
        switch authStatus {
        case .denied:
            reason = "Speech recognition permission denied. Enable in System Settings > Privacy & Security > Speech Recognition."
        case .restricted:
            reason = "Speech recognition is restricted on this device."
        case .notDetermined:
            reason = "Speech recognition permission not determined."
        default:
            reason = "Speech recognition authorization failed."
        }
        writeStatus(["error": reason])
        exit(1)
    }

    let request = SFSpeechURLRecognitionRequest(url: fileURL)

    // macOS 13+ ではオンデバイス認識を強制し、プライバシーを保護
    if #available(macOS 13, *) {
        request.requiresOnDeviceRecognition = true
    }

    writeStatus(["status": "started"])

    let resultSemaphore = DispatchSemaphore(value: 0)

    recognizer.recognitionTask(with: request) { result, error in
        if let error = error {
            writeStatus(["error": "Transcription failed: \(error.localizedDescription)"])
            exit(1)
        }

        guard let result = result else { return }

        if result.isFinal {
            // 最終結果を stdout に出力
            let text = result.bestTranscription.formattedString
            FileHandle.standardOutput.write(Data(text.utf8))
            writeStatus(["status": "completed"])
            resultSemaphore.signal()
        }
    }

    // 完了を待つ（最大5分）
    let waitResult = resultSemaphore.wait(timeout: .now() + 300)
    if waitResult == .timedOut {
        writeStatus(["error": "Transcription timed out after 5 minutes"])
        exit(1)
    }
}

// MARK: - Main

if #available(macOS 10.15, *) {
    let config = parseArgs()

    if config.checkOnly {
        // --check: Speech.framework の利用可否を確認して終了
        let semaphore = DispatchSemaphore(value: 0)

        SFSpeechRecognizer.requestAuthorization { status in
            switch status {
            case .authorized:
                // 指定言語のサポートも確認
                let recognizer = SFSpeechRecognizer(locale: Locale(identifier: config.language))
                if let recognizer = recognizer, recognizer.isAvailable {
                    writeStatus(["check": "ok"])
                } else {
                    writeStatus([
                        "check": "ok",
                        "warning": "Language '\(config.language)' may not be fully supported"
                    ])
                }
            case .denied:
                writeStatus([
                    "check": "error",
                    "reason": "Permission denied",
                    "hint": "System Settings > Privacy & Security > Speech Recognition"
                ])
            case .restricted:
                writeStatus(["check": "error", "reason": "Speech recognition is restricted"])
            case .notDetermined:
                writeStatus(["check": "error", "reason": "Permission not determined"])
            @unknown default:
                writeStatus(["check": "error", "reason": "Unknown authorization status"])
            }
            semaphore.signal()
        }

        semaphore.wait()
        exit(0)
    }

    // ファイルパスが必須
    guard !config.filePath.isEmpty else {
        writeStatus(["error": "Usage: transcribe-audio <wav-file-path> [--language ja-JP] [--check]"])
        exit(1)
    }

    transcribeFile(filePath: config.filePath, language: config.language)
} else {
    writeStatus(["error": "macOS 10.15 or later is required for speech recognition"])
    exit(1)
}
