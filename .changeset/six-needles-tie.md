---
"cross-recorder": patch
---

Fix `NativeTranscription.transcribe()` failing with a confusing JSON parse
error whenever the native speech-recognition binary wrote a non-JSON status
line, or nothing at all, to stderr on success.

Fix `capture-system-audio.sh` (Linux system-audio capture) hanging
indefinitely if invoked with a value-less `--sample-rate`/`--channels`
flag, and silently accepting a non-numeric value or an unknown option.
`NativeSystemAudioCapture`'s stderr error reporting also now keeps
listening for further errors if reporting one itself fails.
