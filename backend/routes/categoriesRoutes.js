const express = require('express');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { getAllCategories, createCategory, updateCategory, deleteCategory } = require('../controllers/categoriesController');

const router = express.Router();

router.use(protect);

router.route('/')
    .get(getAllCategories)
    .post(restrictTo('Admin', 'Inventory Manager'), createCategory);

router.route('/:id')
    .put(restrictTo('Admin', 'Inventory Manager'), updateCategory)
    .delete(restrictTo('Admin'), deleteCategory);

module.exports = router;
