#!/bin/bash
# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Exit on any error
set -e

# Load environment variables from .env file in the same directory
# Parse .env file properly to handle values with spaces
while IFS='=' read -r key value; do
    # Skip empty lines and comments
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    # Remove leading/trailing whitespace from key
    key=$(echo "$key" | xargs)
    # Remove leading/trailing whitespace from value and export
    value=$(echo "$value" | xargs)
    export "$key"="$value"
done < "${SCRIPT_DIR}/.env"

/usr/local/bin/node "${SCRIPT_DIR}/index.js" && \
chmod +x "${SCRIPT_DIR}/src/services/kakao-talk.sh" && \
"${SCRIPT_DIR}/src/services/kakao-talk.sh"