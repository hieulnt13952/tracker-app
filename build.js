// Generates config.js from environment variables at build time.
// Run by Vercel during deployment — do not run manually.
const fs = require("fs");

const url = process.env.SUPABASE_URL || "YOUR_SUPABASE_URL";
const key = process.env.SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

fs.writeFileSync(
  "config.js",
  `window.SUPABASE_URL = "${url}";\nwindow.SUPABASE_ANON_KEY = "${key}";\n`
);

console.log("config.js generated. DEV_MODE =", url === "YOUR_SUPABASE_URL");
