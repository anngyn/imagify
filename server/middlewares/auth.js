import jwt from "jsonwebtoken";

const userAuth = async (req, res, next) => {
  try {
    const { token } = req.headers;

    if (!token) {
      return res.json({
        success: false,
        message: "Not Authorized. Login Again",
      });
    }

    const tokenDecode = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = tokenDecode.id; // Gán userId vào đối tượng req
    next();
  } catch (error) {
    console.log("Auth error:", error);
    res.json({ success: false, message: error.message });
  }
};

export default userAuth;
