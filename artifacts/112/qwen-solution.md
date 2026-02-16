### Summary
Add a "Delete Account" section to the Settings screen in the MapYourHealth app.

### Files to Modify
- `apps/mobile/src/screens/SettingsScreen.tsx` — Add the Delete Account section UI.
- `apps/mobile/src/components/DeleteAccountButton.tsx` — Create a new component for the Delete Account button with appropriate styling and logic.
- `apps/mobile/assets/icons/delete.png` — Ensure the icon asset is available if not already present.

### Approach
1. **Create a New Component (`DeleteAccountButton`)**:
   - Create a new file named `DeleteAccountButton.tsx` in `apps/mobile/src/components/`.
   - Implement the button with an icon and text.
   - Add necessary styles using `StyleSheet.create()`.

2. **Modify `SettingsScreen.tsx`**:
   - Import the newly created `DeleteAccountButton` component.
   - Add a new section in the `SettingsScreen` for the "Delete Account" option.
   - Ensure proper alignment and spacing with existing sections.

3. **Ensure Consistency**:
   - Follow the existing pattern of UI components and styling in the `SettingsScreen`.
   - Use theme constants for colors if available.

### Acceptance Criteria
- [ ] The "Delete Account" section is visible on the Settings screen.
- [ ] The Delete Account button has an appropriate icon and text ("Delete Account").
- [ ] The new section does not break the layout of existing settings items.
- [ ] Styles are consistent with other sections in the Settings screen.

### Key Constraints
- NO inline styles — use `StyleSheet.create()`
- Proper import order (React → third-party → local)
- No unused imports or variables
- No color literals — use theme constants
- All hook dependencies must be complete
- Follow existing patterns in the codebase

### Additional Notes
- Ensure that the icon asset (`delete.png`) is correctly placed and imported.
- Consider accessibility by adding appropriate `accessibilityLabel` to the button.

### Maestro Flow (if new test needed)
Create: `apps/mobile/.maestro/flows/delete-account-test.yaml`
```yaml
appId: com.yourapp.mobile
---
- launchApp
- tapOn: "Settings"
- assertVisible: "Delete Account"
```

### Expected Behavior
After the fix, the Maestro flow above should pass on Android (Moto E13), confirming that the "Delete Account" section is visible and correctly labeled.