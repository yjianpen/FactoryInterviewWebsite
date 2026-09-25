#!/usr/bin/env node
// One-off provisioning for C++/Java CodePad runs. Keep this separate from
// request-time sandboxes: package installation needs network access.
import { Sandbox } from "@vercel/sandbox";

const sandbox = await Sandbox.create({
  persistent: false,
  networkPolicy: "allow-all",
  timeout: 300_000,
  resources: { vcpus: 1 },
});

try {
  // No cwd: /vercel/sandbox does not exist in a fresh image, and commands
  // default to the filesystem root.
  const command = await sandbox.runCommand({
    cmd: "sudo",
    args: ["apt-get", "update"],
  });
  if (command.exitCode !== 0) throw new Error(await command.stderr());

  const install = await sandbox.runCommand({
    cmd: "sudo",
    args: ["apt-get", "install", "-y", "g++", "default-jdk-headless"],
  });
  if (install.exitCode !== 0) throw new Error(await install.stderr());

  const snapshot = await sandbox.snapshot({ expiration: 0 });
  console.log(`SANDBOX_TOOLCHAIN_SNAPSHOT_ID=${snapshot.snapshotId}`);
} finally {
  await sandbox.stop().catch(() => {});
}
