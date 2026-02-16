#!/bin/bash
set -eo pipefail

ISSUE_ID="${1:?Usage: e2e.sh <issue-id>}"
REPO_ROOT="$HOME/Documents/MapYourHealth"
MOBILE_ROOT="$REPO_ROOT/apps/mobile"
ARTIFACTS_DIR="$HOME/Documents/ai-queue-dashboard/artifacts/$ISSUE_ID"
BUILDS_CACHE="$HOME/Documents/ai-queue-dashboard/artifacts/builds"
LOG_FILE="$ARTIFACTS_DIR/pipeline.log"
DEVICE_ID="ZL73232GKP"
IOS_DEVICE_ID="00008030-001950891A53402E"
APP_ID="com.epiphanyapps.mapyourhealth"
APPLE_TEAM_ID="22X6D48M4G"

# Environment setup (not inherited from shell profile in background processes)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools:$HOME/.maestro/bin"
export JAVA_HOME="${JAVA_HOME:-/usr/libexec/java_home 2>/dev/null || echo /Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home}"

mkdir -p "$ARTIFACTS_DIR" "$BUILDS_CACHE"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

fail() {
  log "❌ PIPELINE FAILED: $1"
  exit 1
}

log "=== E2E Pipeline Started for Issue #$ISSUE_ID ==="

# -------------------------------------------------------
# Step 1: Sync amplify outputs
# -------------------------------------------------------
log "Step 1/6: Syncing amplify outputs..."
cd "$REPO_ROOT" && yarn sync:amplify >> "$LOG_FILE" 2>&1 || fail "amplify sync failed"
log "✅ Amplify sync complete"

# -------------------------------------------------------
# Step 2: Smart build — cache check
# -------------------------------------------------------
log "Step 2/6: Checking build cache..."

# Hash native dependencies to detect if full rebuild needed
HASH_INPUT=""
[ -f "$MOBILE_ROOT/package.json" ] && HASH_INPUT+=$(cat "$MOBILE_ROOT/package.json")
[ -f "$MOBILE_ROOT/app.json" ] && HASH_INPUT+=$(cat "$MOBILE_ROOT/app.json")
[ -f "$REPO_ROOT/package.json" ] && HASH_INPUT+=$(cat "$REPO_ROOT/package.json")
NATIVE_HASH=$(echo "$HASH_INPUT" | md5 -q 2>/dev/null || echo "$HASH_INPUT" | md5sum | cut -d' ' -f1)

# Ensure local.properties exists (expo prebuild --clean deletes it)
ensure_local_properties() {
  local props_file="$MOBILE_ROOT/android/local.properties"
  if [ -d "$MOBILE_ROOT/android" ] && [ ! -f "$props_file" ]; then
    echo "sdk.dir=$ANDROID_HOME" > "$props_file"
    log "📝 Created android/local.properties with sdk.dir"
  fi
}

CACHED_APK="$BUILDS_CACHE/${NATIVE_HASH}-android.apk"
APK_PATH="$MOBILE_ROOT/android/app/build/outputs/apk/release/app-release.apk"

if [ -f "$CACHED_APK" ]; then
  log "♻️ Using cached APK (native deps unchanged: $NATIVE_HASH)"
  APK_PATH="$CACHED_APK"
elif [ -d "$MOBILE_ROOT/android/app" ]; then
  # Android dir exists — skip prebuild, just rebuild (faster for JS-only changes)
  log "🔨 Incremental build (skipping prebuild, JS changes only)..."
  ensure_local_properties
  cd "$MOBILE_ROOT/android" && ./gradlew assembleRelease >> "$LOG_FILE" 2>&1 || {
    # If incremental fails, try full rebuild
    log "⚠️ Incremental build failed, trying full rebuild..."
    cd "$MOBILE_ROOT" && npx expo prebuild --platform android --clean >> "$LOG_FILE" 2>&1 || fail "expo prebuild failed"
    ensure_local_properties
    cd "$MOBILE_ROOT/android" && ./gradlew assembleRelease >> "$LOG_FILE" 2>&1 || fail "gradle assembleRelease failed"
  }
  # Cache the successful build
  if [ -f "$APK_PATH" ]; then
    cp "$APK_PATH" "$CACHED_APK"
    ln -sf "$CACHED_APK" "$BUILDS_CACHE/latest-android.apk"
    log "📦 Cached APK as $NATIVE_HASH"
  fi
