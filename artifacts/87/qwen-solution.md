To address the task of ensuring Playwright parity for category reorganization, accordion functionality, and external links on the mobile web in the **MapYourHealth** React Native app, we need to ensure that these features work as expected on both mobile web (via Expo) and native platforms. Since this issue is tagged with `test` and `e2e`, it will trigger device testing using Maestro after a PR is created.

### Steps to Implement and Test

#### 1. Update Code for Category Reorganization, Accordion, and External Links
First, we need to make sure that the category reorganization, accordion functionality, and external links are implemented correctly in the React Native app. This involves modifying specific files as described below.

**Files to Modify:**
- `apps/mobile/src/screens/CategoryScreen.tsx` — Implement category reorganization and accordion.
- `apps/mobile/src/components/AccordionComponent.tsx` — Ensure accordion functionality works correctly.
- `apps/mobile/src/utils/openLinkInBrowser.tsx` — Ensure external links open correctly.

**Files NOT to Modify:**
- `config.prod.ts` — API config, do not touch.
- `openLinkInBrowser.ts` — generic utility, modify with caution as per the specific changes needed.

**Search Pattern:**
Look for components related to categories and accordions in `CategoryScreen.tsx`. Ensure that external links are handled by `openLinkInBrowser.ts`.

**Expected Change:**
Ensure that the category list is reorganized as required. Accordion should toggle visibility of content sections. External links should open in a new browser tab or in-app browser.

#### 2. Create Maestro Flows for Testing
We need to create Maestro flows to test the following scenarios:
- Category reorganization.
- Accordion functionality.
- External links.

**Create: `apps/mobile/.maestro/flows/category-reorg-test.yaml`**
```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Categories"
- assertVisible: "[Expected category name]"
- swipeDown
- assertVisible: "[Another expected category name]"
```

**Create: `apps/mobile/.maestro/flows/accordion-test.yaml`**
```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Categories"
- tapOn: "[Accordion Header Text]"
- assertVisible: "[Expected content inside accordion]"
```

**Create: `apps/mobile/.maestro/flows/external-links-test.yaml`**
```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Categories"
- tapOn: "[Link text]"
- assertVisible: "[Expected content of the external link page]"
```

#### 3. Build, Install, and Run Maestro Tests on Real Devices
Follow the pipeline to build a release APK, install it on a real device, and run Maestro tests.

**Sync Amplify Outputs:**
```bash
cd ~/Documents/MapYourHealth && yarn sync:amplify
```

**Build Release APK:**
```bash
cd apps/mobile && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

**Install on Android Device:**
```bash
adb -s ZL73232GKP install -r app/build/outputs/apk/release/app-release.apk
```

**Set PATH for Maestro:**
```bash
export PATH="$PATH:$HOME/.maestro/bin"
```

**Create Artifact Directory:**
```bash
mkdir -p ~/Documents/ai-queue-dashboard/artifacts/87
```

**Run Maestro Tests with Recording (Android):**
```bash
maestro record --local --device ZL73232GKP \
  ~/apps/mobile/.maestro/flows/category-reorg-test.yaml \
  ~/Documents/ai-queue-dashboard/artifacts/87/android-category-recording.mp4 \
  2>&1 | tee ~/Documents/ai-queue-dashboard/artifacts/87/test-output.log
```

Repeat the above step for `accordion-test.yaml` and `external-links-test.yaml`.

#### 4. Output Requirements
- Test results with pass/fail for each flow.
- Screenshots of failures.
- Summary report: total tests, passed, failed, skipped.
- If tests fail, include the Maestro error output and suggest fixes.

### Example Issue Template

```markdown
## Summary
Ensure category reorganization, accordion functionality, and external links work correctly on mobile web and native platforms.

## Labels
`test`, `e2e`

## Files to Modify
- `apps/mobile/src/screens/CategoryScreen.tsx` — Implement category reorganization and accordion.
- `apps/mobile/src/components/AccordionComponent.tsx` — Ensure accordion functionality works correctly.
- `apps/mobile/src/utils/openLinkInBrowser.tsx` — Ensure external links open correctly.

## Files NOT to Modify
- `config.prod.ts` — API config, do not touch.
- `openLinkInBrowser.ts` — generic utility, modify with caution as per the specific changes needed.

## Search Pattern
Look for components related to categories and accordions in `CategoryScreen.tsx`. Ensure that external links are handled by `openLinkInBrowser.ts`.

## Expected Change
Ensure that the category list is reorganized as required. Accordion should toggle visibility of content sections. External links should open in a new browser tab or in-app browser.

## Maestro Flows (if new test needed)
Create: `apps/mobile/.maestro/flows/category-reorg-test.yaml`
```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Categories"
- assertVisible: "[Expected category name]"
- swipeDown
- assertVisible: "[Another expected category name]"
```

Create: `apps/mobile/.maestro/flows/accordion-test.yaml`
```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Categories"
- tapOn: "[Accordion Header Text]"
- assertVisible: "[Expected content inside accordion]"
```

Create: `apps/mobile/.maestro/flows/external-links-test.yaml`
```yaml
appId: com.epiphanyapps.mapyourhealth
---
- launchApp
- tapOn: "Categories"
- tapOn: "[Link text]"
- assertVisible: "[Expected content of the external link page]"
```

## Expected Behavior
After the fix, the Maestro flows above should pass on Android (Moto E13).
```

By following these steps and guidelines, we can ensure that the category reorganization, accordion functionality, and external links are implemented correctly and work as expected across both mobile web and native platforms.