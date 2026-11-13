function isDebugEnabled() {
  return process.env.DEBUG === "true" || process.env.DEBUG === "1";
}

function debugLog(...args) {
  if (isDebugEnabled()) {
    console.log("[DEBUG]", ...args);
  }
}

function debugWarn(...args) {
  if (isDebugEnabled()) {
    console.warn("[DEBUG]", ...args);
  }
}

module.exports = { isDebugEnabled, debugLog, debugWarn };