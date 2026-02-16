To address the task of setting up and running E2E tests for the **Settings Screen & Dark Mode Toggle** feature in the **MapYourHealth** React Native app using Maestro, follow the detailed steps outlined below:

## Step-by-Step Guide

### 1. Sync Amplify Outputs
Ensure that Amplify outputs are synced before building the APK to avoid issues during app loading.

```bash
cd ~/Documents/MapYourHealth && yarn sync:amplify
```

### 2. Build Release APK
Navigate to the mobile application directory and build a release APK with JS bundled in.

```bash
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

### 3. Install on Android Device
Install the newly built APK on the Moto E13 device using ADB.

```bash
adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk
```

### 4. Set PATH for Maestro
Add Maestro to your system path to execute its commands easily.

```bash
export PATH="$PATH:$HOME/.maestro/bin"
```

### 5. Create Artifact Directory
Create a directory to store test artifacts, such as recordings and logs.

```bash
mkdir -p ~/Documents/ai-queue-dashboard/artifacts/settings-dark-mode-toggle
```

### 6. Define Maestro Flow for Settings & Dark Mode Toggle
Create a YAML file for the Maestro flow that tests navigation to the settings screen and toggling dark mode.

**Location:** `~/maestro-farm/flows/android/settings-dark-mode.yaml`

```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Settings"
- assertVisible: "Settings Screen" # Ensure we are on the settings screen
- tapOn:
    text: "Dark Mode"
    elementDescription: "Toggle for Dark Mode"
- wait:
    milliseconds: 2000 # Wait to ensure the toggle takes effect
- assertScreenshot:
    name: "dark-mode-enabled"
    path: ~/Documents/ai-queue-dashboard/artifacts/settings-dark-mode-toggle/dark-mode-enabled.png
```

### 7. Run Maestro Tests with Recording
Use `maestro record` to run the tests and capture video recordings.

```bash
maestro record --local --device ZL73232GKP \
  ~/maestro-farm/flows/android/settings-dark-mode.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/settings-dark-mode-toggle/recording.mp4 \
  2>&1 | tee ~/Documents/ai-queue-dashboard/artifacts/settings-dark-mode-toggle/test-output.log
```

## Output Requirements

### Test Results
Ensure that the test results include pass/fail status for each flow, screenshots of failures (if any), and a summary report.

**Summary Report Example:**
```
Total Tests: 1
Passed: 1
Failed: 0
Skipped: 0
```

### Screenshots and Logs
- **Screenshots:** Captured during the test run to visually verify the state of the app.
- **Logs:** Stored in `~/Documents/ai-queue-dashboard/artifacts/settings-dark-mode-toggle/test-output.log` for debugging purposes.

## Issue Template with E2E Testing

Since this task requires device testing, include the `e2e` label and specify the Maestro flow if a new test is needed.

```markdown
## Summary
Add E2E tests to verify navigation to the Settings screen and toggling Dark Mode functionality.

## Labels
- `e2e`
- `test`

## Files to Modify
- No specific files need modification for this task, but ensure that the Settings screen and Dark Mode toggle are correctly implemented in `apps/mobile/src/screens/SettingsScreen.tsx`.

## Maestro Flow (if new test needed)
Create: `~/maestro-farm/flows/android/settings-dark-mode.yaml`
```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Settings"
- assertVisible: "Settings Screen" # Ensure we are on the settings screen
- tapOn:
    text: "Dark Mode"
    elementDescription: "Toggle for Dark Mode"
- wait:
    milliseconds: 2000 # Wait to ensure the toggle takes effect
- assertScreenshot:
    name: "dark-mode-enabled"
    path: ~/Documents/ai-queue-dashboard/artifacts/settings-dark-mode-toggle/dark-mode-enabled.png
```

## Expected Behavior
After the test is implemented and run, the Maestro flow should pass on Android (Moto E13), verifying that navigation to the Settings screen and toggling Dark Mode work as expected.
```

By following these steps and guidelines, you can successfully set up and execute E2E tests for the **Settings Screen & Dark Mode Toggle** feature in the MapYourHealth React Native app using Maestro.