const Razorpay = require("razorpay");

const key_id = process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_TEST_KEY_ID;
const key_secret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_TEST_KEY_SECRET;

exports.razorpayKeyId = key_id;
exports.razorpayKeySecret = key_secret;

exports.razorpay = new Razorpay({
  key_id,
  key_secret
})