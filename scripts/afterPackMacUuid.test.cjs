const test = require("node:test");
const assert = require("node:assert/strict");

const {
  adHocSignAppBundle,
  deriveUuid,
  patchMachOBuffer,
  pruneAsarHeaderEntries,
  pruneCursorSdkPlatformPackages,
  readAsarHeader,
} = require("./afterPackMacUuid.cjs");

const LC_UUID = 0x1b;
const LC_OTHER = 0x19;
const MH_MAGIC_64 = 0xfeedfacf;

function align4(value) {
  return value + ((4 - (value % 4)) % 4);
}

function writeFakeAsar(asarPath, header, payload = Buffer.from("packed-payload")) {
  const headerString = JSON.stringify(header);
  const headerStringLength = Buffer.byteLength(headerString);
  const headerPayloadSize = 4 + align4(headerStringLength);
  const headerSize = 4 + headerPayloadSize;
  const sizeBuf = Buffer.alloc(8);
  const headerBuf = Buffer.alloc(headerSize);

  sizeBuf.writeUInt32LE(4, 0);
  sizeBuf.writeUInt32LE(headerSize, 4);
  headerBuf.writeUInt32LE(headerPayloadSize, 0);
  headerBuf.writeInt32LE(headerStringLength, 4);
  headerBuf.write(headerString, 8, headerStringLength, "utf8");

  require("node:fs").writeFileSync(asarPath, Buffer.concat([sizeBuf, headerBuf, payload]));
  return headerSize;
}

// Build a minimal thin little-endian 64-bit Mach-O with two load commands:
// one dummy command and one LC_UUID carrying `uuidBytes`.
function buildThinMachO(uuidBytes) {
  const header = Buffer.alloc(32);
  header.writeUInt32LE(MH_MAGIC_64, 0); // magic
  header.writeUInt32LE(0x0100000c, 4); // cputype arm64 (value irrelevant)
  header.writeUInt32LE(0, 8); // cpusubtype
  header.writeUInt32LE(2, 12); // filetype
  header.writeUInt32LE(2, 16); // ncmds
  header.writeUInt32LE(16 + 24, 20); // sizeofcmds
  header.writeUInt32LE(0, 24); // flags
  header.writeUInt32LE(0, 28); // reserved

  const dummy = Buffer.alloc(16);
  dummy.writeUInt32LE(LC_OTHER, 0); // cmd
  dummy.writeUInt32LE(16, 4); // cmdsize
  dummy.fill(0xab, 8); // payload sentinel

  const uuidCmd = Buffer.alloc(24);
  uuidCmd.writeUInt32LE(LC_UUID, 0); // cmd
  uuidCmd.writeUInt32LE(24, 4); // cmdsize
  uuidBytes.copy(uuidCmd, 8);

  return Buffer.concat([header, dummy, uuidCmd]);
}

// Wrap one or more thin slices in a big-endian 32-bit fat binary.
function buildFatMachO(slices) {
  const headerSize = 8 + slices.length * 20;
  const header = Buffer.alloc(headerSize);
  header.writeUInt32BE(0xcafebabe, 0); // FAT_MAGIC
  header.writeUInt32BE(slices.length, 4);

  let offset = headerSize;
  const offsets = [];
  for (let i = 0; i < slices.length; i += 1) {
    const archOff = 8 + i * 20;
    header.writeUInt32BE(0x0100000c, archOff); // cputype
    header.writeUInt32BE(0, archOff + 4); // cpusubtype
    header.writeUInt32BE(offset, archOff + 8); // offset
    header.writeUInt32BE(slices[i].length, archOff + 12); // size
    header.writeUInt32BE(0, archOff + 16); // align
    offsets.push(offset);
    offset += slices[i].length;
  }

  return Buffer.concat([header, ...slices]);
}

test("deriveUuid is deterministic and 16 bytes", () => {
  const a = deriveUuid("top.magies.terminal");
  const b = deriveUuid("top.magies.terminal");
  assert.equal(a.length, 16);
  assert.ok(a.equals(b));
});

test("deriveUuid differs per appId and sets version/variant bits", () => {
  const a = deriveUuid("top.magies.terminal");
  const b = deriveUuid("com.example.other");
  assert.ok(!a.equals(b));
  assert.equal(a[6] & 0xf0, 0x50); // version 5
  assert.equal(a[8] & 0xc0, 0x80); // RFC 4122 variant
});

