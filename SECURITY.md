# Security Policy

## Supported versions

Only the latest released version of MagiesTerminal receives security updates.
Please upgrade to the newest release before reporting an issue — download it
from the official site: https://shell.magies.top

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately through GitHub's private vulnerability reporting:

1. Go to the **Security** tab of
   [Zhangwei930/MgTerminal](https://github.com/Zhangwei930/MgTerminal/security).
2. Click **Report a vulnerability** and describe the issue, including steps to
   reproduce, affected version/platform, and impact.

We aim to acknowledge reports within a few days and will keep you updated on
remediation. Once a fix ships, we're happy to credit reporters who wish to be
named.

## Scope

MagiesTerminal is a desktop SSH/SFTP/terminal client (Electron + React). Reports
that are especially valuable include: renderer sandbox or IPC escapes, credential
or vault handling flaws, host-key verification bypasses, insecure deep-link or
protocol handling, and vulnerabilities in bundled or transitive dependencies that
are reachable at runtime.
