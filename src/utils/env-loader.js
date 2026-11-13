const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

let _loaded = false;
let _envFilePath = null;

function getEnvFilePath() {
  if (_envFilePath) return _envFilePath;

  // Priority: ENV_FILE env var > .env in project root
  const envFile = process.env.ENV_FILE
    ? path.resolve(process.cwd(), process.env.ENV_FILE)
    : path.join(__dirname, "../../.env");

  _envFilePath = envFile;
  return _envFilePath;
}

function loadEnv() {
  if (_loaded) return;

  const envFile = getEnvFilePath();
  if (!fs.existsSync(envFile)) {
    throw new Error(`Env file not found: ${envFile}`);
  }

  dotenv.config({ path: envFile });
  _loaded = true;
}

function getLoadedEnvPath() {
  return _envFilePath;
}

module.exports = { loadEnv, getEnvFilePath, getLoadedEnvPath };