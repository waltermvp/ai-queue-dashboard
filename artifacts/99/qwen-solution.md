To address the issue of verifying that `noreply@mapyourhealth.com` is properly configured in AWS Simple Email Service (SES), we need to ensure that the email sending functionality in the app uses this email as the sender and that SES is correctly set up to handle it. However, since this involves backend configuration more than frontend code, the task primarily lies outside of React Native/Expo.

Given that the issue does not specify changes needed in the frontend codebase but assumes there might be some configurations or checks required in the app's email sending logic, we will proceed with ensuring that the email address is used correctly in any relevant parts of the code. We'll also outline steps for verifying SES configuration and potential frontend tests.

### Root Cause Analysis

1. **Email Configuration**: The email sending functionality should use `noreply@mapyourhealth.com` as the sender.
2. **SES Configuration**: Ensure that `noreply@mapyourhealth.com` is verified in AWS SES, and the app has the necessary permissions to send emails from this address.

### Code Solution

We will update any parts of the code where an email address is specified to use `noreply@mapyourhealth.com`. Since no specific files or patterns are mentioned, we'll assume there might be a utility function for sending emails that needs updating.

#### Example: Update Email Sending Logic

Let's assume there is a utility file called `sendEmail.ts` in the project which handles email sending. We will update this file to use `noreply@mapyourhealth.com`.

**apps/mobile/src/utils/sendEmail.ts**
```tsx
import { MailComposer } from 'expo-mail-composer';

const sendEmail = async (to: string, subject: string, body: string) => {
  try {
    const result = await MailComposer.composeAsync({
      recipients: [to],
      subject,
      body,
      isHtml: true,
      from: 'noreply@mapyourhealth.com', // Ensure this email address is used
    });

    return result;
  } catch (error) {
    console.error('Failed to send email:', error);
    throw error;
  }
};

export default sendEmail;
```

### Implementation Steps

1. **Update `sendEmail.ts`**: Ensure the `from` field in the `MailComposer.composeAsync` call uses `noreply@mapyourhealth.com`.
2. **Search for other email sending logic**: Check if there are any other parts of the codebase that send emails and update them accordingly.

### Device Testing Plan

Since this change primarily affects email functionality, we will need to verify that emails are sent correctly from the app using `noreply@mapyourhealth.com`. This involves checking both frontend logic and backend configuration.

**Frontend Testing:**
- Ensure the updated code sends emails successfully.
- Check for any console errors during the email sending process.

**Backend Testing:**
- Verify that `noreply@mapyourhealth.com` is verified in AWS SES.
- Ensure that the app has the necessary permissions to send emails from this address.

### Testing Strategy

1. **Local Testing**: Test the email functionality on both Android and iOS simulators/emulators.
2. **Device Testing**:
   - **Android**: `maestro --device ZL73232GKP test ~/maestro-farm/flows/android/`
   - **iOS**: `maestro --driver-host-port 6001 --device 00008030-001950891A53402E test ~/maestro-farm/flows/ios/`

### E2E Maestro Flow

If there are no existing flows for testing email functionality, we will create a new one.

**Create: `apps/mobile/.maestro/flows/send-email-test.yaml`**
```yaml
appId: com.mapyourhealth.mobile
---
- launchApp
- tapOn: "Send Email"
- assertVisible: "Email sent successfully" # Assuming there's a confirmation message after sending an email
```

### Expected Behavior

After the fix, the Maestro flow above should pass on both Android (Moto E13) and iOS (iPhone 11).

### Output Requirements

1. **Create branch**: `issue-99`
2. **Commit with descriptive message**: "Update sendEmail utility to use noreply@mapyourhealth.com"
3. **Open PR assigned to**: `waltermvp`

### Pre-commit Checklist

- [ ] No inline styles (use StyleSheet)
- [ ] React imported before other packages
- [ ] All hook dependencies included
- [ ] No unused imports
- [ ] Proper Prettier formatting
- [ ] No color literals (use theme/constants)

Run `npm run lint -- --fix` to auto-fix formatting issues.

### Backend Configuration Verification

Ensure that the following steps are completed for SES configuration:

1. **Verify Email Address**: Log in to AWS Console, navigate to SES, and verify `noreply@mapyourhealth.com`.
2. **Configure Sending Permissions**: Ensure that the app has the necessary permissions to send emails from this address.

### Final Steps

- Verify all changes locally.
- Run tests using Maestro flows.
- Create PR with descriptive commit messages and assign it to `waltermvp`.

By following these steps, we can ensure that the email functionality in the app uses `noreply@mapyourhealth.com` correctly and is properly configured in AWS SES.