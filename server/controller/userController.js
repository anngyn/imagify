import userModel from "../models/userModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import transactionModel from "../models/transactionModel.js";
import { createVNPayUrl, verifyVNPayCallback } from "../utils/vnpay.js";
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.json({ success: false, message: "Missing Details" });
    } // Thêm kiểm tra email đã tồn tại

    const exists = await userModel.findOne({ email });
    if (exists) {
      return res.json({ success: false, message: "Email đã được sử dụng" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userData = {
      name,
      email,
      password: hashedPassword,
    };
    const newUser = new userModel(userData);
    const user = await newUser.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
    return res.json({ success: true, token, user: { name: user.name } });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User does not exist" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (isMatch) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

      return res.json({ success: true, token, user: { name: user.name } });
    } else {
      return res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const userCredits = async (req, res) => {
  try {
    // Lấy userId từ JWT đã được xác thực, không phải từ headers
    const userId = req.userId;
    console.log(userId);
    const user = await userModel.findById(userId);
    res.json({
      success: true,
      credits: user.creditBalance,
      user: { name: user.name, _id: user._id },
    });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

const paymentVNPay = async (req, res) => {
  try {
    console.log("Payment request body:", req.body);
    console.log("User ID from auth:", req.userId);

    const { planId } = req.body;
    const userId = req.userId; // Lấy từ middleware auth

    if (!planId) {
      return res.json({ success: false, message: "Missing plan ID" });
    }

    if (!userId) {
      return res.json({ success: false, message: "User not authenticated" });
    }

    let credits, plan, amount;

    switch (planId) {
      case "Basic":
        plan = "Basic";
        credits = 100;
        amount = 10000; // 10,000 VND để test
        break;
      case "Advanced":
        plan = "Advanced";
        credits = 500;
        amount = 50000; // 50,000 VND để test
        break;
      case "Business":
        plan = "Business";
        credits = 5000;
        amount = 100000; // 100,000 VND để test
        break;
      default:
        return res.json({ success: false, message: "Plan not found" });
    }

    const date = Date.now();
    const transactionData = {
      userId,
      plan,
      amount,
      credits,
      date,
      status: "pending",
    };

    const newTransaction = await transactionModel.create(transactionData);

    const orderInfo = `Thanh toan goi ${plan} - ${credits} credits`;
    const ipAddr =
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
      "127.0.0.1";

    const vnpayUrl = createVNPayUrl(
      newTransaction._id.toString(),
      amount,
      orderInfo,
      ipAddr
    );

    res.json({
      success: true,
      paymentUrl: vnpayUrl,
      transactionId: newTransaction._id,
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const verifyVNPayPayment = async (req, res) => {
  try {
    const vnp_Params = req.query;
    const isValidSignature = verifyVNPayCallback(vnp_Params);

    if (!isValidSignature) {
      return res.json({ success: false, message: "Invalid signature" });
    }

    const transactionId = vnp_Params.vnp_TxnRef;
    const responseCode = vnp_Params.vnp_ResponseCode;

    const transaction = await transactionModel.findById(transactionId);
    if (!transaction) {
      return res.json({ success: false, message: "Transaction not found" });
    }

    if (responseCode === "00") {
      // Thanh toán thành công
      transaction.status = "completed";
      await transaction.save();

      // Cập nhật credits cho user
      const user = await userModel.findById(transaction.userId);
      user.creditBalance += transaction.credits;
      await user.save();

      res.json({
        success: true,
        message: "Payment successful",
        credits: transaction.credits,
      });
    } else {
      // Thanh toán thất bại
      transaction.status = "failed";
      await transaction.save();

      res.json({
        success: false,
        message: "Payment failed",
        responseCode,
      });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};
export {
  registerUser,
  loginUser,
  userCredits,
  paymentVNPay,
  verifyVNPayPayment,
};
