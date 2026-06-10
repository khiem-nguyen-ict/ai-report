#!/bin/bash

# Exit on error
set -e

# 🔥 Ensure consistent PATH (Terminal + Automator)
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# 🔥 Resolve script directory reliably (works in Automator too)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 🔥 Optional debug log (helps when running via Automator)
LOG_FILE="/tmp/automator-script.log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=== Script started at $(date) ==="
echo "Running as: $(whoami)"
echo "Working dir: $SCRIPT_DIR"
echo "PATH: $PATH"

# 🔥 Move to script directory (important for relative paths)
cd "$SCRIPT_DIR"

# 🔥 Load .env safely
ENV_FILE="${SCRIPT_DIR}/.env"
if [[ -f "$ENV_FILE" ]]; then
    echo "Loading .env file..."

    while IFS='=' read -r key value; do
        # Skip empty lines and comments
        [[ -z "$key" || "$key" =~ ^# ]] && continue

        # Trim whitespace
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)

        export "$key"="$value"
    done < "$ENV_FILE"
else
    echo "⚠️ .env file not found at $ENV_FILE"
fi

# 🔥 Determine notify-only flag
notify_only=false
node_args=()
for arg in "$@"; do
    if [[ "$arg" == "--notify" ]]; then
        notify_only=true
    else
        node_args+=("$arg")
    fi
done

if [[ "$notify_only" == true ]]; then
    node_args+=("--notify")
fi

# 🔥 Run Node script
echo "Running Node script..."
/usr/local/bin/node "${SCRIPT_DIR}/index.js" "${node_args[@]}"

if [[ "$notify_only" == true ]]; then
    echo "Finished running Node script in notify-only mode."
    exit 0
fi

# 🔥 Ensure kakao script is executable
KAKAO_SCRIPT="${SCRIPT_DIR}/src/services/kakao-talk.sh"

if [[ ! -f "$KAKAO_SCRIPT" ]]; then
    echo "❌ kakao-talk.sh not found at $KAKAO_SCRIPT"
    exit 1
fi

chmod +x "$KAKAO_SCRIPT"

# 🔥 Run kakao script explicitly with bash (Automator-safe)
echo "Running kakao-talk.sh..."
/bin/bash "$KAKAO_SCRIPT"

echo "=== Script finished at $(date) ==="
