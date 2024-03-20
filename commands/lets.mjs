import fs from 'fs/promises';
import path from 'path';
import { execa } from 'execa';

const args = process.argv.slice(2);

const packageJsonName = "package.json";

const defaultPackageManager = "npm";

const lockFileNames = {
    npm: "package-lock.json",
    yarn: "yarn.lock",
};

const commandAliases = {
    codegen: ["codegen", "generate"],
    dev: ["dev", "develop"],
    format: ["format", "fmt", "prettier"],
    fmt: ["format", "fmt", "prettier"],
    lint: ["eslint", "lint"],
    tc: ["check-types", "tc", "typecheck"],
    typecheck: ["check-types", "tc", "typecheck"],
};

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function getPackageJson() {
    try {
        const cwd = process.cwd();
        const packageJsonPath = path.join(cwd, packageJsonName);
        const packageJson = await fs.readFile(packageJsonPath, "utf8");
        return JSON.parse(packageJson);
    } catch {
        return null;
    }
}

async function detectPackageManager() {
    const cwd = process.cwd();
    for (const [packageManager, lockFileName] of Object.entries(lockFileNames)) {
        const lockFilePath = path.join(cwd, lockFileName);
        if (await fileExists(lockFilePath)) {
            return packageManager;
        }
    }
    const packageJson = await getPackageJson();
    if (packageJson) {
        console.warn(
            `Found package.json but no lock file, assuming ${defaultPackageManager}`,
        );
        return defaultPackageManager;
    }
    return null;
}

async function processCommand(args) {
    const [command, ...commandArgs] = args;
    if (!command) {
        console.log("No command provided");
        return;
    }
    const packageManager = await detectPackageManager();
    if (!packageManager) {
        console.log("No package manager detected");
        return;
    }
    const packageJson = await getPackageJson();
    if (!packageJson) {
        console.log("No package.json found");
        return;
    }
    const scripts = packageJson.scripts;
    const aliases = commandAliases[command];
    if (!aliases) {
        console.log(`No aliases found for command: ${command}`);
        return;
    }
    for (const alias of aliases) {
        const hasAlias = !!scripts[alias];
        if (hasAlias) {
            execa(packageManager, ["run", alias, ...commandArgs]).then(({all}) => {
                console.log(all);
            })
            return;
        }
    }
    console.log(`No script found for command: ${command}`);
}

processCommand(args);
