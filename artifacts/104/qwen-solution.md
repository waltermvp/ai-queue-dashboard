To handle the **E2E: Auth Flow Test - Login, Signup & Forgot Password** task for the **MapYourHealth** React Native app, we need to create a Maestro flow that covers these scenarios. Below are the steps to build, install, and run the Maestro tests on real devices following the guidelines provided.

### Step-by-Step Guide

#### 1. Sync Amplify Outputs
```bash
cd ~/Documents/MapYourHealth && yarn sync:amplify
```

#### 2. Build Release APK
```bash
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

#### 3. Install on Android Device (Moto E13)
```bash
adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk
```
**App ID:** `com.epiphanyapps.mapyourhealth`

#### 4. Set PATH for Maestro
```bash
export PATH="$PATH:$HOME/.maestro/bin"
```

#### 5. Create Artifact Directory
Replace `{issue-id}` with the actual issue number, which is `104` in this case.
```bash
mkdir -p ~/Documents/ai-queue-dashboard/artifacts/104
```

#### 6. Create Maestro Flow for Auth Flows

Create a new YAML file `auth-flow-test.yaml` under `~/maestro-farm/flows/android/`.

```yaml
appId: com.epiphanyapps.mapyourhealth
---
# Login Test
- launchApp
- tapOn: "Sign In"
- inputText:
    id: "email-input" # Replace with the actual ID of the email field
    text: "test@example.com"
- inputText:
    id: "password-input" # Replace with the actual ID of the password field
    text: "Test123!"
- tapOn: "Submit"
- assertVisible: "Welcome"

# Logout (if needed to test signup)
- tapOn: "Menu"
- tapOn: "Logout"
- assertVisible: "Sign In"

# Signup Test
- tapOn: "Don't have an account? Sign Up"
- inputText:
    id: "signup-email-input" # Replace with the actual ID of the email field in signup
    text: "newuser@example.com"
- inputText:
    id: "signup-password-input" # Replace with the actual ID of the password field in signup
    text: "NewPass123!"
- tapOn: "Sign Up"
- assertVisible: "Welcome"

# Logout (if needed to test forgot password)
- tapOn: "Menu"
- tapOn: "Logout"
- assertVisible: "Sign In"

# Forgot Password Test
- tapOn: "Forgot Password?"
- inputText:
    id: "forgot-password-email-input" # Replace with the actual ID of the email field in forgot password
    text: "test@example.com"
- tapOn: "Submit"
- assertVisible: "Password reset email sent"
```

#### 7. Run Maestro Tests with Recording

Run the following command to execute the test and record a video:

```bash
maestro record --local --device ZL73232GKP \
  ~/maestro-farm/flows/android/auth-flow-test.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/104/android-recording.mp4 \
  2>&1 | tee ~/Documents/ai-queue-dashboard/artifacts/104/test-output.log
```

### Output Requirements

- **Test Results:** The output will include pass/fail results for each flow.
- **Screenshots of Failures:** Maestro automatically captures screenshots on failures.
- **Summary Report:** The log file (`test-output.log`) will contain a summary report with total tests, passed, failed, and skipped.
- **Error Output:** If tests fail, the error output will be included in `test-output.log`, and suggestions for fixes should be based on these errors.

### Notes

- Ensure that the device IDs and app identifiers are correctly set as per the provided devices table.
- Make sure to replace placeholder IDs (`email-input`, `password-input`, etc.) with actual IDs from the MapYourHealth app's UI elements.
- This setup assumes that the Maestro tool is properly configured on your system.

By following these steps, you can ensure that the E2E tests for the Auth Flow are executed correctly and provide reliable results.