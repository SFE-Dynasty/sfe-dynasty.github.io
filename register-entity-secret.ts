import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const apiKey: string | undefined = process.env.CIRCLE_API_KEY;
if (!apiKey) {
  throw new Error("CIRCLE_API_KEY is required.");
}

const existingEnv: string = existsSync(".env") ? readFileSync(".env", "utf8") : "";
if (/^CIRCLE_ENTITY_SECRET=/m.test(existingEnv)) {
  throw new Error("CIRCLE_ENTITY_SECRET already exists in .env. Refusing to overwrite.");
}

const entitySecret: string = randomBytes(32).toString("hex");
const recoveryFilePath: string = "./recovery";
mkdirSync(recoveryFilePath, { recursive: true });

await registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath: recoveryFilePath,
});

appendFileSync(".env", `\nCIRCLEE_ENTITY_SECRET=${entitySecret}\n`);

// Output for GitHub Actions to capture
console.log("ENTITY_SECRET=" + entitySecret);
console.log("Entity secret registered successfully.");