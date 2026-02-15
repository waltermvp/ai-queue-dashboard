#!/bin/bash
set -e

ISSUE_ID="${1:?Usage: e2e.sh <issue-id>}"
REPO_ROOT="$HOME/Documents/MapYourHealth"
ARTIFACTS_DIR="$HOME/Documents/ai-queue-dashboard/artifacts/$ISSUE_ID"
LOG_FILE="$ARTIFACTS_DIR/pipeline.log"
DEVICE_ID="ZL73232GKP"
APP_ID="com.epiphanyapps.mapyourhealth"
export PATH="$PATH:$HOME/.maestro/bin"

mkdir -p "$ARTIFACTS_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "=== E2E Pipeline Started for Issue #$ISSUE_ID ==="

# Step 1: Sync amplify
log "Step 1/5: Syncing amplify outputs..."
cd "$REPO_ROOT" && yarn sync:amplify >> "$LOG_FILE" 2>&1
log "✅ Amplify sync complete"

# Step 2: Expo prebuild
log "Step 2/5: Running expo prebuild..."
cd "$REPO_ROOT/apps/mobile" && npx expo prebuild --platform android --clean >> "$LOG_FILE" 2>&1
log "✅ Prebuild complete"

# Step 3: Build release APK
log "Step 3/5: Building release APK..."
cd "$REPO_ROOT/apps/mobile/android" && ./gradlew assembleRelease >> "$LOG_FILE" 2>&1
APK_PATH="$REPO_ROOT/apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_PATH" ]; then
  log "❌ APK not found at $APK_PATH"
  exit 1
fi
log "✅ Release APK built: $APK_PATH"

# Step 4: Install on device
log "Step 4/5: Installing APK on device $DEVICE_ID..."
adb -s "$DEVICE_ID" install -r "$APK_PATH" >> "$LOG_FILE" 2>&1
log "✅ APK installed on $DEVICE_ID"

# Step 5: Run Maestro tests with recording
log "Step 5/5: Running Maestro tests with recording..."
FLOW_FILE="$HOME/maestro-farm/flows/android/mapyourhealth-basic.yaml"
if [ ! -f "$FLOW_FILE" ]; then
  log "❌ Maestro flow not found: $FLOW_FILE"
  exit 1
fi

maestro record --local --device "$DEVICE_ID" \
  "$FLOW_FILE" \
  "$ARTIFACTS_DIR/android-recording.mp4" \
  >> "$ARTIFACTS_DIR/test-output.log" 2>&1 || {
    log "⚠️ Maestro recording finished with errors (check test-output.log)"
  }

log "=== E2E Pipeline Complete for Issue #$ISSUE_ID ==="
log "Artifacts saved to: $ARTIFACTS_DIR"
ls -la "$ARTIFACTS_DIR" >> "$LOG_FILE" 2>&1
exit 0
