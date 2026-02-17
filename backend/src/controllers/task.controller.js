import httpStatus from 'http-status';
import mongoose from 'mongoose';
import pick from '../utils/pick.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Task } from '../models/task.model.js';
import { GroupMember } from '../models/groupMember.model.js';
import { calculateNextDueDate } from '../utils/recurrence.js';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------
// HELPERS
// ---------------------------
const toObjectId = (id) => {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
};

const buildSort = (sortBy) => {
  if (!sortBy) return { dueDate: 1, createdAt: -1 };
  const parts = sortBy.split(',');
  const sort = {};
  parts.forEach((p) => {
    const [key, dir] = p.split(':');
    if (key) sort[key] = dir === 'asc' ? 1 : -1;
  });
  return Object.keys(sort).length ? sort : { dueDate: 1, createdAt: -1 };
};

// ---------------------------
// CREATE TASK
// ---------------------------
const createTask = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    priority,
    status,
    dueDate,
    assignmentMode,
    assignedGroupId,
    taskCategoryId,
    assignToAll,
    assigneeIds,
    recurrence,
    customerId
  } = req.body;

  if (!title || String(title).trim().length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Title is required');
  }

  const taskData = {
    title: String(title).trim(),
    description: description || '',
    priority: priority || 'MEDIUM',
    status: status || 'OPEN',
    dueDate: dueDate || null,
    assignmentMode: assignmentMode || 'SELF',
    assignedGroupId: toObjectId(assignedGroupId),
    taskCategoryId: toObjectId(taskCategoryId),
    createdBy: req.user.id,
    customerId: toObjectId(customerId),
  };

  // Handle assignment logic
  if (taskData.assignmentMode === 'SELF') {
    taskData.assigneeIds = [req.user.id];
    taskData.assignToAll = false;
  } else if (taskData.assignmentMode === 'ALL') {
    taskData.assignToAll = true;
    taskData.assigneeIds = [];
  } else if (taskData.assignmentMode === 'SINGLE' || taskData.assignmentMode === 'MULTI') {
    taskData.assigneeIds = Array.isArray(assigneeIds) ? assigneeIds : [];
    taskData.assignToAll = false;
    if (taskData.assigneeIds.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'At least one assignee is required for this mode');
    }
  } else if (taskData.assignmentMode === 'GROUP') {
    taskData.assignToAll = false;
    if (!taskData.assignedGroupId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Group is required for Group assignment mode');
    }
    // We don't necessarily need to populate assigneeIds here, usually visibility is handled by assignedGroupId
  }

  // Handle recurrence initialization
  if (recurrence && recurrence.enabled) {
    taskData.recurrence = {
      ...recurrence,
      recurrenceId: recurrence.recurrenceId || uuidv4()
    };
  }

  const task = await Task.create(taskData);
  res.status(httpStatus.CREATED).send({ success: true, data: task });
});

// ---------------------------
// GET TASKS (LIST)
// ---------------------------
const getTasks = asyncHandler(async (req, res) => {
  const query = pick(req.query, ['status', 'priority', 'taskCategoryId', 'search', 'customerId']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const view = req.query.view || 'assigned_to_me';

  const limit = Math.min(parseInt(options.limit || '50', 10), 200);
  const page = Math.max(parseInt(options.page || '1', 10), 1);
  const skip = (page - 1) * limit;
  const sort = buildSort(options.sortBy);

  const andConditions = [];

  // Base filters
  if (query.status) andConditions.push({ status: query.status });
  if (query.priority) andConditions.push({ priority: query.priority });
  if (query.taskCategoryId) andConditions.push({ taskCategoryId: toObjectId(query.taskCategoryId) });
  if (query.customerId) andConditions.push({ customerId: toObjectId(query.customerId) });

  if (query.search) {
    andConditions.push({
      $or: [
        { title: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } }
      ]
    });
  }

  // Visibility logic
  if (req.user.role !== 'admin') {
    // Get groups user belongs to
    const userGroups = await GroupMember.find({ user: req.user.id }).select('group');
    const groupIds = userGroups.map((g) => g.group);

    const visibilityOr = [
      { createdBy: req.user.id },
      { assigneeIds: req.user.id },
      { assignToAll: true },
      { assignedGroupId: { $in: groupIds } }
    ];
    andConditions.push({ $or: visibilityOr });
  }

  // View specific filters
  if (view === 'assigned_to_me') {
    andConditions.push({
      $or: [{ assignToAll: true }, { assigneeIds: req.user.id }]
    });
  } else if (view === 'created_by_me') {
    andConditions.push({ createdBy: req.user.id });
  }

  const filter = andConditions.length ? { $and: andConditions } : {};

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate('assigneeIds', 'name email username')
      .populate('createdBy', 'name email username')
      .populate('taskCategoryId', 'name')
      .populate('assignedGroupId', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Task.countDocuments(filter),
  ]);

  res.send({
    success: true,
    data: tasks,
    meta: { page, limit, total, pages: Math.ceil(total / limit), view }
  });
});

