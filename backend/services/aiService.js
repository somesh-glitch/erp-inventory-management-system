const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

async function askAI(userMessage, inventoryContext) {

    const prompt = `
You are ERP Inventory Copilot.

You are helping an inventory manager.

Always answer ONLY using the inventory information provided below.

If the answer cannot be determined from the inventory, politely say that the information is unavailable.

${inventoryContext}

--------------------------------------

User Question:

${userMessage}
`;

    try {

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        return response.text;

    } catch (err) {

        console.error("Gemini Error:", err);
        throw err;

    }

}

async function generateInventorySummary(inventoryContext) {

    const prompt = `
You are an ERP Inventory Analyst.

Below is the current inventory.

${inventoryContext}

Generate a professional dashboard summary.

Return ONLY in this format:

Inventory Health Score: (0-100)

Current Status
- ...
- ...
- ...

Recommendations
- ...
- ...
- ...

Keep it under 200 words.
`;

    try {

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        return response.text;

    } catch(err){

        console.error(err);

        throw err;

    }

}

module.exports = {
    askAI,
    generateInventorySummary
};