---
"cross-recorder": patch
---

Fix `NativeTranscription.transcribe()` silently failing whenever the native
speech-recognition binary wrote a non-JSON status line (or nothing) to
stderr on success. Added Vitest coverage for the native audio wrappers and
ShellCheck/bats coverage for the Linux capture script, both runnable in a
Linux-only environment.
