import { execFile } from "node:child_process";

export function sqliteJson(dbPath, sql) {
  return new Promise((resolve, reject) => {
    execFile("sqlite3", ["-readonly", "-json", dbPath, sql], { maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      try {
        resolve(stdout.trim() ? JSON.parse(stdout) : []);
      } catch (parseError) {
        reject(parseError);
      }
    });
  });
}
