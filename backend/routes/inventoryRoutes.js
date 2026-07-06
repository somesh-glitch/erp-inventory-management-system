const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const {
    getCurrentOrder,
    saveCurrentOrder,
    clearCurrentOrder,
    completeOrder,
    getCompletedOrders
} = require('../controllers/inventoryController');

const router = express.Router();

// All inventory operations require authentication
router.use(protect);

router.route('/current-order')
    .get(getCurrentOrder)
    .post(saveCurrentOrder)
    .delete(clearCurrentOrder);

router.post('/orders', completeOrder);
router.get('/orders', getCompletedOrders);

module.exports = router;
