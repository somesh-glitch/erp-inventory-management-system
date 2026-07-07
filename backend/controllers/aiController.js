const { buildInventoryContext } = require("../services/contextService");

const {
    askAI,
    generateInventorySummary
} = require("../services/aiService");

const chatWithAI = async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                message: "Message is required."
            });
        }

        const inventoryContext = await buildInventoryContext();

        const reply = await askAI(message, inventoryContext);

        res.json({
            success: true,
            reply
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Failed to communicate with AI."
        });
    }
};

const getDashboardSummary = async (req, res) => {

    try {

        const inventoryContext = await buildInventoryContext();

        const summary = await generateInventorySummary(inventoryContext);

        res.json({
            success: true,
            summary
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            message: "Unable to generate dashboard summary."
        });

    }

};

module.exports = {
    chatWithAI,
    getDashboardSummary
};