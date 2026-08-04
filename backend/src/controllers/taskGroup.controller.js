import httpStatus from 'http-status';
import { TaskGroup } from '../models/taskGroup.model.js';
import { TaskGroupItem } from '../models/taskGroupItem.model.js';
import { Task } from '../models/task.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';

const GROUP_WRITE_KEYS = [
    'name', 'notes', 'groupType', 'visibility', 'userIds', 'coordinatorId',
    'recurrenceType', 'recurrenceInterval', 'recurrenceStartDate', 'recurrenceEndDate',
    'defaultPriority', 'isActive', 'showInTaskHub', 'isHighlighted', 'highlightOrder',
    'highlightIcon', 'highlightStyle', 'showInGeneralTaskLists', 'notifyAllMembers',
    'allowMembersUpdate', 'isDefaultSelected',
];

function pickGroupBody(body = {}) {
    const out = {};
    for (const key of GROUP_WRITE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(body, key)) {
            out[key] = body[key];
        }
    }
    if (out.coordinatorId === '') out.coordinatorId = null;
    return out;
}

function isAdmin(user) {
    return user?.role === 'admin' || user?.role?.name === 'admin';
}

async function accessibleGroupFilter(user) {
    if (isAdmin(user)) return {};
    const userId = user._id || user.id;
    const groupIdsFromTasks = await Task.distinct('groupId', {
        $or: [{ assigneeIds: userId }, { createdBy: userId }],
    });
    return {
        $or: [
            { createdBy: userId },
            { userIds: userId },
            { _id: { $in: (groupIdsFromTasks || []).filter(Boolean) } },
        ],
    };
}

async function syncSampleTasks(groupId, sampleTasks = []) {
    if (!Array.isArray(sampleTasks)) return;
    const keepIds = [];
    for (let i = 0; i < sampleTasks.length; i += 1) {
        const row = sampleTasks[i] || {};
        const payload = {
            groupTemplateId: groupId,
            title: String(row.title || '').trim(),
            notes: row.notes || '',
            description: row.description || row.notes || '',
            dueDayRule: row.dueDayRule || '',
            dueOffsetDays: Number(row.dueOffsetDays) || 0,
            priority: row.priority || 'MEDIUM',
            recurrenceType: row.recurrenceType || 'MONTHLY',
            checklist: Array.isArray(row.checklist) ? row.checklist : [],
            responsibleRole: row.responsibleRole || '',
            isActive: row.isActive !== false,
            sortOrder: row.sortOrder != null ? Number(row.sortOrder) : i,
        };
        if (!payload.title) continue;
        if (row._id) {
            await TaskGroupItem.findOneAndUpdate(
                { _id: row._id, groupTemplateId: groupId },
                { $set: payload },
                { new: true },
            );
            keepIds.push(String(row._id));
        } else {
            const created = await TaskGroupItem.create(payload);
            keepIds.push(String(created._id));
        }
    }
    await TaskGroupItem.deleteMany({
        groupTemplateId: groupId,
        _id: { $nin: keepIds },
    });
}

async function attachTaskStats(groups) {
    const ids = groups.map((g) => g._id);
    if (!ids.length) return groups.map((g) => ({ ...g, taskCount: 0, overdueCount: 0, pendingCount: 0 }));

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totals, overdue, pending] = await Promise.all([
        Task.aggregate([
            { $match: { groupId: { $in: ids } } },
            { $group: { _id: '$groupId', count: { $sum: 1 } } },
        ]),
        Task.aggregate([
            {
                $match: {
                    groupId: { $in: ids },
                    status: { $nin: ['COMPLETED', 'CANCELLED'] },
                    dueDate: { $lt: todayStart },
                },
            },
            { $group: { _id: '$groupId', count: { $sum: 1 } } },
        ]),
        Task.aggregate([
            {
                $match: {
                    groupId: { $in: ids },
                    status: { $nin: ['COMPLETED', 'CANCELLED'] },
                },
            },
            { $group: { _id: '$groupId', count: { $sum: 1 } } },
        ]),
    ]);

    const mapCount = (rows) => Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
    const totalMap = mapCount(totals);
    const overdueMap = mapCount(overdue);
    const pendingMap = mapCount(pending);

    return groups.map((g) => {
        const id = String(g._id);
        return {
            ...g,
            taskCount: totalMap[id] || 0,
            overdueCount: overdueMap[id] || 0,
            pendingCount: pendingMap[id] || 0,
        };
    });
}

