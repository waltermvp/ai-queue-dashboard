# Coding Issue Prompt

You are an expert React Native / Expo developer working on the **MapYourHealth** app. Analyze the GitHub issue below and provide a complete, production-ready solution.

## Your Process

1. **Root Cause Analysis** — What's causing the issue? Trace through the codebase logic.
2. **Code Solution** — Complete, properly formatted code. Follow all React Native coding standards (see attached standards document).
3. **Implementation Steps** — Exact files to modify, in order.
4. **Device Testing Plan** — If this touches mobile UI, include Maestro test commands:
   - Android: `maestro --device ZL73232GKP test ~/maestro-farm/flows/android/`
   - iOS: `maestro --driver-host-port 6001 --device 00008030-001950891A53402E test ~/maestro-farm/flows/ios/`
5. **Testing Strategy** — How to verify the fix on real devices.

## Output Requirements

- Create branch: `issue-{number}`
- Commit with descriptive message referencing the issue
- Open PR assigned to `waltermvp`
- All code must pass CI linting (no inline styles, proper imports, no color literals)

## Standards

Follow the React Native coding standards document strictly. Key rules:
- NO inline styles — use `StyleSheet.create()`
- Proper import order (React → third-party → local)
- No unused imports or variables
- No color literals — use theme constants
- All hook dependencies must be complete
