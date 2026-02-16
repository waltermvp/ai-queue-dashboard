### Task Overview

**Task:** E2E: Maestro Device Testing - Basic App Flow Validation  
**Issue ID:** 100  
**Priority:** Medium  
**Description:** No description provided  
**Repository:** MapYourHealth (React Native + Expo)  
**Labels:** `e2e`, `test`

### Steps to Perform E2E Testing

Given that this task requires end-to-end testing using Maestro, follow the outlined steps below to build, install, and run the tests on real devices.

#### 1. Sync Amplify Outputs
Navigate to the project directory and sync Amplify outputs.
```bash
cd ~/Documents/MapYourHealth && yarn sync:amplify
```

#### 2. Build Release APK
Switch to the mobile app directory and build a release version of the APK with JS bundled in.
```bash
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

#### 3. Install on Android Device
Install the built APK onto the Moto E13 device using ADB.
```bash
adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk
```

**App ID:** `com.epiphanyapps.mapyourhealth`

#### 4. Set PATH for Maestro
Ensure that the Maestro binary is accessible in your system path.
```bash
export PATH="$PATH:$HOME/.maestro/bin"
```

#### 5. Create Artifact Directory
Create a directory to store test artifacts, including recordings and logs.
```bash
mkdir -p ~/Documents/ai-queue-dashboard/artifacts/100
```

#### 6. Run Maestro Tests with Recording
Execute the Maestro test flow for Android, capturing video recordings of the test run.
```bash
maestro record --local --device ZL73232GKP \
  ~/maestro-farm/flows/android/mapyourhealth-basic.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/100/android-recording.mp4 \
  2>&1 | tee ~/Documents/ai-queue-dashboard/artifacts/100/test-output.log
```

### Output Requirements

- **Test Results:** Provide pass/fail status for each flow.
- **Screenshots of Failures:** Include screenshots if any tests fail.
- **Summary Report:** Include total tests, passed, failed, and skipped.
- **Error Output:** If tests fail, provide the Maestro error output and suggest potential fixes.
- **No Metro Bundler:** Ensure that a release APK with JS bundled in is used for testing.

### Example Summary Report

```markdown
## Test Summary Report (Issue ID: 100)

**Total Tests:** 5  
**Passed:** 4  
**Failed:** 1  
**Skipped:** 0  

### Failures:
- **Flow Name:** User Login Flow  
  - **Description:** The login button was not found during the test execution.  
  - **Error Output:**
    ```
    [Maestro Error] Element 'Sign In' not found after 10 seconds.
    ```
  - **Fix Suggestion:**
    Ensure that the element ID or text used in the Maestro flow matches the actual UI component.

### Screenshots:
- ![Login Flow Failure](path/to/screenshot.png)

### Test Output Logs:
Refer to `~/Documents/ai-queue-dashboard/artifacts/100/test-output.log` for detailed logs.
```

### Additional Notes

- **Maestro Flow:** Ensure that your Maestro flow file (`mapyourhealth-basic.yaml`) is correctly configured and located in the specified path.
- **Device IDs:** Use the correct device IDs provided for Android (Moto E13) and iOS (iPhone 11).
- **Environment Variables:** Make sure all required environment variables and configurations are set up before running tests.

By following these steps, you can effectively perform end-to-end testing on the MapYourHealth React Native app using Maestro on real devices.