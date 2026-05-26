import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import UserUiPreferences from '../models/userUiPreferences.model.js';

/**
 * Per-user UI preferences. Each user owns exactly one document (upserted on
 * first save). The shape of `preferences` is owned by the frontend — backend
 * stores it as an opaque Mixed blob and merges patches shallowly so that a
 * partial update (e.g. only sidebarBg) does not erase other keys.
 */

const safeMerge = (existing, patch) => {
    const out = { ...(existing || {}) };
    if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
        for (const key of Object.keys(patch)) {
            const pv = patch[key];
            if (pv && typeof pv === 'object' && !Array.isArray(pv) && out[key] && typeof out[key] === 'object') {
                out[key] = safeMerge(out[key], pv);
            } else if (pv !== undefined) {
                out[key] = pv;
            }
        }
    }
    return out;
};

export const getMyUiPreferences = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, 'Authentication required');

    const doc = await UserUiPreferences.findOne({ userId }).lean();
    res.status(200).json(new ApiResponse(200, {
        userId,
        preferences: doc?.preferences || {},
    }, 'UI preferences fetched'));
});

export const updateMyUiPreferences = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, 'Authentication required');

    const { preferences: patch } = req.body || {};
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        throw new ApiError(400, 'preferences object is required');
    }

    let doc = await UserUiPreferences.findOne({ userId });
    if (!doc) {
        doc = await UserUiPreferences.create({
            userId,
            preferences: patch,
            updatedBy: userId,
        });
    } else {
        doc.preferences = safeMerge(doc.preferences, patch);
        doc.updatedBy = userId;
        doc.markModified('preferences');
        await doc.save();
    }

    res.status(200).json(new ApiResponse(200, {
        userId,
        preferences: doc.preferences || {},
    }, 'UI preferences updated'));
});

export const resetMyUiPreferences = asyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) throw new ApiError(401, 'Authentication required');

    await UserUiPreferences.findOneAndDelete({ userId });
    res.status(200).json(new ApiResponse(200, {
        userId,
        preferences: {},
    }, 'UI preferences reset'));
});
