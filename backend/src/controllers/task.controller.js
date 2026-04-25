import httpStatus from 'http-status';
import mongoose from 'mongoose';
import pick from '../utils/pick.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { Task } from '../models/task.model.js';
import { TaskMaster } from '../models/taskMaster.model.js';
import { TaskCategory } from '../models/taskCategory.model.js';
import { TaskGroup } from '../models/taskGroup.model.js';
import { GroupMember } from '../models/groupMember.model.js';
import { calculateNextDueDate } from '../utils/recurrence.js';
import { v4 as uuidv4 } from 'uuid';
import { createNotification } from './notification.controller.js';
import { User } from '../models/user.model.js';
import { getIO } from '../config/socket.js';
import { generateTaskFromMaster } from '../services/taskGenerator.service.js';
import { emitTaskUpdate } from '../services/socketEvent.service.js';

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
// TASK MASTER CONTROLLERS
// ---------------------------

export const createTaskMaster = asyncHandler(async (req, res) => {
    const master = await TaskMaster.create({
        ...req.body,
        createdBy: req.user.id,
        isActive: true
    });
    
    // [VISIBILITY LOCKDOWN] Immediately generate the FIRST instance
    const now = new Date();
    // Ensure we have a valid starting date for the Task
    const initialDueDate = master.recurrence.startDate || now;

    const taskInstance = await Task.create({
        title: master.title,
        description: master.description,
        taskCategoryId: master.category,
        priority: master.priority,
        assigneeIds: master.assignmentMode === 'SELF' ? [req.user.id] : (master.assigneeIds || []),
        assignmentMode: master.assignmentMode || 'SELF',
        groupId: master.group, 
        dueDate: initialDueDate,
        status: 'OPEN',
        taskMasterId: master._id,
        amount: master.defaultAmount || 0,
        billNumber: master.defaultBillNumber || '',
        referenceNumber: master.defaultReferenceNumber || '',
        remarks: master.defaultRemarks || '',
        createdBy: req.user.id
    });

    // [REAL-TIME] Broadcast the first instance immediately
    await emitTaskUpdate(taskInstance._id, 'create', req.user.id).catch(err => 
        console.error('Failed to emit socket for first recurring instance:', err)
    );

    // Calculate the NEXT run date for the Template itself
    const nextDate = calculateNextDueDate({
        dueDate: initialDueDate,
        recurrence: {
            ...master.recurrence,
            enabled: true,
            occurrenceCount: 1 // We just created the first one
        }
    });

    master.lastGeneratedAt = now;
    master.nextRunDate = nextDate;
    await master.save();

    res.status(httpStatus.CREATED).send({ 
        success: true, 
        data: master, 
        message: 'Recurring Template and first visible Task created successfully.' 
    });
});

export const getTaskMasters = asyncHandler(async (req, res) => {
    const filters = pick(req.query, ['category', 'assignedTo', 'group', 'isActive']);
    const masters = await TaskMaster.find(filters)
        .populate('category', 'name color')
        .populate('assignedTo', 'name email username')
        .populate('group', 'name')
        .sort('-createdAt');
    res.send({ success: true, data: masters });
});

export const getTaskMaster = asyncHandler(async (req, res) => {
    const master = await TaskMaster.findById(req.params.id)
        .populate('category', 'name color')
        .populate('assignedTo', 'name email username')
        .populate('group', 'name');
    if (!master) throw new ApiError(httpStatus.NOT_FOUND, 'Task Master not found');
    res.send({ success: true, data: master });
});

export const updateTaskMaster = asyncHandler(async (req, res) => {
    const master = await TaskMaster.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!master) throw new ApiError(httpStatus.NOT_FOUND, 'Task Master not found');
    res.send({ success: true, data: master });
});

export const deleteTaskMaster = asyncHandler(async (req, res) => {
    const master = await TaskMaster.findById(req.params.id);
    if (!master) throw new ApiError(httpStatus.NOT_FOUND, 'Task Master not found');
    await master.deleteOne();
    res.send({ success: true, message: 'Task Master deleted' });
});

// ---------------------------
// TASK INSTANCE CONTROLLERS
// ---------------------------

