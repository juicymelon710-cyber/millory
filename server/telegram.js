const https = require("https");

const API_HOST = "api.telegram.org";

function request(token, method, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: API_HOST,
      path: `/bot${token}/${method}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (!parsed.ok) {
            reject(new Error(parsed.description || "Eroare Telegram API."));
            return;
          }
          resolve(parsed.result);
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function sendMessage(token, chatId, text) {
  return request(token, "sendMessage", { chat_id: chatId, text });
}

module.exports = { sendMessage };
