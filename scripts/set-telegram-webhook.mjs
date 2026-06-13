import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env");
  process.exit(1);
}

if (!webhookUrl) {
  console.error("Missing TELEGRAM_WEBHOOK_URL in .env");
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: {
    "content-type": "application/json"
  },
  body: JSON.stringify({ url: webhookUrl })
});

const data = await response.json();
if (!response.ok || !data.ok) {
  console.error("Failed to set Telegram webhook:", data);
  process.exit(1);
}

console.log("Telegram webhook set:", data.result);
