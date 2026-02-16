#!/bin/bash
set -eo pipefail

ISSUE_ID="${1:?Usage: e2e.sh <issue-id> [flows-dir]}"
QWEN_FLOWS_DIR="${2:-}"
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
# Step 4: Install on device + Health Check Gate
# -------------------------------------------------------
log "Step 4/6: Installing APK and running health check..."
adb -s "$DEVICE_ID" install -r "$APK_PATH" >> "$LOG_FILE" 2>&1 || fail "APK install failed"
log "✅ APK installed on $DEVICE_ID"

# Launch app and wait for it to load (Moto E13 is slow)
log "🏥 Launching app for health check..."
adb -s "$DEVICE_ID" shell am start -n "$APP_ID/.MainActivity" >> "$LOG_FILE" 2>&1 || fail "Failed to launch app"
log "⏳ Waiting 10s for app to load on Moto E13..."
sleep 10

# Run health check flow
HEALTHCHECK_FLOW="$HOME/maestro-farm/flows/android/healthcheck.yaml"
if [ -f "$HEALTHCHECK_FLOW" ]; then
  log "🏥 Running health check flow..."
  maestro test --udid "$DEVICE_ID" "$HEALTHCHECK_FLOW" >> "$ARTIFACTS_DIR/healthcheck-output.log" 2>&1
  HC_EXIT=$?
  if [ $HC_EXIT -ne 0 ]; then
    fail "App failed to load — health check did not pass (exit code: $HC_EXIT). Check healthcheck-output.log"
  fi
  log "✅ Health check passed — app is loaded and visible"
else
  log "⚠️ No healthcheck.yaml found, skipping health check"
fi

# -------------------------------------------------------
# Step 5: Run Maestro tests with recording (Android)
# -------------------------------------------------------
log "Step 5/6: Running Maestro tests with recording (Android)..."

# Build list of flows to run
FLOWS_TO_RUN=()
FLOW_NAMES=()

if [ -n "$QWEN_FLOWS_DIR" ] && [ -d "$QWEN_FLOWS_DIR" ]; then
  # Check for Qwen-generated flows
  QWEN_YAMLS=$(find "$QWEN_FLOWS_DIR" -name '*.yaml' -o -name '*.yml' 2>/dev/null | sort)
  if [ -n "$QWEN_YAMLS" ]; then
    log "📋 Found Qwen-generated flows in $QWEN_FLOWS_DIR"
    while IFS= read -r f; do
      FLOWS_TO_RUN+=("$f")
      FLOW_NAMES+=("$(basename "$f" .yaml)")
      log "   → $(basename "$f")"
    done <<< "$QWEN_YAMLS"
  fi
fi

