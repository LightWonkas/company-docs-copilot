// Generates the local ES256 JWT signing key on first run (it is gitignored, so
// every clone gets its own). Runs before `supabase start` via the db:start script.
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const KEY_FILE = "supabase/signing_keys.json";

if (existsSync(KEY_FILE)) {
  console.log(`${KEY_FILE} exists.`);
} else {
  // Run outside the project: config.toml already points at the (missing) key
  // file, which makes the CLI refuse to load it. stdout is the JWK set.
  const cli = resolve("node_modules/.bin/supabase");
  const jwks = execSync(`"${cli}" gen signing-key --algorithm ES256`, {
    cwd: mkdtempSync(join(tmpdir(), "cdc-key-")),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  // The CLI prints one JWK; the keys file is a JWK array (rotation appends).
  const jwk: unknown = JSON.parse(jwks);
  writeFileSync(KEY_FILE, JSON.stringify(Array.isArray(jwk) ? jwk : [jwk], null, 2));
  console.log(`Generated ES256 signing key at ${KEY_FILE}.`);
}