export const createTask = asyncHandler(async (req, res) => {
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
    customerId,
    taskMasterId,
    amount,
    billNumber,
    referenceNumber,
    remarks
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
    taskMasterId: toObjectId(taskMasterId),
    amount: amount || 0,
    billNumber: billNumber || '',
    referenceNumber: referenceNumber || '',
    remarks: remarks || '',
  };

  // Check if group has fixed users
  let groupFixedUsers = [];
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
    taskData.assignToAll = true;
  }

  // Handle recurrence initialization (Legacy support)
  if (recurrence && recurrence.enabled) {
    taskData.recurrence = {
      ...recurrence,
      recurrenceId: recurrence.recurrenceId || uuidv4()
    };
  }

  // Use _skipSync to prevent the basic plugin from emitting an unpopulated event
  const task = new Task(taskData);
  task._skipSync = true;
  await task.save();

  // NOTIFICATION: Task Assigned
  const notifyUsers = new Set();
  
  if (task.assignToAll) {
    const allUsers = await User.find({ isActive: true, _id: { $ne: req.user.id } }).select('_id');
    allUsers.forEach(u => notifyUsers.add(u._id.toString()));
  } else if (task.assignedGroupId) {
    const groupMembers = await GroupMember.find({ groupId: task.assignedGroupId }).select('userId');
    groupMembers.forEach(m => notifyUsers.add(m.userId.toString()));
  } else if (task.assigneeIds && task.assigneeIds.length > 0) {
    task.assigneeIds.forEach(id => notifyUsers.add(id.toString()));
  }

  for (const userId of notifyUsers) {
    if (userId === req.user.id.toString()) continue;
    await createNotification({
      recipient: userId,
      actor: req.user.id,
      task: task._id,
      type: 'ASSIGNED',
      title: 'New Task Assigned',
      message: `You have been assigned a new task: ${task.title}`
    });
  }

  // Socket: Emit Full Task Object natively with high-context
  await emitTaskUpdate(task._id, 'create', req.user.id);

  res.status(httpStatus.CREATED).send({ success: true, data: task });
});

export const getTasks = asyncHandler(async (req, res) => {
  const query = pick(req.query, ['status', 'priority', 'taskCategoryId', 'search', 'customerId', 'groupId', 'assigneeType', 'taskMasterId']);
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
  if (query.taskMasterId) andConditions.push({ taskMasterId: toObjectId(query.taskMasterId) });

  if (query.search) {
    andConditions.push({
      $or: [
        { title: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } },
        { billNumber: { $regex: query.search, $options: 'i' } }
      ]
    });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // View specific filters
  if (view === 'today') {
    andConditions.push({ status: { $ne: 'COMPLETED' }, dueDate: { $gte: todayStart, $lte: todayEnd } });
  } else if (view === 'upcoming') {
    andConditions.push({ status: { $ne: 'COMPLETED' }, dueDate: { $gt: todayEnd } });
  } else if (view === 'overdue') {
    andConditions.push({ status: { $ne: 'COMPLETED' }, dueDate: { $lt: todayStart } });
  } else if (view === 'closed') {
    andConditions.push({ status: 'COMPLETED' });
  }

  // Visibility logic
  if (req.user.role !== 'admin') {
    andConditions.push({
      $or: [
        { assigneeIds: req.user.id },
        { createdBy: req.user.id },
        { assignToAll: true }
      ]
    });
  } else {
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
  }

  const filter = andConditions.length ? { $and: andConditions } : {};

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate('assigneeIds', 'name email username')
      .populate('createdBy', 'name email username')
      .populate('taskCategoryId', 'name')
      .populate('assignedGroupId', 'name')
      .populate('groupId', 'name')
      .populate('taskMasterId', 'title recurrence')
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

export const getTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.taskId)
    .populate('assigneeIds', 'name email username')
    .populate('createdBy', 'name email username')
    .populate('taskCategoryId', 'name')
    .populate('assignedGroupId', 'name')
    .populate('groupId', 'name')
    .populate('taskMasterId');

  if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  res.send({ success: true, data: task });
});

export const updateTask = asyncHandler(async (req, res) => {
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
      if (up.assigneeIds.length === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'At least one assignee is required');
    }
  }

  const prevAssignees = task.assigneeIds.map(id => id.toString());
  const newAssignees = up.assigneeIds ? up.assigneeIds.map(id => id.toString()) : prevAssignees;
  const statusChanged = up.status && up.status !== task.status;

  Object.assign(task, up);
  task.updatedBy = req.user.id;
  await task.save();

  // NOTIFICATION: Reassigned
  const addedAssignees = newAssignees.filter(id => !prevAssignees.includes(id));
  for (const assigneeId of addedAssignees) {
    if (assigneeId === req.user.id.toString()) continue;
    await createNotification({
      recipient: assigneeId,
      actor: req.user.id,
      task: task._id,
      type: 'ASSIGNED',
      title: 'Task Assigned',
      message: `You have been assigned to: ${task.title}`
    });
  }

  // NOTIFICATION: Status Change
  if (statusChanged) {
    const statusNotifyUsers = new Set([...newAssignees, task.createdBy.toString()]);
    
    // If assigned to all, we should theoretically notify everyone, but let's notify previous/new assignees and creator to keep it noisy but relevant.
    if (task.assignToAll) {
       // In assign-to-all, everyone is technically an assignee. 
       // For status changes, let's notify the creator at minimum.
       statusNotifyUsers.add(task.createdBy.toString());
    }

    for (const userId of statusNotifyUsers) {
      if (userId === req.user.id.toString()) continue;
      await createNotification({
        recipient: userId,
        actor: req.user.id,
        task: task._id,
        type: 'STATUS_CHANGE',
        title: 'Task Status Updated',
        message: `Status of "${task.title}" changed to ${task.status}`
      });
    }
  }

  // Socket: Emit Full Task Object for Update with high-context
  await emitTaskUpdate(task._id, 'update', req.user.id);

  res.send({ success: true, data: task });
});

