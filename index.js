require("dotenv").config();
const fs = require("fs");
const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const CHAT_ID = process.env.CHAT_ID;
const TROY_OUNCE_TO_GRAM = 31.1035;
const THRESHOLD_FILE = "./threshold.json";

// ===== Fungsi Threshold Management =====
function getThreshold() {
  if (!fs.existsSync(THRESHOLD_FILE)) {
    const defaultData = { idr_per_gram: 1000000, usd_to_idr: 16000 };
    fs.writeFileSync(THRESHOLD_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }

  const raw = fs.readFileSync(THRESHOLD_FILE);
  return JSON.parse(raw);
}

function setThreshold(newData) {
  fs.writeFileSync(THRESHOLD_FILE, JSON.stringify(newData, null, 2));
}

function getUSDToIDR() {
  const threshold = getThreshold();
  return threshold.usd_to_idr || 16000; // fallback kalau field usd_to_idr tidak ada
}

async function updateUSDToIDR() {
  try {
    const forexRes = await axios.get(
      `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_API_KEY}/latest/USD`
    );
    const usdToIdr = forexRes.data.conversion_rates.IDR;

    const threshold = getThreshold();
    threshold.usd_to_idr = usdToIdr;
    setThreshold(threshold);

    console.log(`[USD->IDR] Kurs diperbarui: ${usdToIdr} | ${getTimestamp()}`);
  } catch (err) {
    console.error(
      "Gagal update kurs USD-IDR:",
      err.response?.data || err.message
    );
  }
}

// ===== Fungsi Harga Emas =====
async function getGoldPricePerGramInIDR() {
  const goldRes = await axios.get("https://api.gold-api.com/price/XAU");
  const pricePerOunceUSD = goldRes.data.price;

  const usdToIdr = getUSDToIDR();

  const pricePerGramUSD = pricePerOunceUSD / TROY_OUNCE_TO_GRAM;
  const pricePerGramIDR = pricePerGramUSD * usdToIdr;

  return { pricePerGramIDR, pricePerGramUSD, usdToIdr };
}

async function checkPrice() {
  try {
    const { pricePerGramIDR, pricePerGramUSD, usdToIdr } =
      await getGoldPricePerGramInIDR();
    const thresholdData = getThreshold();
    const thresholdIDRPerGram = thresholdData.idr_per_gram;

    console.log(
      `[Harga Emas] Rp${Math.round(
        pricePerGramIDR
      ).toLocaleString()} | USD ${pricePerGramUSD.toFixed(
        2
      )} | Kurs: ${usdToIdr} | ${getTimestamp()}`
    );

    if (pricePerGramIDR < thresholdIDRPerGram) {
      await bot.sendMessage(
        CHAT_ID,
        `⚠️⚠️⚠️\n\nHarga emas turun!\n\nRp${Math.round(
          pricePerGramIDR
        ).toLocaleString()}/gram
\nBatas alert: Rp${thresholdIDRPerGram.toLocaleString()}/gram
\nWaktu: ${getTimestamp()}`
      );
    }
  } catch (err) {
    console.error("Gagal cek harga:", err.response?.data || err.message);
  }
}

// ===== Fungsi Timestamp Lokal =====
function getTimestamp() {
  return new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

// ======= Jalankan Bot =======
updateUSDToIDR(); // Update kurs pertama kali
setInterval(updateUSDToIDR, 1000 * 60 * 60 * 6); // Update kurs tiap 6 jam

checkPrice(); // Cek harga pertama kali
setInterval(checkPrice, 1000 * 60 * 15); // Cek harga tiap 15 menit

// ======= Bot Commands =======
// /set-harga-emas <angka>
bot.onText(/\/set-harga-emas (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const newThreshold = parseInt(match[1]);

  if (newThreshold < 100000 || newThreshold > 2000000) {
    bot.sendMessage(
      chatId,
      "Batas harga tidak wajar. Masukkan angka antara 100.000 – 2.000.000."
    );
    return;
  }

  const threshold = getThreshold();
  threshold.idr_per_gram = newThreshold;
  setThreshold(threshold);

  bot.sendMessage(
    chatId,
    `Batas harga diubah menjadi Rp${newThreshold.toLocaleString()}/gram`
  );
});

// /emas
bot.onText(/\/emas/, async (msg) => {
  try {
    const threshold = getThreshold();
    const { pricePerGramIDR, pricePerGramUSD, usdToIdr } =
      await getGoldPricePerGramInIDR();

    await bot.sendMessage(
      msg.chat.id,
      `Harga Emas Saat Ini: Rp${Math.round(
        pricePerGramIDR
      ).toLocaleString()}/gram
\nBatas Alert: Rp${threshold.idr_per_gram.toLocaleString()}/gram
\nKurs: ${usdToIdr}
\nWaktu: ${getTimestamp()}`
    );

    console.log(
      `[Harga Emas] Rp${Math.round(
        pricePerGramIDR
      ).toLocaleString()} | USD ${pricePerGramUSD.toFixed(
        2
      )} | Kurs: ${usdToIdr} | ${getTimestamp()}`
    );
  } catch (err) {
    console.error(
      "Gagal ambil harga emas (command):",
      err.response?.data || err.message
    );
  }
});
