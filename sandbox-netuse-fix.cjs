// Preload de sandbox: substitui child_process.exec/execFile por versões que
// falham graciosamente (sem abrir pipes), para o "net use" do vite não quebrar.
const cp = require("node:child_process");
const { EventEmitter } = require("node:events");
function fakeExecFile(file, args, opts, callback) {
  if (typeof opts === "function") { callback = opts; opts = null; }
  const child = new EventEmitter();
  child.stdout = null; child.stderr = null; child.stdin = null;
  child.pid = 0; child.killed = false; child.kill = () => true;
  process.nextTick(() => {
    const err = new Error("exec disabled by sandbox preload: " + file);
    err.code = 1;
    if (callback) callback(err, "", "");
    child.emit("close", 1);
  });
  return child;
}
cp.execFile = fakeExecFile;
cp.exec = function exec(cmd, opts, callback) {
  if (typeof opts === "function") { callback = opts; opts = null; }
  return fakeExecFile(cmd, [], opts, callback);
};
cp.execSync = function () { return Buffer.alloc(0); };
cp.execFileSync = function () { return Buffer.alloc(0); };
