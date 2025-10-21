// Minimal proxy for FatSecret on Render (Node 18+)
import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// Read credentials from env (set these on Render)
const CLIENT_ID = process.env.FATSECRET_CLIENT_ID;
const CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET;
const PORT = process.env.PORT || 3000;

let cachedToken = null;
let expiresAt = 0;

async function fetchAccessToken() {
  if (cachedToken && Date.now() < expiresAt - 30000) return cachedToken; // reuse if not near expiry

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "basic"
  });

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

  const res = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error("Token error: " + res.status + " " + text);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return cachedToken;
}

app.get("/search", async (req, res) => {
  try {
    const q = req.query.q || "";
    const token = await fetchAccessToken();

    // Use the Basic API instead of Premier
    const url = `https://platform.fatsecret.com/rest/server.api` +
      `?method=foods.search.v2&search_expression=${encodeURIComponent(q)}` +
      `&format=json&max_results=5&page_number=0`;

    const proxied = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await proxied.text();
    res.setHeader("Content-Type", "application/json");
    res.status(proxied.status).send(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`);
});
