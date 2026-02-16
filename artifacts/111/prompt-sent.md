# E2E Testing Prompt

You are an E2E test automation engineer. Your job is to write **Maestro YAML test flows** for the MapYourHealth React Native app.

## Your Output

Generate one or more Maestro YAML flows as fenced code blocks. Each flow MUST follow this exact format:

```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp:
    clearState: true

- waitForAnimationToEnd

- takeScreenshot: step-name

- assertVisible: "Some Text"

- tapOn: "Button Text"
```

## Maestro YAML Syntax Reference

**ONLY use these commands.** Do not invent commands or properties.

### Launch & Navigation
```yaml
- launchApp                          # Launch with current state
- launchApp:
    clearState: true                 # Fresh launch, clears app data
- back                               # Press Android back button
- hideKeyboard                       # Dismiss keyboard
- waitForAnimationToEnd              # Wait for UI to settle
```

### Tapping
```yaml
- tapOn: "Exact Button Text"         # Tap element by visible text
- tapOn:
    text: "Text"                     # Same as above, explicit form
- tapOn:
    id: "testID"                     # Tap by testID (React Native)
- tapOn:
    index: 0                         # Tap first tappable element
- tapOn:
    text: "Optional Element"
    optional: true                   # Don't fail if not found
```

### Text Input
```yaml
- tapOn:
    id: "email-input"               # First tap the field
- inputText: "user@example.com"     # Then type into it
- eraseText: 5                       # Erase 5 characters
```

### Assertions
```yaml
- assertVisible: "Welcome"           # Assert text is visible
- assertVisible:
    id: "home-screen"               # Assert by testID
- assertNotVisible: "Error"          # Assert text is NOT visible
```

### Screenshots
```yaml
- takeScreenshot: descriptive-name   # Saves screenshot as artifact
```

### Scrolling
```yaml
- scroll                             # Scroll down
- scrollUntilVisible:
    element:
      text: "Delete Account"
    direction: DOWN
    timeout: 10000
```

### Waiting
```yaml
- extendedWaitUntil:
    visible: "Dashboard"
    timeout: 15000                   # Wait up to 15s for element
```

## IMPORTANT RULES

1. **Every flow MUST start with `appId: com.epiphanyapps.mapyourhealth` followed by `---`**
2. **Use ONLY the commands listed above** — no `timeout:` on steps, no `extendedWaitUntil` on `tapOn`, no made-up properties
3. **Use `waitForAnimationToEnd`** after navigation actions — the test device (Moto E13) is slow
4. **Use `optional: true`** for elements that might not exist
5. **Use `takeScreenshot`** at key points for debugging
6. **Prefer text selectors** over testID (more reliable unless you know the exact testID)
7. **Keep flows focused** — one flow per user journey, 10-20 steps max
8. **The app uses AWS Amplify Auth** — login screens may show "Sign In", "Sign Up", email/password fields

## Example: Working Flow

This flow is proven to work on the Moto E13:

```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp:
    clearState: true

- waitForAnimationToEnd

- takeScreenshot: app-launch

- assertVisible: ".*"

- tapOn:
    index: 0
    optional: true

- waitForAnimationToEnd

- takeScreenshot: first-tab

- tapOn:
    text: "Search"
    optional: true

- takeScreenshot: search-area

- back

- waitForAnimationToEnd

- takeScreenshot: after-back

- assertVisible: ".*"

- takeScreenshot: final-state
```

## What NOT to do

