#!/bin/bash
set -eo pipefail

ISSUE_ID="${1:?Usage: deploy.sh <issue-id>}"
REPO_ROOT="$HOME/Documents/MapYourHealth"
MOBILE_ROOT="$REPO_ROOT/apps/mobile"
IOS_DIR="$MOBILE_ROOT/ios"
ARTIFACTS_DIR="$HOME/Documents/ai-queue-dashboard/artifacts/$ISSUE_ID"
LOG_FILE="$ARTIFACTS_DIR/deploy-pipeline.log"
APPLE_TEAM_ID="22X6D48M4G"

# Environment setup
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home 2>/dev/null || echo /Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home)}"

mkdir -p "$ARTIFACTS_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

fail() {
  local exit_code="${2:-1}"
  log "❌ DEPLOY PIPELINE FAILED: $1 (exit code: $exit_code)"
  exit "$exit_code"
}

log "=== Deploy Pipeline Started for Issue #$ISSUE_ID ==="

# -------------------------------------------------------
# Step 1: Sync amplify outputs
# -------------------------------------------------------
log "Step 1/7: Syncing amplify outputs..."
cd "$REPO_ROOT" && yarn sync:amplify >> "$LOG_FILE" 2>&1 || fail "amplify sync failed" 3
log "✅ Amplify sync complete"

# -------------------------------------------------------
# Step 2: Expo prebuild (iOS)
# -------------------------------------------------------
log "Step 2/7: Running expo prebuild --platform ios --clean..."
cd "$MOBILE_ROOT" && npx expo prebuild --platform ios --clean >> "$LOG_FILE" 2>&1 || fail "expo prebuild failed" 1
log "✅ Expo prebuild complete"

# -------------------------------------------------------
# Step 3: Pod install
# -------------------------------------------------------
log "Step 3/7: Running pod install..."
cd "$IOS_DIR" && LANG=en_US.UTF-8 pod install >> "$LOG_FILE" 2>&1 || fail "pod install failed" 1
log "✅ Pod install complete"

# -------------------------------------------------------
# Step 4: Archive build
# -------------------------------------------------------
log "Step 4/7: Archiving iOS build..."
ARCHIVE_PATH="$IOS_DIR/build/MapYourHealth.xcarchive"

if command -v fastlane &>/dev/null; then
  log "🚀 Using fastlane for archive..."
  cd "$IOS_DIR" && fastlane gym \
    --workspace MapYourHealth.xcworkspace \
    --scheme MapYourHealth \
    --configuration Release \
    --archive_path "$ARCHIVE_PATH" \
    --skip_package_ipa true \
    >> "$LOG_FILE" 2>&1 || fail "fastlane archive failed" 1
else
  log "🔨 Using xcodebuild for archive (fastlane not found)..."
  cd "$IOS_DIR" && xcodebuild \
    -workspace MapYourHealth.xcworkspace \
    -scheme MapYourHealth \
    -configuration Release \
    -sdk iphoneos \
    -archivePath "$ARCHIVE_PATH" \
    archive \
    DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
    >> "$LOG_FILE" 2>&1 || fail "xcodebuild archive failed" 1
fi

if [ ! -d "$ARCHIVE_PATH" ]; then
  fail "Archive not found at $ARCHIVE_PATH" 1
fi
ARCHIVE_SIZE=$(du -sh "$ARCHIVE_PATH" | cut -f1)
log "✅ Archive complete ($ARCHIVE_SIZE)"

# -------------------------------------------------------
# Step 5: Export IPA
# -------------------------------------------------------
log "Step 5/7: Exporting IPA..."
EXPORT_PATH="$IOS_DIR/build/export"
EXPORT_OPTIONS="$IOS_DIR/ExportOptions.plist"

# Create ExportOptions.plist if missing
if [ ! -f "$EXPORT_OPTIONS" ]; then
  log "📝 Creating ExportOptions.plist..."
  cat > "$EXPORT_OPTIONS" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>teamID</key>
  <string>22X6D48M4G</string>
</dict>
</plist>
PLIST
fi

xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  >> "$LOG_FILE" 2>&1 || fail "IPA export failed" 1

IPA_FILE=$(find "$EXPORT_PATH" -name '*.ipa' -print -quit 2>/dev/null)
if [ -z "$IPA_FILE" ]; then
  fail "No IPA found in $EXPORT_PATH" 1
fi
log "✅ IPA exported: $IPA_FILE"

# -------------------------------------------------------
# Step 6: Upload to TestFlight
# -------------------------------------------------------
log "Step 6/7: Uploading to TestFlight..."

# Check for App Store Connect API key
ASC_API_KEY="${ASC_API_KEY:-}"
ASC_API_ISSUER="${ASC_API_ISSUER:-}"

if command -v fastlane &>/dev/null && [ -n "$ASC_API_KEY" ]; then
  log "🚀 Uploading via fastlane pilot..."
  cd "$IOS_DIR" && fastlane pilot upload \
    --ipa "$IPA_FILE" \
    >> "$LOG_FILE" 2>&1 || fail "fastlane pilot upload failed" 1
  log "✅ Uploaded to TestFlight via fastlane"
elif [ -n "$ASC_API_KEY" ] && [ -n "$ASC_API_ISSUER" ]; then
  log "🚀 Uploading via xcrun altool..."
  xcrun altool --upload-app \
    -f "$IPA_FILE" \
    -t ios \
    --apiKey "$ASC_API_KEY" \
    --apiIssuer "$ASC_API_ISSUER" \
    >> "$LOG_FILE" 2>&1 || fail "altool upload failed" 1
  log "✅ Uploaded to TestFlight via altool"
else
  log "⚠️ No App Store Connect API key configured (ASC_API_KEY / ASC_API_ISSUER)"
  log "📦 Archive ready, manual upload needed"
  log "   Archive: $ARCHIVE_PATH"
  log "   IPA: $IPA_FILE"
fi

# -------------------------------------------------------
# Step 7: Save artifacts
# -------------------------------------------------------
log "Step 7/7: Saving artifacts..."

# Copy IPA to artifacts
if [ -n "$IPA_FILE" ] && [ -f "$IPA_FILE" ]; then
  cp "$IPA_FILE" "$ARTIFACTS_DIR/"
fi

# Extract build number from archive Info.plist
BUILD_NUMBER=""
INFO_PLIST="$ARCHIVE_PATH/Info.plist"
if [ -f "$INFO_PLIST" ]; then
  BUILD_NUMBER=$(/usr/libexec/PlistBuddy -c "Print :ApplicationProperties:CFBundleVersion" "$INFO_PLIST" 2>/dev/null || echo "unknown")
fi

# Save summary
cat > "$ARTIFACTS_DIR/deploy-summary.json" << EOF
{
  "issue": "$ISSUE_ID",
  "buildNumber": "$BUILD_NUMBER",
  "archiveSize": "$ARCHIVE_SIZE",
  "archivePath": "$ARCHIVE_PATH",
  "ipaPath": "$IPA_FILE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

log "📋 Build number: $BUILD_NUMBER"
log "📋 Archive size: $ARCHIVE_SIZE"
log ""
log "=== Deploy Pipeline Complete for Issue #$ISSUE_ID ==="

exit 0
