// SPDX-License-Identifier: AGPL-3.0-only
// Installing a downloaded update on Linux when Meadhall came as an .rpm or .deb package.
//
// electron-updater 6.8.9 runs `pkexec --disable-internal-agent /bin/bash -c "'dnf install ... file.rpm'"`: the single
// quotes are passed literally, so bash looks for a program called "dnf install ... file.rpm" and fails with 127
// ("command not found"). That broke every in-app update on Fedora (the owner saw "Command pkexec exited with code
// 127"). Here the package manager is run directly through pkexec, with proper arguments: the system asks for the
// password, then the package is installed (or downgraded, for "Install an earlier version").
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type LinuxPackageType = "rpm" | "deb";

// electron-builder writes the package type next to app.asar (resources/package-type). AppImages update themselves
// (no root needed), so they're left to electron-updater.
export function linuxPackageType(): LinuxPackageType | null {
    if (process.platform !== "linux" || process.env.APPIMAGE) return null;
    try {
        const type = fs.readFileSync(path.join(process.resourcesPath, "package-type"), "utf8").trim();
        return type === "rpm" || type === "deb" ? type : null;
    } catch {
        return null;
    }
}

function hasCommand(command: string): Promise<boolean> {
    return new Promise((resolve) => {
        execFile("/bin/sh", ["-c", 'command -v "$1"', "sh", command], (error) => resolve(!error));
    });
}

// The command that installs (or downgrades to) the package file. Exported for the manual fallback message and tests.
export async function packageInstallCommand(type: LinuxPackageType, file: string): Promise<string[]> {
    if (type === "deb") {
        return ["apt-get", "install", "-y", "--allow-downgrades", file];
    }
    for (const manager of ["dnf", "yum", "zypper"]) {
        if (await hasCommand(manager)) {
            return manager === "zypper"
                ? ["zypper", "--non-interactive", "install", "--allow-unsigned-rpm", "--oldpackage", "-f", file]
                : [manager, "install", "-y", "--nogpgcheck", file];
        }
    }
    return ["rpm", "-U", "--oldpackage", "--replacepkgs", file];
}

export function manualInstallHint(command: string[]): string {
    return `sudo ${command.map((part) => (/[\s'"$`\\]/.test(part) ? `'${part.replace(/'/g, "'\\''")}'` : part)).join(" ")}`;
}

// Runs the install with the system's password prompt (pkexec). Resolves when installed; rejects with a message
// that includes the command to run by hand if it couldn't (prompt cancelled, no pkexec, install failed).
export async function installLinuxPackage(type: LinuxPackageType, file: string): Promise<void> {
    const command = await packageInstallCommand(type, file);
    const hint = manualInstallHint(command);
    if (!(await hasCommand("pkexec"))) {
        throw new Error(`Couldn't ask for your password to install the update. Install it from a terminal: ${hint}`);
    }
    await new Promise<void>((resolve, reject) => {
        execFile("pkexec", command, { timeout: 15 * 60_000 }, (error, _stdout, stderr) => {
            if (!error) return resolve();
            // execFile reports the exit status as a number in `code` (despite the ErrnoException type).
            const code = (error as unknown as { code?: number | string }).code;
            // pkexec: 126 = the password prompt was cancelled, 127 = not authorised.
            const reason =
                code === 126 || code === 127
                    ? "The password prompt was cancelled or not accepted."
                    : `The package manager failed (${String(stderr || error.message).trim().split("\n").slice(-1)[0]}).`;
            reject(new Error(`${reason} You can install it from a terminal: ${hint}`));
        });
    });
}
