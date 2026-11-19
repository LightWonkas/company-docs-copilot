try {
  process.loadEnvFile(".env.local");
} catch {
  // CI sets env vars directly.
}
