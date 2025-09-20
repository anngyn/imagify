import axios from "axios";
import userModel from "../models/userModel.js";
import FormData from "form-data";

export const generateImage = async (req, res) => {
  try {
    const { userId, prompt } = req.body;

    const user = await userModel.findById(userId);

    // Kiểm tra các trường bắt buộc
    if (!user || !prompt) {
      return res.json({ success: false, message: "Missing Details" });
    }

    // Bước quan trọng: Kiểm tra credit trước khi gọi API
    if (user.creditBalance <= 0) {
      return res.json({
        success: false,
        message: "No Credit Balance",
        creditBalance: 0,
      });
    }

    // Gọi API để tạo ảnh
    const formData = new FormData();
    formData.append("prompt", prompt);

    const { data } = await axios.post(
      "https://clipdrop-api.co/text-to-image/v1",
      formData,
      {
        headers: {
          "x-api-key": process.env.CLIPDROP_API,
        },
        responseType: "arraybuffer",
      }
    );

    // Chuyển đổi dữ liệu ảnh nhận được
    const base64Image = Buffer.from(data, "binary").toString("base64");
    const resultImage = `data:image/png;base64,${base64Image}`;

    // Chỉ trừ credit khi việc tạo ảnh thành công
    await userModel.findByIdAndUpdate(user._id, {
      creditBalance: user.creditBalance - 1,
    });

    // Trả về phản hồi thành công
    res.json({
      success: true,
      message: "Image Generated",
      creditBalance: user.creditBalance - 1,
      resultImage,
    });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};
