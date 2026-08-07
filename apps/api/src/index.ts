import { createApp } from "./app.js";
import { API_CONFIG } from "./config.js";

const app = createApp();

app.listen(API_CONFIG.port, () => {
  console.log(`API listening on http://127.0.0.1:${API_CONFIG.port}`);
});