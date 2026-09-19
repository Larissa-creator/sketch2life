const path = require("path");
const QRCode = require(path.join(__dirname, "..", "frontend", "node_modules", "qrcode"));

const url = process.argv[2];
const out = process.argv[3];

if (!url || !out) {
  console.error("Usage: node generate-workshop-qr.js <url> <output.png>");
  process.exit(1);
}

QRCode.toFile(
  out,
  url,
  { width: 400, margin: 2, color: { dark: "#1a1a1a", light: "#ffffff" } },
  (err) => {
    if (err) {
      console.error(err.message);
      process.exit(1);
    }
    console.log(out);
  },
);
