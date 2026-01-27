import express from "express";
import { engagementsRouter } from "./routes/engagements";
import { opsRouter } from "./routes/ops";
import visitorsRouter from "./routes/visitors/visitorsRouter";


const app = express();

app.use(express.json());

// Health endpoints (both forms so smoke can use BaseUrl=/api safely)
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
app.get("/api/health", (_req, res) => res.status(200).json({ ok: true }));
app.use("/api/visitors", visitorsRouter);

app.use("/api", engagementsRouter);
app.use("/api/ops", opsRouter);
const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  console.log(`HOPE API listening on port ${port}`);
});

