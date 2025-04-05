require("dotenv").config();
const fs = require("fs");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const CHAT_ID = process.env.CHAT_ID;
const TROY_OUNCE_TO_GRAM = 31.1035;
const THRESHOLD_FILE = "./threshold.json";

function getThreshold() {
  const raw = fs.readFileSync(THRESHOLD_FILE);
  return JSON.parse(raw).idr_per_gram;
}

function setThreshold(newValue) {
  fs.writeFileSync(
    THRESHOLD_FILE,
    JSON.stringify({ idr_per_gram: newValue }, null, 2)
  );
}

async function getGoldPricePerGramInIDR() {
  const goldRes = await axios.get("https://www.goldapi.io/api/XAU/USD", {
    headers: { "x-access-token": process.env.GOLD_API_KEY },
  });

  const pricePerOunceUSD = goldRes.data.price;

  const forexRes = await axios.get(
    `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_API_KEY}/latest/USD`
  );
  const usdToIdr = forexRes.data.conversion_rates.IDR;

  const pricePerGramUSD = pricePerOunceUSD / TROY_OUNCE_TO_GRAM;
  const pricePerGramIDR = pricePerGramUSD * usdToIdr;

  return { pricePerGramIDR, pricePerGramUSD, usdToIdr };
}

async function checkPrice() {
  try {
    const { pricePerGramIDR, pricePerGramUSD, usdToIdr } =
      await getGoldPricePerGramInIDR();
    const thresholdIDRPerGram = getThreshold();

    console.log(
      `Harga emas per gram: Rp${pricePerGramIDR.toLocaleString()} | USD ${pricePerGramUSD.toFixed(
        2
      )} | Kurs: ${usdToIdr}`
    );

    if (pricePerGramIDR < thresholdIDRPerGram) {
      await bot.sendMessage(
        CHAT_ID,
        `⚠️⚠️⚠️\n\nHarga emas turun!\n\nRp${Math.round(
          pricePerGramIDR
        ).toLocaleString()}/gram\n📉 Batas alert: Rp${thresholdIDRPerGram.toLocaleString()}/gram`
      );
    }
  } catch (err) {
    console.error("Gagal cek harga:", err.response?.data || err.message);
  }
}


checkPrice();
setInterval(checkPrice, 1000 * 60 * 30);

// ==== /set <angka> ====
bot.onText(/\/set (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const newThreshold = parseInt(match[1]);

  if (newThreshold < 100000 || newThreshold > 2000000) {
    bot.sendMessage(
      chatId,
      "Batas harga tidak wajar. Masukkan antara 100.000 – 2.000.000."
    );
    return;
  }

  setThreshold(newThreshold);
  bot.sendMessage(
    chatId,
    `Batas harga diubah ke Rp${newThreshold.toLocaleString()}/gram`
  );
});

// ==== /status ====
bot.onText(/\/status/, async (msg) => {
  const threshold = getThreshold();
  const { pricePerGramIDR } = await getGoldPricePerGramInIDR();

  bot.sendMessage(
    msg.chat.id,
    `Harga Emas Saat Ini: Rp${Math.round(
      pricePerGramIDR
    ).toLocaleString()}/gram\nBatas Alert: Rp${threshold.toLocaleString()}/gram`
  );
});
