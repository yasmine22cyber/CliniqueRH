require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("Testing with API Key:", apiKey);
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent("Hello!");
    console.log("Success! Response:", result.response.text());
  } catch (error) {
    console.error("Error from Gemini API:");
    console.error(error.message || error);
    if (error.status) console.error("Status:", error.status);
  }
}

testGemini();
