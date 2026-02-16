To address the **E2E Testing** for the *Auth Flow* in the **MapYourHealth** React Native app, we will create and execute Maestro flows to cover the Login, Signup, and Forgot Password functionalities. Below are the detailed steps to set up and run these tests.

## Step-by-Step Guide

### 1. Sync Amplify Outputs
Ensure that the Amplify outputs are synced properly as this is a prerequisite for the app to load correctly.
```bash
cd ~/Documents/MapYourHealth && yarn sync:amplify
```

### 2. Build Release APK
Navigate to the mobile directory and build a release APK with JS bundled in.
```bash
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

### 3. Install on Android Device
Install the built APK on the Moto E13 device using ADB.
```bash
adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk
```
**App ID:** `com.epiphanyapps.mapyourhealth`

### 4. Set PATH for Maestro
Ensure that the Maestro binary is in your PATH.
```bash
export PATH="$PATH:$HOME/.maestro/bin"
```

### 5. Create Artifact Directory
Create a directory to store test artifacts, replacing `{issue-id}` with `104`.
```bash
mkdir -p ~/Documents/ai-queue-dashboard/artifacts/104
```

### 6. Define Maestro Flows

#### Login Flow (`login-test.yaml`)
This flow will cover the login functionality.
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

#### Signup Flow (`signup-test.yaml`)
This flow will cover the signup functionality.
```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Sign Up"
- inputText:
    id: "email-input"
    text: "newuser@example.com"
- inputText:
    id: "password-input"
    text: "securepassword123"
- inputText:
    id: "confirm-password-input"
    text: "securepassword123"
- tapOn: "Create Account"
- assertVisible: "Confirmation Sent"
```

#### Forgot Password Flow (`forgot-password-test.yaml`)
This flow will cover the forgot password functionality.
```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Sign In"
- tapOn: "Forgot Password?"
- inputText:
    id: "email-input"
    text: "test@example.com"
- tapOn: "Send Reset Link"
- assertVisible: "Reset Email Sent"
```

### 7. Run Maestro Tests with Recording
Run each test flow and capture video recordings.

**Login Flow:**
```bash
maestro record --local --device ZL73232GKP \
  ~/maestro-farm/flows/android/login-test.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/104/login-recording.mp4 \
  2>&1 | tee ~/Documents/ai-queue-dashboard/artifacts/104/login-output.log
```

**Signup Flow:**
```bash
maestro record --local --device ZL73232GKP \
  ~/maestro-farm/flows/android/signup-test.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/104/signup-recording.mp4 \
  2>&1 | tee -a ~/Documents/ai-queue-dashboard/artifacts/104/test-output.log
```

**Forgot Password Flow:**
```bash
maestro record --local --device ZL73232GKP \
  ~/maestro-farm/flows/android/forgot-password-test.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/104/forgot-password-recording.mp4 \
  2>&1 | tee -a ~/Documents/ai-queue-dashboard/artifacts/104/test-output.log
```

## Output Requirements

### Test Results Summary
After running the tests, compile a summary report detailing:

- **Total Tests:** Number of test flows executed (3 in this case: Login, Signup, Forgot Password).
- **Passed:** Number of test flows that passed.
- **Failed:** Number of test flows that failed.
- **Skipped:** Any test flows that were skipped (if applicable).

### Screenshots of Failures
If any tests fail, capture screenshots to illustrate the failure points.

### Error Output and Fixes
For each failed test flow:
- Include the Maestro error output.
- Suggest possible fixes based on the error message.

## Example Summary Report

```plaintext
### Test Results Summary

**Total Tests:** 3
**Passed:** 2
**Failed:** 1
**Skipped:** 0

### Test Flows

#### Login Flow
- **Status:** Passed
- **Recording:** [login-recording.mp4](/api/artifacts/104/login-recording.mp4)

#### Signup Flow
- **Status:** Passed
- **Recording:** [signup-recording.mp4](/api/artifacts/104/signup-recording.mp4)

#### Forgot Password Flow
- **Status:** Failed
- **Error Output:**
  ```
  Error: Element with ID "email-input" not found.
  ```
- **Screenshots:** ![Forgot Password Failure](/api/artifacts/104/forgot-password-failure.png)
- **Fix Suggestions:**
  - Verify that the `id` attribute for the email input field in the Forgot Password screen is correctly set to `"email-input"`.
  - Ensure that the Forgot Password screen is fully loaded before attempting to interact with elements.
```

## Conclusion
By following these steps, you will be able to automate the E2E testing of the Auth Flow in the MapYourHealth app using Maestro. This ensures that the login, signup, and forgot password functionalities are working as expected on real devices.

If any issues arise during the setup or execution, refer to the Maestro documentation or reach out to the development team for assistance.