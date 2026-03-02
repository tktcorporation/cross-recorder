---
"cross-recorder": patch
---

Fix system audio recording failures and unresponsive recording button.

- Allow retry from error state in state machine (button no longer freezes after error)
- Try audio-only getDisplayMedia before falling back to video (avoids NotReadableError)
- Restore try-catch around applyConstraints for CEF compatibility (regression from b702209)
- Fix useEffect dependency on handleStateTransition that could cancel active recordings on re-render