test("patchMachOBuffer rewrites LC_UUID in a thin Mach-O and leaves the rest intact", () => {
  const original = Buffer.alloc(16, 0x11);
  const buf = buildThinMachO(original);
  const uuid = deriveUuid("top.magies.terminal");

  const { patched, oldUuids } = patchMachOBuffer(buf, uuid);

  assert.equal(patched, 1);
  assert.equal(oldUuids[0], original.toString("hex"));
  // LC_UUID payload is now our derived uuid (uuid command starts at byte 48).
  assert.ok(buf.subarray(48 + 8, 48 + 24).equals(uuid));
  // Header magic + the dummy command's payload are untouched.
  assert.equal(buf.readUInt32LE(0), MH_MAGIC_64);
  assert.equal(buf.readUInt32LE(32), LC_OTHER);
  assert.ok(buf.subarray(32 + 8, 32 + 16).equals(Buffer.alloc(8, 0xab)));
});

test("patchMachOBuffer patches every slice of a fat binary", () => {
  const slice1 = buildThinMachO(Buffer.alloc(16, 0x22));
  const slice2 = buildThinMachO(Buffer.alloc(16, 0x33));
  const fat = buildFatMachO([slice1, slice2]);
  const uuid = deriveUuid("top.magies.terminal");

  const { patched } = patchMachOBuffer(fat, uuid);

  assert.equal(patched, 2);
});

test("patchMachOBuffer reports zero when there is no LC_UUID", () => {
  // A thin Mach-O whose single command is not LC_UUID.
  const header = Buffer.alloc(32);
  header.writeUInt32LE(MH_MAGIC_64, 0);
  header.writeUInt32LE(1, 16); // ncmds
  const cmd = Buffer.alloc(16);
  cmd.writeUInt32LE(LC_OTHER, 0);
  cmd.writeUInt32LE(16, 4);
  const buf = Buffer.concat([header, cmd]);

  const { patched } = patchMachOBuffer(buf, deriveUuid("top.magies.terminal"));
  assert.equal(patched, 0);
});

test("adHocSignAppBundle signs the full app bundle on macOS hosts", () => {
  const calls = [];

  const didSign = adHocSignAppBundle("/tmp/MagiesTerminal.app", {
    hostPlatform: "darwin",
    execFileSync: (bin, args, options) => {
      calls.push({ bin, args, options });
    },
  });

  assert.equal(didSign, true);
  assert.deepEqual(calls, [
    {
      bin: "codesign",
      args: [
        "--force",
        "--deep",
        "--sign",
        "-",
        "--timestamp=none",
        "/tmp/MagiesTerminal.app",
      ],
      options: { stdio: ["ignore", "pipe", "pipe"] },
    },
  ]);
});

test("adHocSignAppBundle skips non-macOS hosts", () => {
  let called = false;

  const didSign = adHocSignAppBundle("/tmp/MagiesTerminal.app", {
    hostPlatform: "linux",
    execFileSync: () => {
      called = true;
    },
  });

  assert.equal(didSign, false);
  assert.equal(called, false);
});

test("pruneAsarHeaderEntries removes package records without moving packed payload", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiesTerminal-prune-asar-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const asarPath = path.join(tempDir, "app.asar");
  const payload = Buffer.from("packed-payload");
  const headerSize = writeFakeAsar(
    asarPath,
    {
      files: {
        node_modules: {
          files: {
            "@cursor": {
              files: {
                "sdk-darwin-arm64": {
                  files: {
                    "package.json": { size: 2, unpacked: true },
                  },
                },
                "sdk-darwin-x64": {
                  files: {
                    "package.json": { size: 2, unpacked: true },
                  },
                },
              },
            },
          },
        },
        "packed.txt": { size: payload.length, offset: "0" },
      },
    },
    payload,
  );

  const removed = pruneAsarHeaderEntries(asarPath, ["node_modules/@cursor/sdk-darwin-x64"]);
  const { header, headerSize: updatedHeaderSize } = readAsarHeader(asarPath);
  const packedPayload = fs.readFileSync(asarPath).subarray(8 + headerSize);

  assert.deepEqual(removed, ["node_modules/@cursor/sdk-darwin-x64"]);
  assert.equal(updatedHeaderSize, headerSize);
  assert.ok(header.files.node_modules.files["@cursor"].files["sdk-darwin-arm64"]);
  assert.equal(header.files.node_modules.files["@cursor"].files["sdk-darwin-x64"], undefined);
  assert.equal(packedPayload.toString("utf8"), payload.toString("utf8"));
});

