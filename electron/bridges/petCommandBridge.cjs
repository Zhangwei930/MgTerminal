/**
 * Cross-platform spawn options for the desktop pet's user-configured command
 * (right-click "Run Command" and Settings → AI → Pet "Test Run").
 */

function isWindows(platform) {
  return (platform || process.platform) === "win32";
}

/**
 * Windows' spawn() goes through CreateProcess directly when shell is not
 * enabled, which resolves real .exe binaries on PATH but not .cmd/.bat
 * scripts or cmd.exe builtins (dir, npm, etc. all fail with ENOENT). macOS/Linux
 * resolve ordinary executables fine without a shell, so only Windows needs it.
 */
function buildPetCommandSpawnOptions(platform, baseOptions = {}) {
  return { ...baseOptions, shell: isWindows(platform) };
}

module.exports = { isWindows, buildPetCommandSpawnOptions };