else
  # No android dir — full prebuild + build
  log "🏗️ Full rebuild (no existing android directory)..."
  cd "$MOBILE_ROOT" && npx expo prebuild --platform android --clean >> "$LOG_FILE" 2>&1 || fail "expo prebuild failed"
  ensure_local_properties
  cd "$MOBILE_ROOT/android" && ./gradlew assembleRelease >> "$LOG_FILE" 2>&1 || fail "gradle assembleRelease failed"
  # Cache the successful build
  if [ -f "$APK_PATH" ]; then
    cp "$APK_PATH" "$CACHED_APK"
    ln -sf "$CACHED_APK" "$BUILDS_CACHE/latest-android.apk"
    log "📦 Cached APK as $NATIVE_HASH"
  fi
fi

if [ ! -f "$APK_PATH" ]; then
  fail "APK not found at $APK_PATH"
fi
log "✅ Release APK ready: $APK_PATH"

# -------------------------------------------------------
# Step 3: Verify device connected
# -------------------------------------------------------
log "Step 3/6: Checking device connectivity..."
adb -s "$DEVICE_ID" get-state >> "$LOG_FILE" 2>&1 || fail "Android device $DEVICE_ID not connected"
log "✅ Device $DEVICE_ID connected"

# -------------------------------------------------------
# Step 4: Install on device
# -------------------------------------------------------
log "Step 4/6: Installing APK on device $DEVICE_ID..."
adb -s "$DEVICE_ID" install -r "$APK_PATH" >> "$LOG_FILE" 2>&1 || fail "APK install failed"
log "✅ APK installed on $DEVICE_ID"

# -------------------------------------------------------
# Step 5: Run Maestro tests with recording (Android)
# -------------------------------------------------------
log "Step 5/6: Running Maestro tests with recording (Android)..."
FLOW_FILE="$HOME/maestro-farm/flows/android/mapyourhealth-basic.yaml"
if [ ! -f "$FLOW_FILE" ]; then
  fail "Maestro flow not found: $FLOW_FILE"
fi

# Start screen recording in background
DEVICE_RECORDING="/sdcard/e2e-recording.mp4"
adb -s "$DEVICE_ID" shell screenrecord --bugreport "$DEVICE_RECORDING" &
RECORD_PID=$!
log "📹 Started screen recording (PID: $RECORD_PID)"

# Give screenrecord time to initialize
sleep 2

# Run Maestro tests
maestro test --udid "$DEVICE_ID" "$FLOW_FILE" >> "$ARTIFACTS_DIR/test-output.log" 2>&1
MAESTRO_EXIT=$?

# Stop recording
kill $RECORD_PID 2>/dev/null
wait $RECORD_PID 2>/dev/null
sleep 2

# Pull recording from device
adb -s "$DEVICE_ID" pull "$DEVICE_RECORDING" "$ARTIFACTS_DIR/android-recording.mp4" >> "$LOG_FILE" 2>&1
adb -s "$DEVICE_ID" shell rm "$DEVICE_RECORDING" 2>/dev/null

if [ $MAESTRO_EXIT -ne 0 ]; then
  fail "Maestro tests failed (exit code: $MAESTRO_EXIT) — check test-output.log"
fi

# Video recording is REQUIRED — no video = failure
if [ ! -f "$ARTIFACTS_DIR/android-recording.mp4" ]; then
  fail "No video recording produced — screen recording failed"
fi

VIDSIZE=$(du -h "$ARTIFACTS_DIR/android-recording.mp4" | cut -f1)
if [ "$VIDSIZE" = "0B" ] || [ "$VIDSIZE" = "0" ]; then
  fail "Video recording is empty (0 bytes)"
fi

log "✅ Maestro tests passed with recording ($VIDSIZE)"

# -------------------------------------------------------
# Step 6: iOS tests (if device available)
# -------------------------------------------------------
log "Step 6/6: Checking iOS device..."
if ideviceinfo -u "$IOS_DEVICE_ID" -k DeviceName >> "$LOG_FILE" 2>&1; then
  log "📱 iOS device found, skipping iOS build for now (use cached .app when available)"
  # iOS build caching would go here in future
  # For now, just log that the device is available
else
  log "ℹ️ iOS device not available, skipping iOS tests"
fi

# -------------------------------------------------------
# Summary
# -------------------------------------------------------
log ""
log "=== E2E Pipeline Complete for Issue #$ISSUE_ID ==="
log "Artifacts:"
ls -la "$ARTIFACTS_DIR" >> "$LOG_FILE" 2>&1

# Report recording size
SIZE=$(du -h "$ARTIFACTS_DIR/android-recording.mp4" | cut -f1)
log "🎬 Video recording: $SIZE"

exit 0
