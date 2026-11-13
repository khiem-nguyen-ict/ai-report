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

# 🔥 Parse arguments: --env-file / -e before loading .env
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env}"
notify_only=false
node_args=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --env-file)
            [[ $# -lt 2 ]] && { echo "❌ --env-file requires a value" >&2; exit 1; }
            ENV_FILE="$2"
            shift 2
            ;;
        --env-file=*)
            ENV_FILE="${1#--env-file=}"
            shift
            ;;
        -e)
            [[ $# -lt 2 ]] && { echo "❌ -e requires a value" >&2; exit 1; }
            ENV_FILE="$2"
            shift 2
            ;;
        -e=*)
            ENV_FILE="${1#-e=}"
            shift
            ;;
        --notify)
            notify_only=true
            shift
            ;;
        *)
            node_args+=("$1")
            shift
            ;;
    esac
done

if [[ "$notify_only" == true ]]; then
    node_args+=("--notify")
fi

# 🔥 Resolve env file path relative to SCRIPT_DIR
if [[ "$ENV_FILE" != /* ]]; then
    ENV_FILE="${SCRIPT_DIR}/${ENV_FILE}"
fi

# 🔥 Export ENV_FILE so child processes (node, kakao-talk.sh) can access it
export ENV_FILE

# 🔥 Load .env safely
if [[ -f "$ENV_FILE" ]]; then
    echo "Loading env file: $ENV_FILE"

    while IFS='=' read -r key value; do
        # Skip empty lines and comments
        [[ -z "$key" || "$key" =~ ^# ]] && continue

        # Trim whitespace
        key="${key#"${key%%[![:space:]]*}"}"
        key="${key%"${key##*[![:space:]]}"}"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"

        # Strip matching surrounding quotes
        if [[ "$value" =~ ^\'(.*)\'$ ]]; then
            value="${BASH_REMATCH[1]}"
        elif [[ "$value" =~ ^\"(.*)\"$ ]]; then
            value="${BASH_REMATCH[1]}"
        fi

        export "$key"="$value"
    done < "$ENV_FILE"
else
    echo "❌ Env file not found: $ENV_FILE"
    exit 1
fi

# 🔥 Run Node script
echo "Running Node script..."
NODE_CMD="$(command -v node || echo 'node')"
"$NODE_CMD" "${SCRIPT_DIR}/index.js" "${node_args[@]}"

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
