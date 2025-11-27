import express from "express";
import cors from "cors";
import "dotenv/config";
import connectDB from "./config/mongodb.js";
import userRouter from "./routes/userRoute.js";
import imageRouter from "./routes/imageRoutes.js";

const PORT = process.env.PORT || 4000;
const app = express();

app.use(express.json());
app.use(cors());
await connectDB();

app.use("/api/user", userRouter);
app.use("/api/image", imageRouter);
app.post("/api/create-qr", (req, res) => {
  console.log("Environment variables check:");
  console.log("VNPAY_TMN_CODE:", process.env.VNPAY_TMN_CODE);
  console.log(
    "VNPAY_HASH_SECRET:",
    process.env.VNPAY_HASH_SECRET ? "SET" : "UNDEFINED"
  );
  console.log("VNPAY_URL:", process.env.VNPAY_URL);
  res.send("API Working");
});
app.listen(PORT, () => console.log("Server running on port" + PORT));