# Fall back to basic flow if no Qwen flows
if [ ${#FLOWS_TO_RUN[@]} -eq 0 ]; then
  BASIC_FLOW="$HOME/maestro-farm/flows/android/mapyourhealth-basic.yaml"
  if [ ! -f "$BASIC_FLOW" ]; then
    fail "Maestro flow not found: $BASIC_FLOW"
  fi
  FLOWS_TO_RUN+=("$BASIC_FLOW")
  FLOW_NAMES+=("mapyourhealth-basic")
  log "📋 Using default basic flow"
fi

log "🔢 Total flows to run: ${#FLOWS_TO_RUN[@]}"

# Track results
TOTAL_FLOWS=${#FLOWS_TO_RUN[@]}
PASSED_FLOWS=0
FAILED_FLOWS=0
VIDEOS_RECORDED=0
ANY_FAILED=0

for i in "${!FLOWS_TO_RUN[@]}"; do
  FLOW_FILE="${FLOWS_TO_RUN[$i]}"
  FLOW_NAME="${FLOW_NAMES[$i]}"
  FLOW_NUM=$((i + 1))

  log "--- Running flow $FLOW_NUM/$TOTAL_FLOWS: $FLOW_NAME ---"

  # Start screen recording in background
  DEVICE_RECORDING="/sdcard/e2e-recording-${FLOW_NAME}.mp4"
  adb -s "$DEVICE_ID" shell screenrecord --bugreport "$DEVICE_RECORDING" &
  RECORD_PID=$!
  log "📹 Started screen recording (PID: $RECORD_PID)"
  sleep 2

  # Run Maestro test
  FLOW_LOG="$ARTIFACTS_DIR/test-output-${FLOW_NAME}.log"
  maestro test --udid "$DEVICE_ID" "$FLOW_FILE" >> "$FLOW_LOG" 2>&1
  MAESTRO_EXIT=$?

  # Stop recording
  kill $RECORD_PID 2>/dev/null
  wait $RECORD_PID 2>/dev/null
  sleep 2

  # Pull recording from device
  VIDEO_FILE="$ARTIFACTS_DIR/android-${FLOW_NAME}.mp4"
  adb -s "$DEVICE_ID" pull "$DEVICE_RECORDING" "$VIDEO_FILE" >> "$LOG_FILE" 2>&1
  adb -s "$DEVICE_ID" shell rm "$DEVICE_RECORDING" 2>/dev/null

  # --- Post-Test Validation ---

  # Check Maestro exit code
  if [ $MAESTRO_EXIT -ne 0 ]; then
    log "❌ Flow $FLOW_NAME FAILED (Maestro exit code: $MAESTRO_EXIT)"
    FAILED_FLOWS=$((FAILED_FLOWS + 1))
    ANY_FAILED=1
  else
    # Check for screenshots in Maestro output
    SCREENSHOT_COUNT=0
    MAESTRO_TESTS_DIR="$HOME/.maestro/tests"
    if [ -d "$MAESTRO_TESTS_DIR" ]; then
      SCREENSHOT_COUNT=$(find "$MAESTRO_TESTS_DIR" -name '*.png' -newer "$FLOW_LOG" 2>/dev/null | wc -l | tr -d ' ')
    fi

    if [ "$SCREENSHOT_COUNT" -gt 0 ]; then
      log "📸 Found $SCREENSHOT_COUNT screenshot(s) for $FLOW_NAME"
      # Copy screenshots to artifacts
      find "$MAESTRO_TESTS_DIR" -name '*.png' -newer "$FLOW_LOG" -exec cp {} "$ARTIFACTS_DIR/" \; 2>/dev/null
    else
      log "⚠️ No screenshots found for $FLOW_NAME (flow may not use takeScreenshot)"
    fi

    log "✅ Flow $FLOW_NAME PASSED"
    PASSED_FLOWS=$((PASSED_FLOWS + 1))
  fi

  # Validate video
  if [ -f "$VIDEO_FILE" ]; then
    VIDSIZE=$(stat -f%z "$VIDEO_FILE" 2>/dev/null || stat -c%s "$VIDEO_FILE" 2>/dev/null || echo "0")
    if [ "$VIDSIZE" -gt 0 ]; then
      VIDSIZE_H=$(du -h "$VIDEO_FILE" | cut -f1)
      log "🎬 Video for $FLOW_NAME: $VIDSIZE_H"
      VIDEOS_RECORDED=$((VIDEOS_RECORDED + 1))
    else
      log "⚠️ Video for $FLOW_NAME is empty (0 bytes)"
    fi
  else
    log "⚠️ No video recorded for $FLOW_NAME"
  fi

  log "--- End flow $FLOW_NAME ---"
done

# -------------------------------------------------------
# Step 6: iOS tests (if device available)
# -------------------------------------------------------
log "Step 6/6: Checking iOS device..."
if ideviceinfo -u "$IOS_DEVICE_ID" -k DeviceName >> "$LOG_FILE" 2>&1; then
  log "📱 iOS device found, skipping iOS build for now (use cached .app when available)"
else
  log "ℹ️ iOS device not available, skipping iOS tests"
fi

# -------------------------------------------------------
# Summary
# -------------------------------------------------------
log ""
log "=== E2E Pipeline Complete for Issue #$ISSUE_ID ==="
log "📊 Summary: $PASSED_FLOWS/$TOTAL_FLOWS flows passed, $VIDEOS_RECORDED video(s) recorded"
if [ $FAILED_FLOWS -gt 0 ]; then
  log "❌ $FAILED_FLOWS flow(s) FAILED"
fi
log "Artifacts:"
ls -la "$ARTIFACTS_DIR" >> "$LOG_FILE" 2>&1

if [ $ANY_FAILED -ne 0 ]; then
  fail "$FAILED_FLOWS/$TOTAL_FLOWS flows failed — see individual test-output logs"
fi

exit 0
