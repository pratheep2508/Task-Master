require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./db');
const Task = require('./models/Task');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { protect } = require('./middleware/auth');
const User = require('./models/User');
const Notification = require('./models/Notification');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'fallback_secret', {
        expiresIn: '30d',
    });
};

// --- AUTH API Endpoints ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Please add all fields' });
        }

        // Check if user exists
        // Check if user exists
        const userExists = await User.findOne({ $or: [{ email }, { username }] });
        if (userExists) {
            return res.status(400).json({ error: 'Username or email already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const user = await User.create({
            username,
            email,
            password: hashedPassword
        });

        if (user) {
            // Create welcome notification
            await Notification.create({
                user: user._id,
                message: `Welcome to Task Master, ${user.username}!`
            });
            
            res.status(201).json({
                _id: user.id,
                username: user.username,
                email: user.email,
                profilePicture: user.profilePicture,
                token: generateToken(user._id)
            });
        } else {
            res.status(400).json({ error: 'Invalid user data' });
        }
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error registering user', details: error.message });
        res.status(500).json({ error: 'Server error registering user' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check for user email
        const user = await User.findOne({ email }).select('+password');

        if (user && (await bcrypt.compare(password, user.password))) {
            res.json({
                _id: user.id,
                username: user.username,
                email: user.email,
                profilePicture: user.profilePicture,
                token: generateToken(user._id)
            });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Server error logging in' });
    }
});

// --- NOTIFICATION API Endpoints ---
app.get('/api/notifications', protect, async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user.id })
                                              .sort({ createdAt: -1 });
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ error: 'Server error fetching notifications' });
    }
});

app.put('/api/notifications/:id/read', protect, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        
        if (!notification) {
             return res.status(404).json({ error: 'Notification not found' });
        }
        
        if (notification.user.toString() !== req.user.id) {
            return res.status(401).json({ error: 'User not authorized' });
        }

        notification.read = true;
        await notification.save();
        res.json(notification);
    } catch (error) {
        res.status(500).json({ error: 'Server error updating notification' });
    }
});


// --- TASK API Endpoints ---

const mapTask = (task) => ({
    id: task._id.toString(),
    text: task.text,
    completed: task.completed,
    category: task.category,
    priority: task.priority,
    dueDate: task.dueDate,
    status: task.status,
    order: task.order,
    createdAt: task.createdAt
});

// 1. Get all tasks (Protected, with search & filter)
app.get('/api/tasks', protect, async (req, res) => {
    try {
        const { search, category, status } = req.query;
        
        let query = { user: req.user.id };
        
        // Search
        if (search) {
            query.text = { $regex: search, $options: 'i' };
        }
        
        // Filter
        if (category && category !== 'All') {
            query.category = category;
        }
        if (status && status !== 'All') {
            query.status = status;
        }

        // Find tasks
        const tasks = await Task.find(query).sort({ order: 1, createdAt: 1 });
        res.json(tasks.map(mapTask));
    } catch (error) {
         console.error(error);
         res.status(500).json({ error: 'Server error retrieving tasks' });
    }
});

// 2. Create a new task (Protected)
app.post('/api/tasks', protect, async (req, res) => {
    try {
        const { text, category, priority, dueDate, status, order } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text is required for a task' });
        }

        const newTask = await Task.create({ 
            text,
            user: req.user.id,
            category: category || 'General',
            priority: priority || 'Medium',
            dueDate: dueDate || null,
            status: status || 'Pending',
            order: order || 0
        });
        res.status(201).json(mapTask(newTask));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error creating task' });
    }
});

