---
"cross-recorder": patch
---

Fix `NativeTranscription.transcribe()` failing with a confusing JSON parse
error whenever the native speech-recognition binary wrote a non-JSON status
line, or nothing at all, to stderr on success.
