### Task Overview

**Task:** Record Basic App Flow Tests on Devices  
**ID:** 103  
**Priority:** Medium  
**Repository:** MapYourHealth (React Native + Expo)  
**Labels:** `e2e`, `test`

### Steps to Follow

We will follow the steps outlined in your prompt to build, install, and run Maestro tests on real devices for the **MapYourHealth** React Native app.

#### 1. Sync Amplify Outputs
```bash
cd ~/Documents/MapYourHealth && yarn sync:amplify
```

#### 2. Build Release APK
Ensure you are in the correct directory and follow these steps:
```bash
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

#### 3. Install on Android Device
Install the release APK to your Moto E13 device.
```bash
adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk
```

**App ID:** `com.epiphanyapps.mapyourhealth` (Ensure this matches with the app installed)

#### 4. Set PATH for Maestro
Make sure Maestro is in your PATH.
```bash
export PATH="$PATH:$HOME/.maestro/bin"
```

#### 5. Create Artifact Directory
Create a directory to store test artifacts.
```bash
mkdir -p ~/Documents/ai-queue-dashboard/artifacts/103
```

#### 6. Run Maestro Tests with Recording

For Android (Moto E13):
```bash
maestro record --local --device ZL73232GKP \
  ~/maestro-farm/flows/android/mapyourhealth-basic.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/103/android-recording.mp4 \
  2>&1 | tee ~/Documents/ai-queue-dashboard/artifacts/103/test-output.log
```

For iOS (iPhone 11) — requires bridge running first:
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

- **Test Results:** Pass/Fail for each flow.
- **Screenshots of Failures:** If any test fails, capture screenshots to diagnose the issue.
- **Summary Report:**
  - Total Tests
  - Passed Tests
  - Failed Tests
  - Skipped Tests
- **Error Output and Fixes:** If tests fail, include Maestro error output and suggest fixes.

### Additional Notes

Ensure that all Maestro flows are correctly defined in `apps/mobile/.maestro/flows/`. Here is an example of a simple flow:

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
    text: "password123"
- tapOn: "Submit"
- assertVisible: "Dashboard"
```

### Final Steps

After running the tests, check the artifact directory for the recordings and logs. Ensure that all required outputs are captured as per the requirements.

If there are any issues or failures, review the Maestro error output and take necessary actions to fix them. This might involve adjusting the flows or fixing bugs in the application.

### Example of Reviewing Logs

After running the tests, you can open the `test-output.log` file:
```bash
cat ~/Documents/ai-queue-dashboard/artifacts/103/test-output.log
```

Look for any errors and review the corresponding screenshots to understand what went wrong. Adjust your Maestro flows or fix application issues as needed.

### Conclusion

By following these steps, you will be able to build, install, and run Maestro tests on real devices for the **MapYourHealth** React Native app. This process ensures that your application is functioning correctly in a production-like environment.