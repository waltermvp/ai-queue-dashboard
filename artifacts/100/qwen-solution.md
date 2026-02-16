### Task Details

**Title:** E2E: Maestro Device Testing - Basic App Flow Validation  
**ID:** 100  
**Priority:** Medium  
**Repository:** MapYourHealth (React Native + Expo)  
**Labels:** `e2e`, `test`

---

### Steps to Follow for Building, Installing, and Running Maestro Tests

#### 1. Sync Amplify Outputs
Ensure that the app can load by synchronizing the Amplify outputs.
```bash
cd ~/Documents/MapYourHealth && yarn sync:amplify
```

#### 2. Build Release APK
Navigate to the mobile directory and build a release APK with JS bundled in.
```bash
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

#### 3. Install on Android Device
Install the built APK on your Moto E13 device.
```bash
adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk
```
**App ID:** `com.epiphanyapps.mapyourhealth`

#### 4. Set PATH for Maestro
Ensure that Maestro is accessible in your path.
```bash
export PATH="$PATH:$HOME/.maestro/bin"
```

#### 5. Create Artifact Directory
Create a directory to store test artifacts.
```bash
mkdir -p ~/Documents/ai-queue-dashboard/artifacts/{issue-id}
```

#### 6. Run Maestro Tests with Recording
Run the Maestro tests and capture video recordings of the test runs.
```bash
maestro record --local --device ZL73232GKP \
  ~/maestro-farm/flows/android/mapyourhealth-basic.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/{issue-id}/android-recording.mp4 \
  2>&1 | tee ~/Documents/ai-queue-dashboard/artifacts/{issue-id}/test-output.log
```

---

### Output Requirements

- **Test Results:** Provide a summary of test results with pass/fail status for each flow.
- **Screenshots:** Include screenshots of any failures.
- **Summary Report:** Include total tests, passed, failed, and skipped tests.
- **Error Handling:** If tests fail, include the Maestro error output and suggest fixes.
- **No Metro Bundler:** Ensure that no Metro bundler is used as the release APK has JS bundled in.

---

### Example of Expected Output

**Test Results:**
| Flow Name                          | Status |
|------------------------------------|--------|
| Sign In                            | Pass   |
| Dashboard Navigation                 | Fail   |
| Profile Update                       | Pass   |

**Screenshots:**
- `dashboard-navigation-failure.png`

**Summary Report:**
- Total Tests: 3
- Passed: 2
- Failed: 1
- Skipped: 0

**Test Output Log:**
```
<contents of test-output.log>
```

**Error Handling:**
- **Dashboard Navigation:** Failed because the navigation button was not visible.
  - Suggested Fix: Verify that the navigation button is properly rendered in the DashboardScreen.

---

### Additional Notes

Ensure that all critical linting rules are followed when writing or modifying React Native code:
1. **No Inline Styles**: Use `StyleSheet.create()`.
2. **Import Order**: Import React first, then third-party libraries, and finally local modules.
3. **Prettier Formatting**: Ensure proper formatting with line breaks and trailing commas.
4. **React Hooks Dependencies**: Include all dependencies in `useEffect`/`useCallback` arrays.
5. **Unused Imports**: Remove unused imports.

---

This task requires careful attention to detail and adherence to best practices for E2E testing using Maestro on real devices. Follow the steps outlined above to ensure a smooth testing process.