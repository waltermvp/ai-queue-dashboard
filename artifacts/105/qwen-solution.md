To handle the **E2E Testing** for the **Settings Screen & Dark Mode Toggle** in the **MapYourHealth** React Native app, we will follow the detailed pipeline and steps outlined. Below is a comprehensive guide to building, installing, and running Maestro tests on real devices (Android Moto E13 and iOS iPhone 11).

### Step-by-Step Guide

#### 1. Sync Amplify Outputs
Navigate to your project directory and sync Amplify outputs to ensure the app can load correctly.

```bash
cd ~/Documents/MapYourHealth && yarn sync:amplify
```

#### 2. Build Release APK
Build a release version of the Android APK with JS bundled in.

```bash
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

**Note:** Ensure you're using the `--clean` flag to avoid any lingering dev dependencies or configurations.

#### 3. Install on Android Device
Install the APK on your connected Moto E13 device.

```bash
adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk
```

**App ID:** `com.epiphanyapps.mapyourhealth`

#### 4. Set PATH for Maestro
Ensure that the Maestro CLI is accessible in your shell's PATH.

```bash
export PATH="$PATH:$HOME/.maestro/bin"
```

#### 5. Create Artifact Directory
Create a directory to store test artifacts (logs, recordings) under `~/Documents/ai-queue-dashboard/artifacts/{issue-id}`.

Replace `{issue-id}` with the actual issue ID, e.g., `105`.

```bash
mkdir -p ~/Documents/ai-queue-dashboard/artifacts/105
```

#### 6. Define Maestro Flow for Settings & Dark Mode Toggle

Create a new YAML file named `settings-dark-mode-toggle.yaml` under `~/maestro-farm/flows/android/` (or appropriate path).

**Example `settings-dark-mode-toggle.yaml`:**

```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Settings"  # Assuming there's a button or tab labeled "Settings"
- assertVisible: "Dark Mode"  # Ensure the Dark Mode toggle is visible
- tapOn: "Dark Mode Toggle"  # Tap on the toggle to switch modes
- wait: 1000  # Wait for 1 second to allow mode change
- assertVisible: "Light Mode"  # Ensure it switched to Light Mode
- tapOn: "Dark Mode Toggle"  # Tap again to switch back
- wait: 1000  # Wait for 1 second to allow mode change
- assertVisible: "Dark Mode"  # Ensure it switched back to Dark Mode
```

**Note:** Adjust the `tapOn` and `assertVisible` commands based on the actual UI elements in your app. You may need to inspect the app to find the correct identifiers.

#### 7. Run Maestro Tests with Recording

For Android (Moto E13):

```bash
maestro record --local --device ZL73232GKP \
  ~/maestro-farm/flows/android/settings-dark-mode-toggle.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/105/android-recording.mp4 \
  2>&1 | tee ~/Documents/ai-queue-dashboard/artifacts/105/test-output.log
```

For iOS (iPhone 11) — requires bridge running first:

**Terminal 1:**
```bash
maestro-ios-device --team-id 22X6D48M4G --device 00008030-001950891A53402E
```

**Terminal 2:**
```bash
maestro record --local --driver-host-port 6001 --device 00008030-001950891A53402E \
  ~/maestro-farm/flows/ios/settings-dark-mode-toggle.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/105/ios-recording.mp4 \
  2>&1 | tee -a ~/Documents/ai-queue-dashboard/artifacts/105/test-output.log
```

### Output Requirements

- **Test Results:** Ensure the test results are captured and include pass/fail status for each flow.
- **Screenshots of Failures:** If any test fails, capture screenshots to diagnose issues.
- **Summary Report:** Provide a summary report including total tests, passed, failed, and skipped.
- **Error Output and Fixes:** Include Maestro error output if tests fail and suggest potential fixes.

### Example Summary Report

**Report:**

```
Total Tests: 1
Passed: 1
Failed: 0
Skipped: 0

Logs stored in: ~/Documents/ai-queue-dashboard/artifacts/105/
Recordings:
- Android: android-recording.mp4
- iOS: ios-recording.mp4
```

### Handling Failures

If tests fail, inspect the `test-output.log` for detailed error messages. Common issues include:

- **Element Not Found:** Ensure the UI elements (e.g., "Settings", "Dark Mode") are correctly identified in the Maestro flow.
- **Timing Issues:** Use `wait` commands to allow time for animations or state changes to complete.
- **App Crashes:** Investigate app logs for any runtime errors.

### Additional Considerations

- **Device Compatibility:** Ensure the devices (Moto E13 and iPhone 11) are correctly connected and recognized by ADB/Fastlane.
- **Maestro Configuration:** Verify that Maestro is properly configured on your machine, including any necessary dependencies or environment variables.
- **Consistent Testing Environment:** Maintain a consistent testing environment to minimize variability in test results.

By following these steps, you can effectively perform E2E testing for the Settings Screen & Dark Mode Toggle feature in the MapYourHealth app.