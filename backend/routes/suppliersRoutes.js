const express = require('express');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { getAllSuppliers, getSupplierById, createSupplier, updateSupplier, deleteSupplier } = require('../controllers/suppliersController');

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getAllSuppliers)
    .post(restrictTo('Admin', 'Inventory Manager'), createSupplier);

router.route('/:id')
    .get(getSupplierById)
    .put(restrictTo('Admin', 'Inventory Manager'), updateSupplier)
    .delete(restrictTo('Admin'), deleteSupplier);

module.exports = router;