// ---------------------------
// GET SINGLE TASK
// ---------------------------
const getTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.taskId)
    .populate('assigneeIds', 'name email username')
    .populate('createdBy', 'name email username')
    .populate('taskCategoryId', 'name')
    .populate('assignedGroupId', 'name');

  if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  res.send({ success: true, data: task });
});

// ---------------------------
// UPDATE TASK
// ---------------------------
const updateTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.taskId);
  if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');

  const up = req.body;
  if (up.title && String(up.title).trim().length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Title cannot be empty');
  }

  Object.assign(task, up);
  await task.save();
  res.send({ success: true, data: task });
});

// ---------------------------
// EXTEND TASK
// ---------------------------
const extendTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.taskId);
  if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');

  const { newDueDate, reason } = req.body;

  task.extensionHistory.push({
    oldDate: task.dueDate,
    newDate: new Date(newDueDate),
    reason,
    extendedBy: req.user.id,
    extendedAt: new Date()
  });

  task.dueDate = new Date(newDueDate);
  await task.save();

  res.send({ success: true, data: task });
});

// ---------------------------
// CLOSE TASK (WITH RECURRENCE)
// ---------------------------
const closeTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.taskId);
  if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');

  if (task.status === 'COMPLETED') {
    return res.send({ success: true, data: task, message: 'Task already completed' });
  }

  task.status = 'COMPLETED';
  task.completedAt = new Date();

  // Handle Recurrence auto-create
  if (task.recurrence && task.recurrence.enabled && !task.nextGeneratedId) {
    // Map current model to recycler utility expectations if needed
    // Our utility expects { isRecurring: bool, recurrence: { type, interval, endDate }, dueDate: Date }
    const nextDate = calculateNextDueDate({
      isRecurring: task.recurrence.enabled,
      recurrence: {
        type: task.recurrence.frequency,
        interval: task.recurrence.interval
      },
      dueDate: task.dueDate
    });

    if (nextDate) {
      const nextTaskData = {
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: 'OPEN',
        dueDate: nextDate,
        assignmentMode: task.assignmentMode,
        assignedGroupId: task.assignedGroupId,
        taskCategoryId: task.taskCategoryId,
        assigneeIds: task.assigneeIds,
        assignToAll: task.assignToAll,
        createdBy: task.createdBy,
        parentTaskId: task._id,
        recurrence: {
          ...task.recurrence.toObject(),
          recurrenceId: task.recurrence.recurrenceId
        }
      };

      const nextTask = await Task.create(nextTaskData);
      task.nextGeneratedId = nextTask._id;
    }
  }

  await task.save();
  res.send({ success: true, data: task });
});

const updateTaskStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (status === 'COMPLETED') {
    return closeTask(req, res);
  }
  const task = await Task.findById(req.params.taskId);
  if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  task.status = status;
  await task.save();
  res.send({ success: true, data: task });
});

const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.taskId);
  if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  await Task.deleteOne({ _id: task._id });
  res.send({ success: true, message: 'Task deleted' });
});

export {
  createTask,
  getTasks,
  getTask,
  updateTask,
  updateTaskStatus,
  extendTask,
  closeTask,
  deleteTask,
};