const createGroup = asyncHandler(async (req, res) => {
    const body = pickGroupBody(req.body);
    let finalUserIds = Array.isArray(body.userIds) ? [...body.userIds] : [];
    if (!finalUserIds.map(String).includes(String(req.user.id))) {
        finalUserIds.push(req.user.id);
    }

    if (body.isDefaultSelected) {
        await TaskGroup.updateMany({ isDefaultSelected: true }, { $set: { isDefaultSelected: false } });
    }

    const group = await TaskGroup.create({
        ...body,
        name: body.name,
        notes: body.notes || '',
        userIds: finalUserIds,
        visibility: body.visibility || 'COMPANY',
        createdBy: req.user.id,
    });

    await syncSampleTasks(group._id, req.body.sampleTasks);

    const populated = await TaskGroup.findById(group._id)
        .populate('userIds', 'name email')
        .populate('coordinatorId', 'name email')
        .lean();

    res.status(httpStatus.CREATED).send(new ApiResponse(httpStatus.CREATED, populated, 'Group created successfully'));
});

const deleteGroup = asyncHandler(async (req, res) => {
    const group = await TaskGroup.findById(req.params.groupId);
    if (!group) throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');

    await TaskGroup.deleteOne({ _id: group._id });
    await TaskGroupItem.deleteMany({ groupTemplateId: group._id });
    await Task.updateMany({ groupId: group._id }, { $set: { groupId: null, isGroupTask: false } });

    res.send(new ApiResponse(httpStatus.OK, null, 'Group deleted successfully'));
});

const getGroups = asyncHandler(async (req, res) => {
    const access = await accessibleGroupFilter(req.user);
    const filter = { ...access };
    if (req.query.highlighted === 'true' || req.query.highlighted === true) {
        filter.isHighlighted = true;
    }
    if (req.query.active === 'true' || req.query.active === true) {
        filter.isActive = true;
    } else if (req.query.active === 'false' || req.query.active === false) {
        filter.isActive = false;
    }

    let groups = await TaskGroup.find(filter)
        .populate('userIds', 'name email')
        .populate('coordinatorId', 'name email')
        .sort({ isHighlighted: -1, highlightOrder: 1, name: 1 })
        .lean();

    groups = await attachTaskStats(groups);
    res.send(new ApiResponse(httpStatus.OK, groups, 'Groups fetched successfully'));
});

const getHighlightedGroups = asyncHandler(async (req, res) => {
    const access = await accessibleGroupFilter(req.user);
    let groups = await TaskGroup.find({
        ...access,
        isHighlighted: true,
        showInTaskHub: { $ne: false },
        isActive: { $ne: false },
    })
        .populate('userIds', 'name email')
        .populate('coordinatorId', 'name email')
        .sort({ highlightOrder: 1, name: 1 })
        .lean();

    groups = await attachTaskStats(groups);
    res.send(new ApiResponse(httpStatus.OK, groups, 'Highlighted groups fetched'));
});

