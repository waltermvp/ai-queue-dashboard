### Summary
Implement and run end-to-end tests for the authentication flow in the MapYourHealth app, covering login, signup, and forgot password functionalities.

### Files to Modify
- Create new Maestro YAML flows for each part of the auth flow:
  - `apps/mobile/.maestro/flows/auth-login.yaml`
  - `apps/mobile/.maestro/flows/auth-signup.yaml`
  - `apps/mobile/.maestro/flows/auth-forgot-password.yaml`

### Files NOT to Modify
- Config files such as `amplifyconfiguration.json`, `app.config.js` — these contain configuration details and should not be altered for this task.
- Utility functions that handle authentication logic globally (e.g., `authService.ts`) — focus on the UI flow.

### Search Pattern
Look for:
- Login screen elements: "Sign In", "Email", "Password", "Login"
- Signup screen elements: "Sign Up", "Name", "Email", "Password", "Confirm Password"
- Forgot password screen elements: "Forgot Password", "Email", "Send"

### Expected Change
Create new Maestro flows that simulate user interactions for login, signup, and forgot password functionalities. Ensure the flows cover:
1. **Login Flow**: Enter valid credentials and assert successful navigation to the dashboard.
2. **Signup Flow**: Enter new user details, confirm password, and assert successful registration or appropriate error messages.
3. **Forgot Password Flow**: Enter an email address, trigger the password reset process, and assert receipt of a confirmation message.

### Maestro Flows

#### Login Flow (`apps/mobile/.maestro/flows/auth-login.yaml`)
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
- tapOn: "Login"
- assertVisible: "Dashboard" # or a specific element on the dashboard
```

#### Signup Flow (`apps/mobile/.maestro/flows/auth-signup.yaml`)
```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Sign Up"
- inputText:
    id: "name-input"
    text: "John Doe"
- inputText:
    id: "email-input"
    text: "newuser@example.com"
- inputText:
    id: "password-input"
    text: "securepassword123"
- inputText:
    id: "confirm-password-input"
    text: "securepassword123"
- tapOn: "Sign Up"
- assertVisible: "Registration Successful" # or a specific element indicating success
```

#### Forgot Password Flow (`apps/mobile/.maestro/flows/auth-forgot-password.yaml`)
```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Forgot Password"
- inputText:
    id: "email-input"
    text: "test@example.com"
- tapOn: "Send"
- assertVisible: "Password reset email sent" # or a specific element indicating success
```

### Expected Behavior
After implementing and running the Maestro flows, ensure that each flow passes on Android (Moto E13). Recordings and logs should be captured as specified in the pipeline.

### Testing Instructions

1. **Sync Amplify Outputs**
   ```bash
   cd ~/Documents/MapYourHealth && yarn sync:amplify
   ```

2. **Build Release APK**
   ```bash
   cd apps/mobile && npx expo prebuild --platform android --clean
   cd android && ./gradlew assembleRelease
   ```

3. **Install on Android Device**
   ```bash
   adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk
   ```

4. **Set PATH for Maestro**
   ```bash
   export PATH="$PATH:$HOME/.maestro/bin"
   ```

5. **Create Artifact Directory**
   ```bash
   mkdir -p ~/Documents/ai-queue-dashboard/artifacts/104
   ```

6. **Run Maestro Tests with Recording**
   ```bash
   maestro record --local --device ZL73232GKP \
     apps/mobile/.maestro/flows/auth-login.yaml \
     ~/Documents/ai-queue-dashboard/artifacts/104/auth-login-recording.mp4 \
     2>&1 | tee ~/Documents/ai-queue-dashboard/artifacts/104/auth-login-output.log

   maestro record --local --device ZL73232GKP \
     apps/mobile/.maestro/flows/auth-signup.yaml \
     ~/Documents/ai-queue-dashboard/artifacts/104/auth-signup-recording.mp4 \
     2>&1 | tee -a ~/Documents/ai-queue-dashboard/artifacts/104/auth-signup-output.log

   maestro record --local --device ZL73232GKP \
     apps/mobile/.maestro/flows/auth-forgot-password.yaml \
     ~/Documents/ai-queue-dashboard/artifacts/104/auth-forgot-password-recording.mp4 \
     2>&1 | tee -a ~/Documents/ai-queue-dashboard/artifacts/104/auth-forgot-password-output.log
   ```

### Output Requirements

- **Test Results**: Include pass/fail status for each flow.
- **Screenshots of Failures**: Capture and include screenshots if any tests fail.
- **Summary Report**: Provide a summary report including total tests, passed, failed, and skipped.
- **Error Output**: If tests fail, include the Maestro error output and suggest potential fixes.

By following these steps, you can ensure that the authentication flows in the MapYourHealth app are thoroughly tested on real devices.