// 3. Update an existing task (Protected)
app.put('/api/tasks/:id', protect, async (req, res) => {
    try {
        const { id } = req.params;
        const { text, completed, category, priority, dueDate, status, order } = req.body;

        const task = await Task.findById(id);

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }
        
        // Make sure the logged in user matches the task user
        if (task.user.toString() !== req.user.id) {
             return res.status(401).json({ error: 'User not authorized' });
        }

        const updateData = {};
        if (text !== undefined) updateData.text = text;
        if (completed !== undefined) {
            updateData.completed = completed;
            if (completed) updateData.status = 'Completed';
        }
        if (category !== undefined) updateData.category = category;
        if (priority !== undefined) updateData.priority = priority;
        if (dueDate !== undefined) updateData.dueDate = dueDate;
        if (status !== undefined) {
             updateData.status = status;
             if (status === 'Completed') updateData.completed = true;
             else updateData.completed = false;
        }
        if (order !== undefined) updateData.order = order;

        const updatedTask = await Task.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        res.json(mapTask(updatedTask));
    } catch (error) {
         console.error(error);
         res.status(500).json({ error: 'Server error updating task' });
    }
});

// 4. Delete a task (Protected)
app.delete('/api/tasks/:id', protect, async (req, res) => {
    try {
        const { id } = req.params;
        const task = await Task.findById(id);

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Make sure the logged in user matches the task user
        if (task.user.toString() !== req.user.id) {
             return res.status(401).json({ error: 'User not authorized' });
        }

        await task.deleteOne();

        res.json({ message: 'Task deleted successfully', id });
    } catch (error) {
         console.error(error);
         res.status(500).json({ error: 'Server error deleting task' });
    }
});

// 5. Reorder tasks (Protected)
app.put('/api/tasks/reorder/bulk', protect, async (req, res) => {
    try {
        const { tasks } = req.body; // Array of { id, order }

        if (!tasks || !Array.isArray(tasks)) {
            return res.status(400).json({ error: 'Invalid data format' });
        }

        // Create bulk operations
        const bulkOps = tasks.map((t) => ({
            updateOne: {
                filter: { _id: t.id, user: req.user.id },
                update: { $set: { order: t.order, status: t.status } },
            },
        }));

        if (bulkOps.length > 0) {
            await Task.bulkWrite(bulkOps);
        }

        res.json({ message: 'Tasks reordered successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error reordering tasks' });
    }
});

// --- USER PROFILE & STATS API Endpoints ---

// Get User Stats (Protected)
app.get('/api/user/stats', protect, async (req, res) => {
    try {
        const tasks = await Task.find({ user: req.user.id });
        
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.completed || t.status === 'Completed').length;
        const pendingTasks = tasks.filter(t => !t.completed && t.status !== 'Completed').length;
        
        let overdueTasks = 0;
        const now = new Date();
        tasks.forEach(t => {
             if (t.dueDate && new Date(t.dueDate) < now && !t.completed && t.status !== 'Completed') {
                 overdueTasks++;
             }
        });

        res.json({
            totalTasks,
            completedTasks,
            pendingTasks,
            overdueTasks
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching user stats' });
    }
});

// Get User Profile (Protected)
app.get('/api/user/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error fetching profile' });
    }
});

// Update User Profile (Protected)
app.put('/api/user/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if(!user) return res.status(404).json({ error: 'User not found' });
        
        user.username = req.body.username || user.username;
        user.email = req.body.email || user.email;
        if(req.body.profilePicture !== undefined) {
             user.profilePicture = req.body.profilePicture;
        }

        const updatedUser = await user.save();
        
        res.json({
            _id: updatedUser.id,
            username: updatedUser.username,
            email: updatedUser.email,
            profilePicture: updatedUser.profilePicture,
            token: generateToken(updatedUser._id)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error updating profile' });
    }
});

// Update Password (Protected)
app.put('/api/user/password', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('+password');
        const { currentPassword, newPassword } = req.body;
        
        if (!await bcrypt.compare(currentPassword, user.password)) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }
        
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();
        
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error updating password' });
    }
});

