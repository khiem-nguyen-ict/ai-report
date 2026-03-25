#!/bin/bash

# This script run on MAC only (Apple script)
# brew install cliclick is needed before running
# Also allow the permission for the app

# Get today's date (format: YYYY-MM-DD)
TODAY=$(date +"%Y-%m-%d")

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define the report directory (relative to script location)
REPORT_DIR="${SCRIPT_DIR}/../../app-data"

# Find the latest HTML report file (order by date DESC in filename)
LATEST_REPORT=$(ls -1 "$REPORT_DIR"/report_*.html 2>/dev/null | sort -r -t'_' -k2 | head -n1)

if [ -z "$LATEST_REPORT" ]; then
    echo "Error: no report found"
    exit 1
fi

echo "Found latest report: $LATEST_REPORT"

# Extract task categories and their sub-items from the HTML
# Categories are in <div class="task-category">...</div>
# Sub-items are in <li> inside <ul class="sub-list">
FINAL_CONTENT=$(sed -n '/<div class="task-category">/,/<\/ul>/p' "$LATEST_REPORT" | \
    sed 's/<div class="task-category">/📋 /g' | \
    sed 's/<li>/\n  ➜ /g' | \
    sed 's/<[^>]*>//g' | \
    sed 's/&nbsp;/ /g' | \
    sed 's/&amp;/\&/g' | \
    sed 's/&lt;/</g' | \
    sed 's/&gt;/>/g' | \
    sed 's/&quot;/"/g' | \
    sed "s/&#39;/'/g" | \
    sed "s/&apos;/'/g" | \
    awk 'NF {if (/^  ➜/) print; else {gsub(/^[[:space:]]+/, ""); print}}')

# Build the MESSAGE with the extracted content
MESSAGE="Daily Report - $TODAY:

$FINAL_CONTENT"

# Log the MESSAGE content for debugging
echo "===== MESSAGE CONTENT ====="
echo "$MESSAGE"
echo "===== END MESSAGE ====="

# Copy message to clipboard
echo "$MESSAGE" | pbcopy

# Open KakaoTalk
open -a "KakaoTalk"

# Run AppleScript
osascript <<EOF
tell application "KakaoTalk"
    activate
end tell

tell application "System Events"
    delay 1
    
    -- Check if we're on the main window (chat list)
    -- If not, press Escape to return to main window
    tell process "KakaoTalk"
        set frontmost to true
        delay 0.3
        
        -- Detect window type by checking window description
        -- Chat windows have " - KakaoTalk" in title when a chat is open
        -- Main window shows the chat list
        set windowTitle to name of front window
        
        -- If window title contains a chat name (not just "KakaoTalk"), we're in a chat
        -- Main window title is just "KakaoTalk" or "KakaoTalk - Chat"
        set isChatWindow to false
        if windowTitle is not equal to "KakaoTalk" and windowTitle is not equal to "KakaoTalk - Chat" then
            set isChatWindow to true
        end if
        
        -- Only press Escape if we're in a chat window (not main)
        if isChatWindow then
            key code 53 -- Escape key
            delay 0.5
        end if
    end tell
    
    -- Open search (Cmd + F)
    keystroke "f" using command down
    delay 0.3

	keystroke "a" using command down
    delay 0.2
    
    -- Type group name
    keystroke "[Insignary-TMA] AI Dev"
    delay 0.5
    
    -- Get KakaoTalk window position
    tell process "KakaoTalk"
        set frontmost to true
        delay 0.5
        
        set winPos to position of front window
        set winSize to size of front window
    end tell
    
    -- Calculate click position
    set clickX to (item 1 of winPos) + 200
    set clickY to (item 2 of winPos) + 150

    -- Double click using calculated position
    do shell script "cliclick dc:" & clickX & "," & clickY
    delay 0.5
    
    -- Paste message from clipboard
    keystroke "a" using command down
    delay 0.5
    keystroke "v" using command down
    delay 0.5
    
    -- Show confirmation dialog
    set confirmResult to display dialog "Do you want to send this message?" buttons {"Yes", "No"} default button "No" with icon note
    
    -- If user clicks Yes, send the message and close
    if button returned of confirmResult is "Yes" then
        -- Click Send button (approximate position based on window)
        set sendClickX to (item 1 of winPos) + (item 1 of winSize) - 100
        set sendClickY to (item 2 of winPos) + (item 2 of winSize) - 50
        do shell script "cliclick c:" & sendClickX & "," & sendClickY
        delay 0.5
        
        -- Press Escape 2 times to close all windows
        key code 53 -- Escape
        delay 0.3
        key code 53 -- Escape
        delay 0.3
    end if

end tell

EOF
