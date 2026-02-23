import httpStatus from 'http-status';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { TaskCategory } from '../models/taskCategory.model.js';
import pick from '../utils/pick.js';

const createCategory = asyncHandler(async (req, res) => {
    const categoryData = {
        ...req.body,
        createdBy: req.user.id
    };
    const category = await TaskCategory.create(categoryData);
    res.status(httpStatus.CREATED).send({ success: true, data: category });
});

const getCategories = asyncHandler(async (req, res) => {
    const filter = pick(req.query, ['parentCategory', 'isActive']);
    const categories = await TaskCategory.find(filter).populate('parentCategory', 'name');
    res.send({ success: true, data: categories });
});

const getCategory = asyncHandler(async (req, res) => {
    const category = await TaskCategory.findById(req.params.categoryId).populate('parentCategory', 'name');
    if (!category) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
    }
    res.send({ success: true, data: category });
});

const updateCategory = asyncHandler(async (req, res) => {
    const category = await TaskCategory.findById(req.params.categoryId);
    if (!category) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
    }
    Object.assign(category, req.body);
    await category.save();
    res.send({ success: true, data: category });
});

const deleteCategory = asyncHandler(async (req, res) => {
    const category = await TaskCategory.findById(req.params.categoryId);
    if (!category) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
    }
    await category.remove();
    res.send({ success: true, message: 'Category deleted' });
});

export {
    createCategory,
    getCategories,
    getCategory,
    updateCategory,
    deleteCategory
};
