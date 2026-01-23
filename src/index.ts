import express from "express";
import visitorsRouter from "./routes/visitors/visitorsRouter";

const app = express();

app.use(express.json());
app.use("/api/visitors", visitorsRouter);

const port = 3000;
app.listen(port, () => {
  console.log(`HOPE API listening on port ${port}`);
});