test("pruneCursorSdkPlatformPackages keeps only the target macOS arch package", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiesTerminal-prune-cursor-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const cursorRoot = path.join(
    tempDir,
    "MagiesTerminal.app",
    "Contents",
    "Resources",
    "app.asar.unpacked",
    "node_modules",
    "@cursor",
  );
  fs.mkdirSync(path.join(cursorRoot, "sdk-darwin-arm64"), { recursive: true });
  fs.mkdirSync(path.join(cursorRoot, "sdk-darwin-x64"), { recursive: true });
  writeFakeAsar(path.join(tempDir, "MagiesTerminal.app", "Contents", "Resources", "app.asar"), {
    files: {
      node_modules: {
        files: {
          "@cursor": {
            files: {
              "sdk-darwin-arm64": { files: { "package.json": { size: 2, unpacked: true } } },
              "sdk-darwin-x64": { files: { "package.json": { size: 2, unpacked: true } } },
            },
          },
        },
      },
    },
  });

  const removed = pruneCursorSdkPlatformPackages({
    electronPlatformName: "darwin",
    arch: 3,
    appOutDir: tempDir,
    packager: { appInfo: { productFilename: "MagiesTerminal" } },
  });

  assert.deepEqual(removed, ["sdk-darwin-x64"]);
  assert.ok(fs.existsSync(path.join(cursorRoot, "sdk-darwin-arm64")));
  assert.ok(!fs.existsSync(path.join(cursorRoot, "sdk-darwin-x64")));

  const { header } = readAsarHeader(
    path.join(tempDir, "MagiesTerminal.app", "Contents", "Resources", "app.asar"),
  );
  assert.ok(header.files.node_modules.files["@cursor"].files["sdk-darwin-arm64"]);
  assert.equal(header.files.node_modules.files["@cursor"].files["sdk-darwin-x64"], undefined);
});

test("pruneCursorSdkPlatformPackages keeps both macOS packages for universal builds", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiesTerminal-prune-cursor-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const cursorRoot = path.join(
    tempDir,
    "MagiesTerminal.app",
    "Contents",
    "Resources",
    "app.asar.unpacked",
    "node_modules",
    "@cursor",
  );
  fs.mkdirSync(path.join(cursorRoot, "sdk-darwin-arm64"), { recursive: true });
  fs.mkdirSync(path.join(cursorRoot, "sdk-darwin-x64"), { recursive: true });

  const removed = pruneCursorSdkPlatformPackages({
    electronPlatformName: "darwin",
    arch: 4,
    appOutDir: tempDir,
    packager: { appInfo: { productFilename: "MagiesTerminal" } },
  });

  assert.deepEqual(removed, []);
  assert.ok(fs.existsSync(path.join(cursorRoot, "sdk-darwin-arm64")));
  assert.ok(fs.existsSync(path.join(cursorRoot, "sdk-darwin-x64")));
});

test("pruneCursorSdkPlatformPackages keeps only the target Linux arch package", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiesTerminal-prune-cursor-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const cursorRoot = path.join(
    tempDir,
    "resources",
    "app.asar.unpacked",
    "node_modules",
    "@cursor",
  );
  fs.mkdirSync(path.join(cursorRoot, "sdk-linux-arm64"), { recursive: true });
  fs.mkdirSync(path.join(cursorRoot, "sdk-linux-x64"), { recursive: true });

  const removed = pruneCursorSdkPlatformPackages({
    electronPlatformName: "linux",
    arch: 1,
    appOutDir: tempDir,
    packager: { appInfo: { productFilename: "magiesTerminal" } },
  });

  assert.deepEqual(removed, ["sdk-linux-arm64"]);
  assert.ok(!fs.existsSync(path.join(cursorRoot, "sdk-linux-arm64")));
  assert.ok(fs.existsSync(path.join(cursorRoot, "sdk-linux-x64")));
});

