import express from "express";
import {
  registerUser,
  loginUser,
  paymentVNPay,
  verifyVNPayPayment,
  userCredits,
} from "../controller/userController.js";
import userAuth from "../middlewares/auth.js";

const userRouter = express.Router();

userRouter.post("/register", registerUser);
userRouter.post("/login", loginUser);
userRouter.get("/credits", userAuth, userCredits);
userRouter.post("/pay-vnpay", userAuth, paymentVNPay);
userRouter.get("/vnpay-return", verifyVNPayPayment);

export default userRouter;