❌ `- timeout: 5000` (not a valid Maestro command)
❌ `- tapOn: { text: "X", timeout: 5000 }` (tapOn doesn't have timeout)
❌ `- waitFor: "element"` (not a command — use extendedWaitUntil)
❌ `- click: "button"` (not Maestro — use tapOn)
❌ `- type: "text"` (not Maestro — use inputText)
❌ `- assert: "visible"` (use assertVisible)
❌ Making up element IDs you haven't seen — use text selectors instead


# React Native Coding Standards for AI Queue

## Critical Linting Rules (Prevent CI Failures)

### 1. NO INLINE STYLES
❌ **Wrong:**
```jsx
<View style={{ flex: 1, padding: 10 }}>
```

✅ **Correct:**
```jsx
const styles = StyleSheet.create({
  container: { flex: 1, padding: 10 }
});

<View style={styles.container}>
```

### 2. NO COLOR LITERALS  
❌ **Wrong:**
```jsx
backgroundColor: 'transparent'
backgroundColor: '#ffffff'  
```

✅ **Correct:**
```jsx
// Define in theme/colors or StyleSheet
const colors = {
  transparent: 'transparent',
  white: '#ffffff'
};
backgroundColor: colors.transparent
```

### 3. IMPORT ORDER (React First)
❌ **Wrong:**
```jsx
import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
```

✅ **Correct:**
```jsx
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
```

### 4. PRETTIER FORMATTING
❌ **Wrong:**
```jsx
const obj = {a: 1,b: 2,c: 3};
```

✅ **Correct:**
```jsx
const obj = {
  a: 1,
  b: 2,  
  c: 3,
};
```

### 5. REACT HOOKS DEPENDENCIES
❌ **Wrong:**
```jsx
useEffect(() => {
  doSomething(externalVar);
}, []); // Missing dependency
```

✅ **Correct:**
```jsx
useEffect(() => {
  doSomething(externalVar);
}, [externalVar]); // Include all dependencies
```

### 6. UNUSED IMPORTS
❌ **Wrong:**
```jsx
import React, { useState, useMemo } from 'react'; // useMemo not used
```

✅ **Correct:**
```jsx
import React, { useState } from 'react'; // Only import what's used
```

## AI Prompt Template

When generating React Native code, always:

1. **Use StyleSheet.create()** for all styles
2. **Import React first**, then third-party, then local modules  
3. **Format with proper line breaks** and trailing commas
4. **Include all dependencies** in useEffect/useCallback arrays
5. **Remove unused imports** and variables
6. **Use constants for colors** instead of literals

## Pre-Commit Checklist

Before creating PR:
- [ ] No inline styles (use StyleSheet)
- [ ] React imported before other packages
- [ ] All hook dependencies included  
- [ ] No unused imports
- [ ] Proper Prettier formatting
- [ ] No color literals (use theme/constants)

Run `npm run lint -- --fix` to auto-fix formatting issues.

## E2E Testing with Maestro

Issues tagged with `e2e` or `test` labels (or containing keywords like "e2e", "maestro", "end-to-end") will **automatically trigger device testing** after the PR is created.

### How It Works
1. AI generates code and creates a PR (as usual)
2. Queue detects E2E keywords/labels
3. Builds Android debug APK via Expo + Gradle
4. Installs on physical device (Moto E13)
5. Runs Maestro YAML flows
6. Posts results as a PR comment

### Maestro Flow Format
Test files go in `apps/mobile/.maestro/flows/`. Each flow is a YAML file:

```yaml
appId: com.yourapp.mobile
---
- launchApp
- tapOn: "Sign In"
- inputText:
    id: "email-input"
    text: "test@example.com"
- tapOn: "Submit"
- assertVisible: "Welcome"
```

### Available Devices
| Device | Type | ID |
|--------|------|----|
| Moto E13 | Android | `ZL73232GKP` |
| iPhone 11 | iOS | `00008030-001950891A53402E` |

> **Note:** Android is the default for automated testing. iOS requires additional bridge setup.

### Skip E2E
Pass `--skip-e2e` to the worker to bypass testing even if labels are present.

## Issue Writing Guidelines for AI Queue

When creating or processing issues for the AI queue, follow these rules:

### Be Specific About WHAT to Change
- ❌ "Fix sharing" — too vague, AI may change wrong files
- ✅ "Update Share.share() calls in CategoryDetailScreen.tsx and DashboardScreen.tsx to use https://app.mapyourhealth.info/ as the base URL"

### Include Hints About WHERE
- Name specific files or directories to look in
- Name specific functions or patterns to search for (e.g., `Share.share()`, `Linking.openURL()`)
- Call out files that should NOT be modified

### Include Hints About HOW
- Show the current code pattern if known
- Show the expected code pattern after the fix
- Explain the difference between similar concepts (e.g., "share URLs" vs "API URLs")

### Anti-Patterns to Avoid
- ❌ Never change API configuration files unless the issue explicitly says to
- ❌ Never commit debug/temp files (`.llm-response.txt`, etc.)
- ❌ Never rewrite entire files when only a few lines need changing
- ❌ Never replace URLs in utility functions that handle ALL URLs — be surgical

### Issue Template
```markdown
## Summary
[One sentence description]

## Files to Modify
- `path/to/file.tsx` — [what to change]

## Files NOT to Modify
- `config.prod.ts` — API config, do not touch
- `openLinkInBrowser.ts` — generic utility, do not touch

## Search Pattern
Look for: `Share.share()` or `[specific function]`

## Expected Change
Before: `url: "https://old-url.com/path"`
After: `url: "https://new-url.com/path"`
```

### E2E Issue Template
Add the `e2e` label if the issue requires device testing. The queue auto-detects E2E issues and runs Maestro tests after PR creation.

```markdown
## Summary
[Feature/fix that needs device verification]

## Labels
`e2e`, `bug` (or `enhancement`)

## Files to Modify
- `apps/mobile/src/screens/LoginScreen.tsx` — fix login button

## Maestro Flow (if new test needed)
Create: `apps/mobile/.maestro/flows/login-test.yaml`
```yaml
appId: com.yourapp.mobile
---
- launchApp
- tapOn: "Sign In"
- assertVisible: "Dashboard"
```

## Expected Behavior
After the fix, the Maestro flow above should pass on Android (Moto E13).
```

---

## Issue Context

Task: E2E Test: Login and Logout Flow
ID: 111
Priority: medium
Description: No description provided
Repository: MapYourHealth (React Native + Expo)
Labels: e2e, test