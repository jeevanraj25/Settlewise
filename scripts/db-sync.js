const { execSync } = require("child_process");

console.log("Checking database schema synchronization...");
try {
  execSync("npx prisma db push --accept-data-loss", {
    stdio: "inherit",
    timeout: 30000,
  });
  console.log("Database schema synchronized successfully.");
} catch (err) {
  console.warn("Database push skipped or offline (will proceed with build):", err.message);
}
