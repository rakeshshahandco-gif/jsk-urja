import mongoose from 'mongoose';

const stickerSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        color: {
            type: String,
            default: '#64748b', // Default slate-500
        },
        description: {
            type: String,
            trim: true,
            default: '',
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    },
    {
        timestamps: true,
    }
);

/**
 * @typedef Sticker
 */
const Sticker = mongoose.model('Sticker', stickerSchema);

export { Sticker };