test("repairAsarFileIntegrity rewrites mismatched per-file hashes", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const crypto = require("node:crypto");
  const {
    repairAsarFileIntegrity,
    readAsarHeader,
    writeAsarHeaderPreservingDataOffset,
  } = require("./afterPackMacUuid.cjs");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiesTerminal-repair-asar-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const asarPath = path.join(tempDir, "app.asar");
  const payload = Buffer.from("hello-integrity-payload");
  const wrongHash = "0".repeat(64);
  const headerSize = writeFakeAsar(
    asarPath,
    {
      files: {
        "packed.txt": {
          size: payload.length,
          offset: "0",
          integrity: {
            algorithm: "SHA256",
            hash: wrongHash,
            blockSize: 4194304,
            blocks: [wrongHash],
          },
        },
      },
    },
    payload,
  );

  const { fixed } = repairAsarFileIntegrity(asarPath);
  assert.equal(fixed, 1);

  const { header, headerSize: updatedHeaderSize } = readAsarHeader(asarPath);
  assert.equal(updatedHeaderSize, headerSize);
  const expected = crypto.createHash("sha256").update(payload).digest("hex");
  assert.equal(header.files["packed.txt"].integrity.hash, expected);
  assert.deepEqual(header.files["packed.txt"].integrity.blocks, [expected]);

  // Ensure rewrite still fits the original header budget.
  writeAsarHeaderPreservingDataOffset(asarPath, header, headerSize);
});

// Minimal PE32+ x64 executable resedit can parse: DOS header + PE signature +
// COFF header + optional header + one .text section.
function buildMinimalPeExecutable() {
  const dos = Buffer.alloc(64);
  dos.write("MZ", 0, "ascii");
  dos.writeUInt32LE(64, 0x3c); // e_lfanew

  const sig = Buffer.from("PE\0\0", "ascii");
  const coff = Buffer.alloc(20);
  coff.writeUInt16LE(0x8664, 0); // machine amd64
  coff.writeUInt16LE(1, 2); // 1 section
  coff.writeUInt16LE(240, 16); // size of optional header
  coff.writeUInt16LE(0x0022, 18); // EXECUTABLE_IMAGE | LARGE_ADDRESS_AWARE

  const opt = Buffer.alloc(240);
  opt.writeUInt16LE(0x20b, 0); // PE32+
  opt.writeUInt32LE(0x1000, 16); // AddressOfEntryPoint
  opt.writeBigUInt64LE(0x140000000n, 24); // ImageBase
  opt.writeUInt32LE(0x1000, 32); // SectionAlignment
  opt.writeUInt32LE(0x200, 36); // FileAlignment
  opt.writeUInt16LE(6, 40); // MajorOperatingSystemVersion
  opt.writeUInt16LE(6, 48); // MajorSubsystemVersion
  opt.writeUInt32LE(0x2000, 56); // SizeOfImage
  opt.writeUInt32LE(0x400, 60); // SizeOfHeaders
  opt.writeUInt16LE(3, 68); // Subsystem: console
  opt.writeBigUInt64LE(0x100000n, 72); // SizeOfStackReserve
  opt.writeBigUInt64LE(0x1000n, 80); // SizeOfStackCommit
  opt.writeBigUInt64LE(0x100000n, 88); // SizeOfHeapReserve
  opt.writeBigUInt64LE(0x1000n, 96); // SizeOfHeapCommit
  opt.writeUInt32LE(16, 108); // NumberOfRvaAndSizes

  const sect = Buffer.alloc(40);
  sect.write(".text", 0, "ascii");
  sect.writeUInt32LE(0x200, 8); // VirtualSize
  sect.writeUInt32LE(0x1000, 12); // VirtualAddress
  sect.writeUInt32LE(0x200, 16); // SizeOfRawData
  sect.writeUInt32LE(0x400, 20); // PointerToRawData
  sect.writeUInt32LE(0x60000020, 36); // CODE | EXECUTE | READ

  const headers = Buffer.concat([dos, sig, coff, opt, sect]);
  const image = Buffer.alloc(0x400 + 0x200);
  headers.copy(image, 0);
  image[0x400] = 0xc3; // ret
  return image;
}

function writeFakeWinExe(exePath, embeddedHash) {
  const { NtExecutable, NtExecutableResource } = require("resedit");
  const executable = NtExecutable.from(buildMinimalPeExecutable());
  const resource = NtExecutableResource.from(executable);
  if (embeddedHash != null) {
    resource.entries.push({
      type: "INTEGRITY",
      id: "ELECTRONASAR",
      bin: Buffer.from(
        JSON.stringify([{ file: "resources\\app.asar", alg: "SHA256", value: embeddedHash }]),
      ),
      lang: 1033,
      codepage: 1252,
    });
  }
  resource.outputResource(executable);
  require("node:fs").writeFileSync(exePath, Buffer.from(executable.generate()));
}

