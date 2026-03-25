#!/bin/bash

# This script run on MAC only (Apple script)
# brew install cliclick is needed before running
# Also allow the permission for the app

# Get today's date (format: YYYY-MM-DD)
TODAY=$(date +"%Y-%m-%d")

MESSAGE="Daily Report - $TODAY:
- 123 123"

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

end tell

EOF
