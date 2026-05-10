// electron-builder afterSign hook: ships the signed .app to Apple's
// notary service via notarytool, then staples the ticket so Gatekeeper
// trusts the bundle offline.
//
// Triggered automatically by electron-builder during `npm run electron:build:mac`
// when ALL of these env vars are set:
//   APPLE_ID                 — Apple Developer account email
//   APPLE_ID_PASSWORD        — App-specific password (NOT your iCloud password)
//                              Generate at appleid.apple.com → Sign-In and Security
//                              → App-Specific Passwords. Label it "drift-notarize".
//   APPLE_TEAM_ID            — 10-char team identifier from
//                              developer.apple.com → Membership.
//
// If any are missing we log "skipped" and exit 0 — local dev builds
// (ad-hoc signed) keep working without throwing this hook in your face.
//
// To enable on a fresh machine:
//   export APPLE_ID="you@example.com"
//   export APPLE_ID_PASSWORD="abcd-efgh-ijkl-mnop"
//   export APPLE_TEAM_ID="ABCDE12345"
//   npm run electron:build:mac
//
// To enable in CI (GitHub Actions): set the three values as repository
// secrets and pass them through to the build job's env.

const { notarize } = require("@electron/notarize");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_ID_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.log(
      "[notarize] APPLE_ID / APPLE_ID_PASSWORD / APPLE_TEAM_ID not set — skipping notarization (build will be ad-hoc signed only)."
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[notarize] submitting ${appPath} to Apple notary…`);
  console.log("[notarize] this typically takes 2–5 minutes; do not Ctrl-C.");

  await notarize({
    tool: "notarytool",
    appPath,
    appleId,
    appleIdPassword,
    teamId,
  });

  console.log("[notarize] done — bundle stapled and Gatekeeper-trusted.");
};
