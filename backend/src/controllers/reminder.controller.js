import httpStatus from 'http-status';
import pick from '../utils/pick.js';
import { ApiError } from '../utils/ApiError.js';
import reminderService from '../services/reminder.service.js';

const catchAsync = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(err));
};

const createReminder = catchAsync(async (req, res) => {
    const reminder = await reminderService.createReminder({ ...req.body, createdBy: req.user.id });
    res.status(httpStatus.CREATED).send(reminder);
});

const getReminders = catchAsync(async (req, res) => {
    const filters = pick(req.query, ['status', 'priority', 'followUpType', 'dateFrom', 'dateTo', 'customerId', 'search', 'isClosed']);
    const options = pick(req.query, ['sortBy', 'sortOrder', 'limit', 'page']);
    const result = await reminderService.queryReminders(filters, options);
    res.send(result);
});

const getReminder = catchAsync(async (req, res) => {
    const reminder = await reminderService.getReminderById(req.params.id);
    if (!reminder) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Reminder not found');
    }
    res.send(reminder);
});

const closeReminder = catchAsync(async (req, res) => {
    const reminder = await reminderService.closeReminder(req.params.id);
    res.send(reminder);
});

const extendReminder = catchAsync(async (req, res) => {
    const reminder = await reminderService.extendReminder(req.params.id, req.body);
    res.send(reminder);
});

const upsertReminder = catchAsync(async (req, res) => {
    const reminder = await reminderService.upsertReminderForCustomer(req.params.customerId, { ...req.body, createdBy: req.user.id });
    res.send({ reminder, message: reminder ? 'Reminder updated' : 'Reminder closed/disabled' });
});

const getReminderCounts = catchAsync(async (req, res) => {
    const counts = await reminderService.getReminderCounts();
    res.send(counts);
});

export default {
    createReminder,
    getReminders,
    getReminder,
    closeReminder,
    extendReminder,
    upsertReminder,
    getReminderCounts,
};
