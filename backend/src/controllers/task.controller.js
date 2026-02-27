import httpStatus from 'http-status';
import mongoose from 'mongoose';
import pick from '../utils/pick.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Task } from '../models/task.model.js';
import { TaskGroup } from '../models/taskGroup.model.js';
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
    groupId,
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
    groupId: toObjectId(groupId),
    taskCategoryId: toObjectId(taskCategoryId),
    createdBy: req.user.id,
    customerId: toObjectId(customerId),
  };

  // Check if group has fixed users
  let groupFixedUsers = [];

  // Check main groupId AND assignedGroupId for users
  const targetGroupIdStr = assignedGroupId || groupId;

  if (targetGroupIdStr) {
    const group = await TaskGroup.findById(targetGroupIdStr);
    if (group && group.userIds && group.userIds.length > 0) {
      groupFixedUsers = group.userIds;
    }
  }

  // Handle assignment logic
  if (groupFixedUsers.length > 0) {
    taskData.assigneeIds = groupFixedUsers;
    taskData.assignmentMode = groupFixedUsers.length === 1 ? 'SINGLE' : 'MULTI';
    taskData.assignToAll = false;
  } else if (taskData.assignmentMode === 'SELF') {
    taskData.assigneeIds = [req.user.id];
    taskData.assignToAll = false;
  } else if (taskData.assignmentMode === 'ALL') {
    taskData.assignToAll = true;
    taskData.assigneeIds = [];
  } else if (taskData.assignmentMode === 'SINGLE' || taskData.assignmentMode === 'MULTI') {
    taskData.assigneeIds = Array.isArray(assigneeIds) ? assigneeIds : [];
    taskData.assignToAll = false;
    // Strict Option 2: Must have at least one assignee if USERS/MULTI mode
    if (taskData.assigneeIds.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'At least one assignee is required for this mode');
    }
  } else if (taskData.assignmentMode === 'GROUP') {
    taskData.assignToAll = false;
    if (!taskData.assignedGroupId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Group is required for Group assignment mode');
    }
  }

  // Backup safeguard
  if (!taskData.assignToAll && !taskData.assignedGroupId && (!taskData.assigneeIds || taskData.assigneeIds.length === 0)) {
    taskData.assignToAll = true; // Safe fallback so task doesn't become orphaned, though validations above should catch it
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
  const query = pick(req.query, ['status', 'priority', 'taskCategoryId', 'search', 'customerId', 'groupId', 'assigneeType']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const view = req.query.view || (query.assigneeType || 'assigned_to_me');

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
  if (query.groupId) andConditions.push({ groupId: toObjectId(query.groupId) });

  if (query.search) {
    andConditions.push({
      $or: [
        { title: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } }
      ]
    });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // View specific filters (Today, Upcoming, Overdue, Closed)
  if (view === 'today') {
    andConditions.push({ status: { $ne: 'COMPLETED' }, dueDate: { $gte: todayStart, $lte: todayEnd } });
  } else if (view === 'upcoming') {
    andConditions.push({ status: { $ne: 'COMPLETED' }, dueDate: { $gt: todayEnd } });
  } else if (view === 'overdue') {
    andConditions.push({ status: { $ne: 'COMPLETED' }, dueDate: { $lt: todayStart } });
  } else if (view === 'closed') {
    andConditions.push({ status: 'COMPLETED' });
  }

  // Strict User-wise Visibility Rule (Option 2)
  // A task must be visible ONLY to: Assigned users, All Users, Creators, or Admin
  if (req.user.role === 'admin') {
    // Admin sees everything if they select 'all', or specifically filters
    if (query.assigneeType === 'created_by_me') {
      andConditions.push({ createdBy: req.user.id });
    } else if (query.assigneeType === 'assigned_to_me') {
      andConditions.push({
        $or: [
          { assigneeIds: req.user.id },
          { assignToAll: true }
        ]
      });
    }
  } else {
    // strict Option 2 rule for non-admin
    // Users can see tasks assigned to them, created by them, or assigned to everyone.
    andConditions.push({
      $or: [
        { assigneeIds: req.user.id }, // Assigned to me
        { createdBy: req.user.id },   // Created by me
        { assignToAll: true }         // Assigned to everyone
      ]
    });
  }

  const filter = andConditions.length ? { $and: andConditions } : {};

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate('assigneeIds', 'name email username')
      .populate('createdBy', 'name email username')
      .populate('taskCategoryId', 'name')
      .populate('assignedGroupId', 'name')
      .populate('groupId', 'name')
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
    .populate('assignedGroupId', 'name')
    .populate('groupId', 'name');

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

  let targetGroupId = up.groupId || task.groupId;
  let targetAssignedGroupId = up.assignedGroupId || task.assignedGroupId;

  const targetGroupIdStr = targetAssignedGroupId || targetGroupId;

  let groupFixedUsers = [];
  if (targetGroupIdStr) {
    const group = await TaskGroup.findById(targetGroupIdStr);
    if (group && group.userIds && group.userIds.length > 0) {
      groupFixedUsers = group.userIds;
    }
  }

  // Handle assignment logic updates safely
  if (groupFixedUsers.length > 0) {
    up.assigneeIds = groupFixedUsers;
    up.assignmentMode = groupFixedUsers.length === 1 ? 'SINGLE' : 'MULTI';
    up.assignToAll = false;
  } else if (up.assignmentMode) {
    if (up.assignmentMode === 'SELF') {
      up.assigneeIds = [req.user.id];
      up.assignToAll = false;
    } else if (up.assignmentMode === 'ALL') {
      up.assignToAll = true;
      up.assigneeIds = [];
    } else if (up.assignmentMode === 'SINGLE' || up.assignmentMode === 'MULTI') {
      up.assigneeIds = Array.isArray(up.assigneeIds) ? up.assigneeIds : [];
      up.assignToAll = false;
      if (up.assigneeIds.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'At least one assignee is required for this mode');
      }
    } else if (up.assignmentMode === 'GROUP') {
      up.assignToAll = false;
      if (!up.assignedGroupId && !task.assignedGroupId) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Group is required for Group assignment mode');
      }
    }
  }

  Object.assign(task, up);

  // Backup safeguard after applying updates
  if (!task.assignToAll && !task.assignedGroupId && (!task.assigneeIds || task.assigneeIds.length === 0)) {
    task.assignToAll = true;
  }

  task.updatedBy = req.user.id;
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
  task.closedAt = new Date();
  task.closedBy = req.user.id;

  // Handle Recurrence auto-create
  if (task.recurrence && task.recurrence.enabled && !task.nextGeneratedId) {
    const nextDate = calculateNextDueDate(task);

    if (nextDate) {
      const nextTaskData = {
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: 'OPEN',
        dueDate: nextDate,
        assignmentMode: task.assignmentMode,
        assignedGroupId: task.assignedGroupId,
        groupId: task.groupId,
        taskCategoryId: task.taskCategoryId,
        assigneeIds: task.assigneeIds,
        assignToAll: task.assignToAll,
        createdBy: task.createdBy,
        previousTaskId: task._id,
        recurrence: {
          ...task.recurrence.toObject(),
          occurrenceCount: (task.recurrence.occurrenceCount || 1) + 1
        },
        customerId: task.customerId
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

