const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: [true, 'Please add a text value']
    },
    completed: {
        type: Boolean,
        default: false
    },
    category: {
        type: String,
        default: 'General'
    },
    priority: {
        type: String,
        enum: ['High', 'Medium', 'Low'],
        default: 'Medium'
    },
    dueDate: {
        type: Date
    },
    status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Completed'],
        default: 'Pending'
    },
    isDaily: {
        type: Boolean,
        default: false
    },
    completedAt: {
        type: Date,
        default: null
    },
    order: {
        type: Number,
        default: 0
    },
    comments: [{
        text: String,
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        username: String,
        createdAt: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true // Automatically adds createdAt and updatedAt fields
});

module.exports = mongoose.model('Task', taskSchema);