const getGroup = asyncHandler(async (req, res) => {
    const group = await TaskGroup.findById(req.params.groupId)
        .populate('userIds', 'name email')
        .populate('coordinatorId', 'name email')
        .lean();
    if (!group) throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');

    const access = await accessibleGroupFilter(req.user);
    if (!isAdmin(req.user)) {
        const allowed = await TaskGroup.exists({ _id: group._id, ...access });
        if (!allowed) throw new ApiError(httpStatus.FORBIDDEN, 'You do not have access to this group');
    }

    const [tasks, sampleTasks] = await Promise.all([
        Task.find({ groupId: group._id })
            .populate('assigneeIds', 'name email')
            .populate('taskMasterId', 'title recurrence')
            .sort({ dueDate: 1 })
            .lean(),
        TaskGroupItem.find({ groupTemplateId: group._id }).sort({ sortOrder: 1 }).lean(),
    ]);

    const total = tasks.length;
    const closed = tasks.filter((t) => t.status === 'COMPLETED').length;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0, 23, 59, 59, 999);
    const overdue = tasks.filter(
        (t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && t.dueDate && new Date(t.dueDate) < todayStart,
    ).length;
    const dueThisMonth = tasks.filter((t) => {
        if (!t.dueDate || t.status === 'COMPLETED' || t.status === 'CANCELLED') return false;
        const d = new Date(t.dueDate);
        return d >= monthStart && d <= monthEnd;
    }).length;

    res.send(new ApiResponse(httpStatus.OK, {
        group: { ...group, sampleTasks },
        tasks,
        progress: {
            total,
            closed,
            overdue,
            dueThisMonth,
            completionPct: total ? Math.round((closed / total) * 100) : 0,
        },
    }, 'Group details fetched successfully'));
});

const updateGroup = asyncHandler(async (req, res) => {
    const group = await TaskGroup.findById(req.params.groupId);
    if (!group) throw new ApiError(httpStatus.NOT_FOUND, 'Group not found');

    const body = pickGroupBody(req.body);

    if (body.userIds) {
        let finalUserIds = Array.isArray(body.userIds) ? [...body.userIds] : [];
        if (group.createdBy && !finalUserIds.map(String).includes(String(group.createdBy))) {
            finalUserIds.push(group.createdBy.toString());
        }
        body.userIds = finalUserIds;
    }

    if (body.isDefaultSelected) {
        await TaskGroup.updateMany(
            { _id: { $ne: group._id }, isDefaultSelected: true },
            { $set: { isDefaultSelected: false } },
        );
    }

    Object.assign(group, body);
    await group.save();

    if (Array.isArray(req.body.sampleTasks)) {
        await syncSampleTasks(group._id, req.body.sampleTasks);
    }

    const populated = await TaskGroup.findById(group._id)
        .populate('userIds', 'name email')
        .populate('coordinatorId', 'name email')
        .lean();

    res.send(new ApiResponse(httpStatus.OK, populated, 'Group updated successfully'));
});

const getMyGroups = asyncHandler(async (req, res) => {
    const access = await accessibleGroupFilter(req.user);
    const groups = await TaskGroup.find({ ...access, isActive: { $ne: false } })
        .select('_id name isHighlighted showInTaskHub showInGeneralTaskLists recurrenceType')
        .sort({ name: 1 })
        .lean();
    res.send(new ApiResponse(httpStatus.OK, groups, 'My groups fetched'));
});

const reorderHighlights = asyncHandler(async (req, res) => {
    const orderedIds = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : [];
    for (let i = 0; i < orderedIds.length; i += 1) {
        await TaskGroup.updateOne(
            { _id: orderedIds[i], isHighlighted: true },
            { $set: { highlightOrder: i } },
        );
    }
    res.send(new ApiResponse(httpStatus.OK, { orderedIds }, 'Highlight order updated'));
});

/** Group IDs whose tasks must stay out of general date-wise lists. */
export async function getGeneralListExcludedGroupIds() {
    return TaskGroup.find({
        showInGeneralTaskLists: false,
        isActive: { $ne: false },
    }).distinct('_id');
}

export default {
    createGroup,
    getGroups,
    getMyGroups,
    getHighlightedGroups,
    getGroup,
    updateGroup,
    deleteGroup,
    reorderHighlights,
};