// Add Task Comment (Protected)
app.post('/api/tasks/:id/comments', protect, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Comment text is required' });

        const task = await Task.findById(req.params.id);
        if (!task) return res.status(404).json({ error: 'Task not found' });

        // Ensure user owns the task (or in a team setting, has access to it)
        if (task.user.toString() !== req.user.id) {
             return res.status(401).json({ error: 'User not authorized' });
        }

        const comment = {
            text,
            user: req.user.id,
            username: req.user.username,
            createdAt: new Date()
        };

        task.comments.push(comment);
        await task.save();

        res.status(201).json(task.comments);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error adding comment' });
    }
});

// --- AI INTEGRATION API Endpoints ---

// 1. Smart Task Parsing & Subtask Generation
app.post('/api/ai/parse-or-suggest', protect, async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Text input is required' });

        const prompt = `
        You are an intelligent task manager assistant. Analyze the following user input: "${text}"
        
        If the input is a complex, multi-step project (e.g., "Build a task manager project" or "Plan a birthday party"), suggest a list of 3-5 concrete subtasks.
        If the input is a single, specific task with natural language details (e.g., "Submit assignment tomorrow early" or "Urgent meeting on Friday"), parse out the structured details.
        
        Return exactly ONE valid JSON object, and NOTHING else (no markdown blocks, no conversational text). The JSON format must be:
        {
          "type": "project" | "single_task",
          "parsedTask": {
             "title": "Cleaned up task title",
             "priority": "High" | "Medium" | "Low",
             "dueDate": "ISO Date String OR null",
             "category": "Work" | "Study" | "Personal" | "General"
          },
          "suggestedSubtasks": [
             "Subtask 1 string",
             "Subtask 2 string"
          ]
        }
        
        Rules:
        - For single_task, suggestedSubtasks should be an empty array.
        - For project, parsedTask should have priority "Medium" and dueDate null.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "You are a JSON-only API. You must return valid JSON without any formatting."
            }
        });

        let jsonResponse = response.text;
        if (jsonResponse.startsWith('\`\`\`json')) {
            jsonResponse = jsonResponse.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
        }

        const data = JSON.parse(jsonResponse);
        res.json(data);
    } catch (error) {
        console.error('AI Parsing Error:', error);
        res.status(500).json({ error: 'Failed to process task with AI' });
    }
});

// 2. Productivity Insights & Daily Planner
app.get('/api/ai/insights', protect, async (req, res) => {
    try {
        const tasks = await Task.find({ user: req.user.id });
        if (tasks.length === 0) {
            return res.json({ 
                insight: "You haven't added any tasks yet. Start planning your day!",
                dailyPlan: "1. Add a new task\n2. Explore features"
            });
        }

        // Prepare context
        const completedTasks = tasks.filter(t => t.completed || t.status === 'Completed');
        const pendingTasks = tasks.filter(t => !t.completed && t.status !== 'Completed');
        
        const taskHistory = completedTasks.map(t => 
            `- ${t.text} (Completed at: ${t.updatedAt.toISOString()})`
        ).join('\n');
        
        const currentTasks = pendingTasks.map(t => 
            `- ${t.text} (Priority: ${t.priority}, Due: ${t.dueDate ? t.dueDate.toISOString() : 'None'})`
        ).join('\n');

        const prompt = `
        You are a productivity coach. Given the user's task history and current pending log:
        
        Task History:
        ${taskHistory || "No completed tasks yet."}
        
        Pending Tasks:
        ${currentTasks || "No pending tasks."}
        
        Generate exactly ONE JSON object (no markdown, no formatting). Format:
        {
           "insight": "A 1-2 sentence observation about their productivity (e.g. You seem to finish most tasks in the afternoon). Be encouraging.",
           "dailyPlan": "A 3-step prioritized plan for today based on their pending tasks, formatted as a string with newlines."
        }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "You are a JSON-only API. You must return valid JSON without any formatting."
            }
        });

        let jsonResponse = response.text;
        if (jsonResponse.startsWith('\`\`\`json')) {
            jsonResponse = jsonResponse.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
        }

        const data = JSON.parse(jsonResponse);
        res.json(data);
    } catch (error) {
        console.error('AI Insights Error:', error);
        res.status(500).json({ error: 'Failed to generate productivity insights' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
