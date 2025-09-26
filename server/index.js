/**
 * server/index.js
 * Express minimal, charge .env, monte les routes.
 */
import "dotenv/config";
import express from "express";
import loginRouter from "./routes/login.js";

const app = express();
app.use(express.json());
app.use(loginRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
