const https = require("https");

const API_HOST = "chatapi.viber.com";

function request(pathname, token, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: API_HOST,
      path: pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body),
        "X-Viber-Auth-Token": token
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (parsed.status && parsed.status !== 0) {
            reject(new Error(parsed.status_message || "Eroare Viber API."));
            return;
          }
          resolve(parsed);
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

function sendMessage(token, receiverId, text) {
  return request("/pa/send_message", token, {
    receiver: receiverId,
    type: "text",
    sender: { name: "Millory" },
    text
  });
}

function setWebhook(token, url) {
  return request("/pa/set_webhook", token, { url });
}

module.exports = { sendMessage, setWebhook };
