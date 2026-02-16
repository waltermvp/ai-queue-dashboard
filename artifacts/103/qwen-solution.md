### Task Overview

**Task ID:** 103  
**Priority:** Medium  
**Description:** Record basic app flow tests on devices for the **MapYourHealth** React Native app.  
**Repository:** `MapYourHealth` (React Native + Expo)  
**Labels:** `e2e`, `test`

### Steps to Perform

#### 1. Sync Amplify Outputs
Ensure that the Amplify outputs are synchronized to avoid loading issues.

```bash
cd ~/Documents/MapYourHealth && yarn sync:amplify
```

#### 2. Build Release APK
Build a release version of the APK with JS bundled in.

```bash
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

#### 3. Install on Android Device
Install the generated APK on the Moto E13 device.

```bash
adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk
```
**App ID:** `com.epiphanyapps.mapyourhealth`

#### 4. Set PATH for Maestro
Set the environment variable to include Maestro in your path.

```bash
export PATH="$PATH:$HOME/.maestro/bin"
```

#### 5. Create Artifact Directory
Create a directory to store test artifacts such as recordings and logs.

```bash
mkdir -p ~/Documents/ai-queue-dashboard/artifacts/103
```

#### 6. Run Maestro Tests with Recording
Use `maestro record` to execute the tests while capturing video recordings.

**Android (Moto E13):**
```bash
maestro record --local --device ZL73232GKP \
  ~/maestro-farm/flows/android/mapyourhealth-basic.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/103/android-recording.mp4 \
  2>&1 | tee ~/Documents/ai-queue-dashboard/artifacts/103/test-output.log
```

**iOS (iPhone 11) — requires bridge running first:**
```bash
# Terminal 1 — keep running:
maestro-ios-device --team-id 22X6D48M4G --device 00008030-001950891A53402E

# Terminal 2:
maestro record --local --driver-host-port 6001 --device 00008030-001950891A53402E \
  ~/maestro-farm/flows/ios/mapyourhealth-basic.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/103/ios-recording.mp4 \
  2>&1 | tee -a ~/Documents/ai-queue-dashboard/artifacts/103/test-output.log
```

### Output Requirements

- **Test Results:** Include pass/fail status for each flow.
- **Screenshots of Failures:** Capture screenshots whenever tests fail.
- **Summary Report:** Provide a summary report that includes total tests, passed, failed, and skipped tests.
- **Error Output:** If tests fail, include the Maestro error output and suggest possible fixes.
- **No Metro Bundler Needed:** Ensure that no Metro bundler is required as the release APK already has JS bundled in.

### Devices

| Device     | Platform | ID                                   |
|------------|----------|--------------------------------------|
| Moto E13   | Android  | `ZL73232GKP`                         |
| iPhone 11  | iOS      | `00008030-001950891A53402E`          |

### Maestro Flow File
The flow file (`mapyourhealth-basic.yaml`) should be structured as follows:

```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Sign In"
- inputText:
    id: "email-input"
    text: "test@example.com"
- inputText:
    id: "password-input"
    text: "securepassword123"
- tapOn: "Submit"
- assertVisible: "Dashboard"
```

### Notes

- Ensure that the device IDs (`ZL73232GKP` for Moto E13 and `00008030-001950891A53402E` for iPhone 11) are correct.
- The Maestro flow file should be located in the appropriate directory (`~/maestro-farm/flows/android/` or `~/maestro-farm/flows/ios/`).
- Artifacts (recordings and logs) will be stored in `~/Documents/ai-queue-dashboard/artifacts/103/`.

### Summary

By following these steps, you can successfully build, install, and run Maestro tests on real devices for the MapYourHealth React Native app. Ensure that all outputs are captured as specified to facilitate analysis and debugging if necessary.

If any issues arise during the process, please refer to the Maestro documentation or reach out to your team for assistance.