export const closeTask = asyncHandler(async (req, res) => {
  const task = await Task.findByIdAndUpdate(
    req.params.taskId,
    {
      status: 'COMPLETED',
      completedAt: new Date(),
      closedAt: new Date(),
      closedBy: req.user.id
    },
    { new: true }
  );

  if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');

  if (task.createdBy) {
    await createNotification({
      recipient: task.createdBy,
      actor: req.user.id,
      task: task._id,
      type: 'COMPLETED',
      title: 'Task Completed',
      message: `Task "${task.title}" has been marked as completed`
    }).catch(err => console.error('Silent fail for notification in closeTask:', err));
  }

  await emitTaskUpdate(task._id, 'update', req.user.id);

  // RECURRENCE: If this task is part of a recurring series, trigger immediate generation of the next instance
  if (task.taskMasterId) {
    generateTaskFromMaster(task.taskMasterId).catch(err => 
      console.error(`Auto-generation failed for master ${task.taskMasterId} on task closure:`, err)
    );
  } else if (task.recurrence && task.recurrence.enabled) {
    // [LEGACY/AD-HOC] Handle recurrence directly on the task if no master exists
    const nextDueDate = calculateNextDueDate(task);
    if (nextDueDate) {
      const nextTaskData = {
        ...task.toObject(),
        _id: undefined,
        dueDate: nextDueDate,
        status: 'OPEN',
        completedAt: undefined,
        closedAt: undefined,
        closedBy: undefined,
        updatedBy: undefined,
        extensionHistory: [],
        updates: [],
        recurrence: {
          ...task.recurrence,
          occurrenceCount: (task.recurrence.occurrenceCount || 1) + 1
        },
        previousTaskId: task._id
      };
      const nextTask = new Task(nextTaskData);
      await nextTask.save();
      await emitTaskUpdate(nextTask._id, 'create', req.user.id);
    }
  }

  res.send({ success: true, data: task });
});

export const updateTaskStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (status === 'COMPLETED') return closeTask(req, res);
  const task = await Task.findById(req.params.taskId);
  if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  task.status = status;
  await task.save();
  await emitTaskUpdate(task._id, 'update', req.user.id);
  res.send({ success: true, data: task });
});

export const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.taskId);
  if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');
  
  // Keep ID before deletion to emit
  const deletedId = task._id;
  await Task.deleteOne({ _id: task._id });
  
  try {
    const io = getIO();
    const payload = {
        moduleName: 'task',
        action: 'delete',
        recordId: deletedId.toString(),
        data: { _id: deletedId },
        timestamp: new Date()
    };
    io.emit('entityChange', payload);
    io.emit('task:deleted', { _id: deletedId });
  } catch (err) {}
  
  res.send({ success: true, message: 'Task deleted' });
});

export const extendTask = asyncHandler(async (req, res) => {
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

    // NOTIFICATION: Task Extended
    if (task.assigneeIds && task.assigneeIds.length > 0) {
        for (const assigneeId of task.assigneeIds) {
            await createNotification({
                recipient: assigneeId,
                actor: req.user.id,
                task: task._id,
                type: 'STATUS_CHANGE', // or a new type if we want
                title: 'Task Due Date Updated',
                message: `The due date for "${task.title}" has been updated to ${new Date(newDueDate).toLocaleDateString()}. Reason: ${reason || 'N/A'}`
            });
        }
    }
  
    await emitTaskUpdate(task._id, 'update', req.user.id);
  
    res.send({ success: true, data: task });
});

export const addTaskUpdate = asyncHandler(async (req, res) => {
    const { taskId } = req.params;
    const { text, isResolution, parentId, status } = req.body;

    const task = await Task.findById(taskId);
    if (!task) throw new ApiError(httpStatus.NOT_FOUND, 'Task not found');

    const updateEntry = {
        text,
        user: req.user.id,
        userName: req.user.name,
        date: new Date(),
        status: status || 'OPEN',
        isResolution: !!isResolution,
        parentId: toObjectId(parentId)
    };

    // If this is a resolution, mark the parent entry as RESOLVED
    if (isResolution && parentId) {
        const parentIdx = task.updates.findIndex(u => u._id.toString() === parentId);
        if (parentIdx !== -1) {
            task.updates[parentIdx].status = 'RESOLVED';
        }
    }

    task.updates.push(updateEntry);
    task.updatedBy = req.user.id;
    await task.save();

    // Trigger real-time sync
    await emitTaskUpdate(task._id, 'update', req.user.id);

    res.status(httpStatus.CREATED).send({ 
        success: true, 
        data: task.updates[task.updates.length - 1],
        task 
    });
});
