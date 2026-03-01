---
"cross-recorder": patch
---

Fix system audio recording stopping immediately and Command+Q not working

- Simplify getDisplayMedia audio constraints to avoid OverconstrainedError in CEF
- Add track ended event listeners to detect when display media session terminates
- Add error display in RecordPanel so users can see why recording failed
- Add explicit accelerator keys for Quit and Edit menu items
