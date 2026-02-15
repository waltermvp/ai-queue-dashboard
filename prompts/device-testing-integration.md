# Device Testing Integration for AI Queue

## Carlos's Device Farm Capabilities

### Hardware Setup
- **Android:** Moto E13 (Device ID: ZL73232GKP)
- **iOS:** iPhone 11 (Device ID: 00008030-001950891A53402E)  
- **Framework:** Maestro 2.1.0 mobile testing

### Testing Commands
```bash
# Setup PATH (required each session)
export PATH="$PATH:$HOME/.maestro/bin"

# Android Testing
maestro --device ZL73232GKP test ~/maestro-farm/flows/android/

# iOS Testing (2 terminals)
# Terminal 1 - Bridge (keep running):
maestro-ios-device --team-id 22X6D48M4G --device 00008030-001950891A53402E

# Terminal 2 - Run tests:
maestro --driver-host-port 6001 --device 00008030-001950891A53402E test ~/maestro-farm/flows/ios/
```

## AI Queue Integration Strategy

### Enhanced Issue Processing Workflow
1. **AI Analysis** → Generate code fix (Qwen model)
2. **Code Implementation** → Apply changes to worktree  
3. **Device Testing** → Run Maestro tests on Android + iOS
4. **Validation** → Verify UI/UX works on real devices
5. **PR Creation** → Submit with test results

### Issue Creation Guidelines
When creating mobile app issues, include:

**Testing Requirements:**
- [ ] Android testing needed (Moto E13)
- [ ] iOS testing needed (iPhone 11) 
- [ ] UI/UX verification required
- [ ] Performance testing on devices

**Device-Specific Context:**
- Screen sizes and resolutions to test
- Touch interactions to verify
- Platform-specific behaviors
- Accessibility requirements

### Prompt Updates for AI Models
All mobile issue processing should include:

```
DEVICE TESTING AVAILABLE:
- Android: Moto E13 via Maestro
- iOS: iPhone 11 via Maestro  
- Real device validation required

After generating code fixes:
1. Create test scripts for device validation
2. Include Maestro flow files if UI changes
3. Specify device testing steps in implementation
4. Verify cross-platform compatibility
```

## Auto-Processing Queue Fix
**Current Issue:** "1 queued, 0 processing" - queue doesn't auto-start

**Solution Needed:**
- Auto-trigger processing when items queued and no active processing
- Implement queue watcher that starts next item automatically
- Add retry logic for failed processing attempts

## MapYourHealth Testing Priorities
For React Native issues:
- **Forms & Input** → Test on both platforms  
- **Navigation** → Verify gestures and transitions
- **API Calls** → Test network conditions on devices
- **Offline Mode** → Test app behavior without connectivity
- **Performance** → Profile on actual hardware

This device testing capability makes Carlos's AI queue the most comprehensive mobile development automation system! 🚀📱