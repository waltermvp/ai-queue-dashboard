### Summary
Record basic app flow tests on devices for the MapYourHealth React Native app using Maestro. The task involves building and installing a release APK on Android and iOS devices and running Maestro tests with recording.

### Labels
- `e2e`
- `test`

### Steps to Follow

#### 1. Sync Amplify Outputs
```bash
cd ~/Documents/MapYourHealth && yarn sync:amplify
```

#### 2. Build Release APK for Android
```bash
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

#### 3. Install Release APK on Moto E13 (Android Device)
Replace `{device_id}` with the actual device ID if different.
```bash
adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk
```

#### 4. Set PATH for Maestro
Ensure Maestro is added to your PATH.
```bash
export PATH="$PATH:$HOME/.maestro/bin"
```

#### 5. Create Artifact Directory
Replace `{issue-id}` with the actual issue ID, e.g., `103`.
```bash
mkdir -p ~/Documents/ai-queue-dashboard/artifacts/103
```

#### 6. Run Maestro Tests with Recording for Android (Moto E13)
Replace `{issue-id}` with the actual issue ID.
```bash
maestro record --local --device ZL73232GKP \
  ~/maestro-farm/flows/android/mapyourhealth-basic.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/103/android-recording.mp4 \
  2>&1 | tee ~/Documents/ai-queue-dashboard/artifacts/103/test-output.log
```

#### 7. Run Maestro Tests with Recording for iOS (iPhone 11)
Ensure the Maestro iOS bridge is running first.

**Terminal 1 — keep running:**
```bash
maestro-ios-device --team-id 22X6D48M4G --device 00008030-001950891A53402E
```

**Terminal 2:**
Replace `{issue-id}` with the actual issue ID.
```bash
maestro record --local --driver-host-port 6001 --device 00008030-001950891A53402E \
  ~/maestro-farm/flows/ios/mapyourhealth-basic.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/103/ios-recording.mp4 \
  2>&1 | tee -a ~/Documents/ai-queue-dashboard/artifacts/103/test-output.log
```

### Expected Behavior

- **Test Results:** The test results should indicate whether each flow passed or failed.
- **Screenshots of Failures:** Screenshots should be taken for any failed tests to identify issues.
- **Summary Report:** A summary report with total tests, passed, failed, and skipped should be generated.
- **Error Output:** If tests fail, the Maestro error output should be included along with suggestions for fixes.

### Notes

- Ensure no Metro bundler is used as the release APK has JS bundled in.
- Replace `{issue-id}` with `103` or the actual issue ID when creating directories and running commands.

By following these steps, you will successfully record basic app flow tests on real devices using Maestro for the MapYourHealth React Native app.