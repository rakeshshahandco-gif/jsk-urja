import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Role name is required'],
        unique: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    // Permissions structure: { moduleName: { action: value } }
    // Example: { sales: { view: 'all', create: true, edit: true, delete: false } }
    permissions: {
        type: Object,
        default: {}
    },
    menuRights: [{
        type: String
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    isSystemRole: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    disableTenant: true,
});

const Role = mongoose.model('Role', roleSchema);

export { Role };
