const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No GEMINI_API_KEY found in .env");
    process.exit(1);
  }
  
  console.log('====================================================');
  console.log('          GEMINI API DIAGNOSTICS TEST               ');
  console.log('====================================================');
  console.log('API Key Starts With:', apiKey.substring(0, 10) + '...');
  
  const genAI = new GoogleGenerativeAI(apiKey);
  const models = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
  
  for (const modelName of models) {
    try {
      console.log(`\nTesting model: "${modelName}"...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: "Say 'Hello World' in Indonesian gaul" }] }]
      });
      console.log(`✓ SUCCESS! Response: "${result.response.text().trim()}"`);
      console.log(`Recommended action: Use "${modelName}" as your model.`);
      process.exit(0);
    } catch (error) {
      console.error(`✗ FAILED for model "${modelName}":`, error.message);
    }
  }
  
  console.log('\n====================================================');
  console.log('All models failed. This indicates that either:');
  console.log('1. The GEMINI_API_KEY in your .env file is invalid or expired.');
  console.log('   (Note: Standard Google AI Studio keys start with "AIzaSy...")');
  console.log('2. There is a network/proxy issue blocking API calls.');
  console.log('====================================================');
  process.exit(1);
}

testModels();
