import crypto from "crypto";
import qs from "qs";

// Hàm sắp xếp object theo key (theo mẫu VNPAY)
function sortObject(obj) {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      str.push(key);
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = obj[str[key]];
  }
  return sorted;
}

// Tạo URL thanh toán VNPAY (theo mẫu chính thức)
export function createVNPayUrl(orderId, amount, orderInfo, ipAddr) {
  const tmnCode = process.env.VNPAY_TMN_CODE;
  const secretKey = process.env.VNPAY_HASH_SECRET;
  const vnpUrl = process.env.VNPAY_URL;
  const returnUrl = process.env.VNPAY_RETURN_URL;

  console.log("VNPAY Config:", {
    tmnCode,
    secretKey: secretKey ? "SET" : "UNDEFINED",
    vnpUrl,
    returnUrl,
  });

  const date = new Date();
  const createDate =
    date.getFullYear() +
    ("0" + (date.getMonth() + 1)).slice(-2) +
    ("0" + date.getDate()).slice(-2) +
    ("0" + date.getHours()).slice(-2) +
    ("0" + date.getMinutes()).slice(-2) +
    ("0" + date.getSeconds()).slice(-2);

  let vnp_Params = {};
  vnp_Params["vnp_Version"] = "2.1.0";
  vnp_Params["vnp_Command"] = "pay";
  vnp_Params["vnp_TmnCode"] = tmnCode;
  vnp_Params["vnp_Locale"] = "vn";
  vnp_Params["vnp_CurrCode"] = "VND";
  vnp_Params["vnp_TxnRef"] = orderId;
  vnp_Params["vnp_OrderInfo"] = orderInfo;
  vnp_Params["vnp_OrderType"] = "other";
  vnp_Params["vnp_Amount"] = amount * 100; // VNPAY yêu cầu amount * 100
  vnp_Params["vnp_ReturnUrl"] = returnUrl;
  vnp_Params["vnp_IpAddr"] = ipAddr;
  vnp_Params["vnp_CreateDate"] = createDate;

  console.log("VNPay Params before sorting:", vnp_Params);

  vnp_Params = sortObject(vnp_Params);

  // Tạo chuỗi query string để ký
  let signData = qs.stringify(vnp_Params, { encode: false });
  console.log("Sign data:", signData);

  let hmac = crypto.createHmac("sha512", secretKey);
  let signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
  console.log("Generated signature:", signed);

  vnp_Params["vnp_SecureHash"] = signed;

  // Tạo URL cuối cùng
  let finalUrl = vnpUrl + "?" + qs.stringify(vnp_Params, { encode: false });
  console.log("Final URL:", finalUrl);

  return finalUrl;
}

// Xác thực callback từ VNPAY
export function verifyVNPayCallback(vnp_Params) {
  const secureHash = vnp_Params["vnp_SecureHash"];
  const secretKey = process.env.VNPAY_HASH_SECRET;

  delete vnp_Params["vnp_SecureHash"];
  delete vnp_Params["vnp_SecureHashType"];

  vnp_Params = sortObject(vnp_Params);

  let signData = qs.stringify(vnp_Params, { encode: false });
  let hmac = crypto.createHmac("sha512", secretKey);
  let signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  return secureHash === signed;
}
