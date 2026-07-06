const express = require('express');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const {
    getAllProducts, getProductById, createProduct,
    updateProduct, adjustStock, deleteProduct, getReorderAlerts
} = require('../controllers/productsController');

const router = express.Router();

router.use(protect);

router.get('/reorder-alerts', getReorderAlerts);

router.route('/')
    .get(getAllProducts)
    .post(restrictTo('Admin', 'Inventory Manager'), createProduct);

router.route('/:id')
    .get(getProductById)
    .put(restrictTo('Admin', 'Inventory Manager'), updateProduct)
    .delete(restrictTo('Admin'), deleteProduct);

router.post('/:id/adjust-stock', restrictTo('Admin', 'Inventory Manager'), adjustStock);

module.exports = router;