function readEmbeddedWinIntegrity(exePath) {
  const { NtExecutable, NtExecutableResource } = require("resedit");
  const executable = NtExecutable.from(require("node:fs").readFileSync(exePath));
  const resource = NtExecutableResource.from(executable);
  const entry = resource.entries.find((e) => e.type === "INTEGRITY" && e.id === "ELECTRONASAR");
  return entry ? JSON.parse(Buffer.from(entry.bin).toString("utf8")) : null;
}

test("updateWinAsarIntegrityResource re-embeds the current ASAR header hash", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const crypto = require("node:crypto");
  const {
    updateWinAsarIntegrityResource,
    readAsarHeaderString,
  } = require("./afterPackMacUuid.cjs");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiesTerminal-win-integrity-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const asarPath = path.join(tempDir, "app.asar");
  writeFakeAsar(asarPath, { files: {} });
  const exePath = path.join(tempDir, "MagiesTerminal.exe");
  writeFakeWinExe(exePath, "0".repeat(64)); // stale hash

  const headerHash = updateWinAsarIntegrityResource(exePath, asarPath);

  const expected = crypto
    .createHash("sha256")
    .update(readAsarHeaderString(asarPath))
    .digest("hex");
  assert.equal(headerHash, expected);
  assert.deepEqual(readEmbeddedWinIntegrity(exePath), [
    { file: "resources\\app.asar", alg: "SHA256", value: expected },
  ]);
});

test("updateWinAsarIntegrityResource is a no-op without an embedded integrity resource", (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { updateWinAsarIntegrityResource } = require("./afterPackMacUuid.cjs");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiesTerminal-win-integrity-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const asarPath = path.join(tempDir, "app.asar");
  writeFakeAsar(asarPath, { files: {} });
  const exePath = path.join(tempDir, "MagiesTerminal.exe");
  writeFakeWinExe(exePath, null);
  const before = fs.readFileSync(exePath);

  assert.equal(updateWinAsarIntegrityResource(exePath, asarPath), null);
  assert.deepEqual(fs.readFileSync(exePath), before);
});

// Regression test for the v0.2.7 Windows startup failure: afterPack repairs
// per-file ASAR hashes (rewriting the header) AFTER electron-builder embedded
// the header hash into the exe, so the embedded hash went stale and Electron's
// EnableEmbeddedAsarIntegrityValidation fuse killed the app at launch.
test("afterPack refreshes the Windows exe integrity resource after ASAR mutations", async (t) => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const crypto = require("node:crypto");
  const afterPack = require("./afterPackMacUuid.cjs");
  const { readAsarHeaderString } = require("./afterPackMacUuid.cjs");

  const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), "magiesTerminal-win-afterpack-"));
  t.after(() => fs.rmSync(appOutDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(appOutDir, "resources"));

  const asarPath = path.join(appOutDir, "resources", "app.asar");
  const payload = Buffer.from("win-afterpack-payload");
  writeFakeAsar(
    asarPath,
    {
      files: {
        "packed.txt": {
          size: payload.length,
          offset: "0",
          integrity: {
            algorithm: "SHA256",
            hash: "0".repeat(64), // wrong on purpose: forces a header rewrite
            blockSize: 4194304,
            blocks: ["0".repeat(64)],
          },
        },
      },
    },
    payload,
  );

  // Embed the hash of the PRE-repair header, exactly like electron-builder does.
  const staleHash = crypto
    .createHash("sha256")
    .update(readAsarHeaderString(asarPath))
    .digest("hex");
  const exePath = path.join(appOutDir, "MagiesTerminal.exe");
  writeFakeWinExe(exePath, staleHash);

  await afterPack({
    electronPlatformName: "win32",
    appOutDir,
    arch: 1, // x64
    packager: { appInfo: { productFilename: "MagiesTerminal" } },
  });

  const repairedHash = crypto
    .createHash("sha256")
    .update(readAsarHeaderString(asarPath))
    .digest("hex");
  assert.notEqual(repairedHash, staleHash);
  assert.deepEqual(readEmbeddedWinIntegrity(exePath), [
    { file: "resources\\app.asar", alg: "SHA256", value: repairedHash },
  ]);
});
