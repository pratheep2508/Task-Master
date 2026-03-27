document.addEventListener('DOMContentLoaded', () => {
    try {
        // DOM Elements - App
        const form = document.getElementById('task-form');
        const input = document.getElementById('task-input');
        const navActionsAuth = document.getElementById('nav-actions-auth');
        const appMain = document.getElementById('app-main');
        const usernameDisplay = document.getElementById('username-display');
        const logoutBtn = document.getElementById('logout-btn');

        // DOM Elements - New Features
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        const statsBtn = document.getElementById('stats-btn');
        const profileBtn = document.getElementById('profile-btn');
        const dashboardModal = document.getElementById('dashboard-modal');
        const closeDashboardBtn = document.getElementById('close-dashboard');
        const profileModal = document.getElementById('profile-modal');
        const closeProfileBtn = document.getElementById('close-profile');

        const commentsModal = document.getElementById('comments-modal');
        const closeCommentsBtn = document.getElementById('close-comments');
        const commentsList = document.getElementById('comments-list');
        const commentForm = document.getElementById('comment-form');
        const commentInput = document.getElementById('comment-input');
        let currentCommentTaskId = null;

        const aiEnhanceBtn = document.getElementById('ai-enhance-btn');

        const searchInput = document.getElementById('search-input');
        const filterCategory = document.getElementById('filter-category');
        const listPending = document.getElementById('list-pending');
        const listCompleted = document.getElementById('list-completed');

        const taskCategory = document.getElementById('task-category');
        const taskPriority = document.getElementById('task-priority');
        const taskDueDate = document.getElementById('task-due-date');
        const clearDateBtn = document.getElementById('clear-date-btn');
        const taskIsDaily = document.getElementById('task-is-daily');

        // DOM Elements - Auth
        const authOverlay = document.getElementById('auth-overlay');
        const authForm = document.getElementById('auth-form');
        const toggleLogin = document.getElementById('toggle-login');
        const toggleSignup = document.getElementById('toggle-signup');
        const signupFields = document.getElementById('signup-fields');
        const authUsername = document.getElementById('auth-username');
        const authEmail = document.getElementById('auth-email');
        const authPassword = document.getElementById('auth-password');
        const authError = document.getElementById('auth-error');
        const authSubmitBtn = document.getElementById('auth-submit-btn');

        // DOM Elements - Notifications
        const notiBtn = document.getElementById('noti-btn');
        const notiBadge = document.getElementById('noti-badge');
        const notiDropdown = document.getElementById('noti-dropdown');

        const appToast = document.getElementById('app-toast');

        // State
        let tasks = [];
        let notifications = [];
        let isLoginMode = true;

        let currentUser = null;
        try {
            const stored = localStorage.getItem('user');
            if (stored && stored !== 'undefined') currentUser = JSON.parse(stored);
        } catch (e) {
            console.warn('Could not parse user from localStorage', e);
            localStorage.removeItem('user');
        }

        let notiPollInterval = null;
        let currentTheme = 'dark';
        try {
            currentTheme = localStorage.getItem('theme') || 'dark';
        } catch (e) {
            console.warn('Could not read theme from localStorage', e);
        }
        let statsChartInstance = null;

        // --- API Interactions ---
        const API_URL = '/api';

        // Helper: Auth Headers
        const getAuthHeaders = () => {
            return currentUser ? {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentUser.token}`
            } : { 'Content-Type': 'application/json' };
        };

        // Helper: Show Error
        const showError = (msg) => {
            if (!currentUser) {
                authError.textContent = msg;
                authError.classList.remove('hidden');
                setTimeout(() => authError.classList.add('hidden'), 5000);
            } else if (appToast) {
                appToast.textContent = msg;
                appToast.classList.remove('hidden');
                void appToast.offsetWidth; // trigger reflow
                appToast.classList.add('show');
                setTimeout(() => {
                    appToast.classList.remove('show');
                    setTimeout(() => appToast.classList.add('hidden'), 300);
                }, 5000);
            }
        };

        // --- AUTHENTICATION LOGIC ---

        const checkAuthState = () => {
            if (currentUser && currentUser.token) {
                authOverlay.style.display = 'none';
                navActionsAuth.classList.remove('hidden');
                appMain.classList.remove('hidden');
                usernameDisplay.textContent = currentUser.username;
                if (currentUser.profilePicture) {
                    document.getElementById('navbar-profile-pic').src = currentUser.profilePicture;
                    document.getElementById('navbar-profile-pic').style.display = 'block';
                    document.getElementById('navbar-profile-icon').style.display = 'none';
                }
                fetchTasks();
                fetchNotifications();
                // Start polling for notifications
                if (notiPollInterval) clearInterval(notiPollInterval);
                notiPollInterval = setInterval(fetchNotifications, 30000); // every 30s
            } else {
                authOverlay.style.display = 'flex';
                navActionsAuth.classList.add('hidden');
                appMain.classList.add('hidden');
                // Clear data
                tasks = [];
                notifications = [];
                if (notiPollInterval) clearInterval(notiPollInterval);
            }
        };

        const handleLogout = () => {
            localStorage.removeItem('user');
            currentUser = null;
            checkAuthState();
        };

        logoutBtn.addEventListener('click', handleLogout);

        toggleLogin.addEventListener('click', () => {
            isLoginMode = true;
            toggleLogin.classList.add('active');
            toggleSignup.classList.remove('active');
            signupFields.classList.add('hidden');
            authUsername.required = false;
            authSubmitBtn.textContent = 'Log In';
            authError.classList.add('hidden');
        });

        toggleSignup.addEventListener('click', () => {
            isLoginMode = false;
            toggleSignup.classList.add('active');
            toggleLogin.classList.remove('active');
            signupFields.classList.remove('hidden');
            authUsername.required = true;
            authSubmitBtn.textContent = 'Sign Up';
            authError.classList.add('hidden');
        });

        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
            const payload = isLoginMode
                ? { email: authEmail.value, password: authPassword.value }
                : { username: authUsername.value, email: authEmail.value, password: authPassword.value };

            authSubmitBtn.disabled = true;
            authSubmitBtn.textContent = 'Please wait...';

            try {
                const res = await fetch(`${API_URL}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || 'Authentication failed');
                }

                currentUser = data;
                localStorage.setItem('user', JSON.stringify(currentUser));

                // Clear form
                authPassword.value = '';

                checkAuthState();
            } catch (error) {
                showError(error.message);
            } finally {
                authSubmitBtn.disabled = false;
                authSubmitBtn.textContent = isLoginMode ? 'Log In' : 'Sign Up';
            }
        });

        // --- NOTIFICATIONS LOGIC ---

        const fetchNotifications = async () => {
            try {
                const res = await fetch(`${API_URL}/notifications`, { headers: getAuthHeaders() });
                if (!res.ok) {
                    if (res.status === 401) handleLogout();
                    throw new Error('Failed to fetch notifications');
                }
                notifications = await res.json();
                renderNotifications();
            } catch (error) {
                console.error(error);
            }
        };

        const markNotificationRead = async (id) => {
            try {
                await fetch(`${API_URL}/notifications/${id}/read`, {
                    method: 'PUT',
                    headers: getAuthHeaders()
                });
                // Update local state and re-render
                const noti = notifications.find(n => n._id === id);
                if (noti) noti.read = true;
                renderNotifications();
            } catch (error) {
                console.error('Error marking notification read', error);
            }
        };

        const renderNotifications = () => {
            const unreadCount = notifications.filter(n => !n.read).length;

            if (unreadCount > 0) {
                notiBadge.textContent = unreadCount;
                notiBadge.classList.remove('hidden');
            } else {
                notiBadge.classList.add('hidden');
            }

            notiDropdown.innerHTML = '';

            if (notifications.length === 0) {
                notiDropdown.innerHTML = `<div class="dropdown-empty">No notifications</div>`;
                return;
            }

            notifications.slice(0, 10).forEach(noti => { // Show top 10
                const div = document.createElement('div');
                div.className = `noti-item ${!noti.read ? 'noti-unread' : ''}`;
                div.innerHTML = `
                <div style="font-size: 0.95rem;">${escapeHTML(noti.message)}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
                    ${new Date(noti.createdAt).toLocaleDateString()}
                </div>
            `;
                if (!noti.read) {
                    div.addEventListener('click', () => markNotificationRead(noti._id));
                }
                notiDropdown.appendChild(div);
            });
        };

        notiBtn.addEventListener('click', () => {
            notiDropdown.classList.toggle('hidden');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!notiBtn.contains(e.target) && !notiDropdown.contains(e.target)) {
                notiDropdown.classList.add('hidden');
            }
        });


        // --- TASK STATE & LOGIC ---

        const fetchTasks = async () => {
            try {
                const search = searchInput.value;
                const category = filterCategory.value;
                const queryParams = new URLSearchParams({ search, category }).toString();

                const response = await fetch(`${API_URL}/tasks?${queryParams}`, { headers: getAuthHeaders() });
                if (!response.ok) {
                    if (response.status === 401) handleLogout();
                    throw new Error('Failed to fetch tasks');
                }
                tasks = await response.json();
                renderTasks();
            } catch (error) {
                console.error('Error loading tasks:', error);
            }
        };

        const updateTaskOnServer = async (id, updateData) => {
            try {
                const response = await fetch(`${API_URL}/tasks/${id}`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify(updateData)
                });
                if (!response.ok) throw new Error('Failed to update task');
                const updatedTask = await response.json();
                tasks = tasks.map(t => t.id === id ? updatedTask : t);
                return true;
            } catch (error) {
                console.error('Error updating task:', error);
                return false;
            }
        };

        const getPriorityIcon = (p) => {
            if (p === 'High') return '🔴';
            if (p === 'Medium') return '🟡';
            return '🟢';
        };

        const renderTasks = () => {
            listPending.innerHTML = '';
            listCompleted.innerHTML = '';

            if (tasks.length === 0) {
                listPending.innerHTML = `
                <div class="empty-state">
                    <i class="ph ph-note-blank"></i>
                    <p>No tasks found.</p>
                </div>
            `;
                return;
            }

            tasks.forEach(task => {
                const li = document.createElement('li');
                li.className = `task-item ${task.completed ? 'completed' : ''}`;
                li.dataset.id = task.id;
                li.setAttribute('draggable', true);

                let isOverdue = false;
                if (task.dueDate && task.status !== 'Completed' && !task.completed) {
                    isOverdue = new Date(task.dueDate) < new Date();
                }

                li.innerHTML = `
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} aria-label="Toggle Completion">
                <div class="task-content-wrapper" style="flex:1">
                    <span class="task-content">${escapeHTML(task.text)}</span>
                    <div class="task-meta" style="margin-top:8px;">
                        <span class="task-pill">${escapeHTML(task.category || 'General')}</span>
                        <span class="task-pill ${task.priority ? task.priority.toLowerCase() : 'medium'}">${getPriorityIcon(task.priority)} ${task.priority || 'Medium'}</span>
                        ${task.dueDate ? `<span class="task-pill ${isOverdue ? 'overdue' : ''}">Due: ${new Date(task.dueDate).toLocaleDateString()}</span>` : ''}
                        ${task.isDaily ? `<span class="task-pill" style="color:var(--primary);" title="Daily Task"><i class="ph ph-arrows-clockwise"></i> Daily</span>` : ''}
                    </div>
                </div>
                <div class="task-actions">
                    <button class="btn-icon btn-comment" title="Comments"><i class="ph ph-chat-text"></i> <span style="font-size:0.75rem;">${task.comments ? task.comments.length : 0}</span></button>
                    <button class="btn-icon btn-edit" title="Edit"><i class="ph ph-pencil-simple"></i></button>
                    <button class="btn-icon btn-delete" title="Delete"><i class="ph ph-trash"></i></button>
                </div>
            `;

                const commentBtn = li.querySelector('.btn-comment');
                commentBtn.addEventListener('click', () => openCommentsModal(task));

                const checkbox = li.querySelector('.task-checkbox');
                checkbox.addEventListener('change', async () => {
                    const newStatus = !task.completed;
                    task.completed = newStatus;
                    task.status = newStatus ? 'Completed' : 'Pending';
                    li.classList.toggle('completed', newStatus);
                    await updateTaskOnServer(task.id, { completed: newStatus, status: task.status });
                    renderTasks();
                });

                const editBtn = li.querySelector('.btn-edit');
                editBtn.addEventListener('click', () => enterEditMode(li, task));

                const deleteBtn = li.querySelector('.btn-delete');
                deleteBtn.addEventListener('click', async () => {
                    li.style.transform = 'scale(0.95)';
                    li.style.opacity = '0';
                    setTimeout(async () => {
                        try {
                            const response = await fetch(`${API_URL}/tasks/${task.id}`, { method: 'DELETE', headers: getAuthHeaders() });
                            if (response.ok) {
                                tasks = tasks.filter(t => t.id !== task.id);
                                renderTasks();
                            }
                        } catch (error) { console.error('Error deleting task:', error); }
                    }, 200);
                });

                // Drag Events
                li.addEventListener('dragstart', () => {
                    li.classList.add('dragging');
                });
                li.addEventListener('dragend', () => {
                    li.classList.remove('dragging');
                    updateTaskOrderAndStatus();
                });

                if (task.status === 'Completed' || task.completed) {
                    listCompleted.appendChild(li);
                } else {
                    listPending.appendChild(li);
                }
            });
        };

        // Clear Date Logic
        taskDueDate.addEventListener('change', () => {
            if (taskDueDate.value) clearDateBtn.classList.remove('hidden');
            else clearDateBtn.classList.add('hidden');
        });

        clearDateBtn.addEventListener('click', () => {
            taskDueDate.value = '';
            clearDateBtn.classList.add('hidden');
        });

        // --- AI ENHANCE FEATURE ---
        if (aiEnhanceBtn) {
            aiEnhanceBtn.addEventListener('click', async () => {
                const text = input.value.trim();
                if (!text) {
                    showError('Please type a task description first to enhance it!');
                    return;
                }

                const originalText = aiEnhanceBtn.innerHTML;
                aiEnhanceBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Thinking...';
                aiEnhanceBtn.disabled = true;

                try {
                    const res = await fetch(`${API_URL}/ai/parse-or-suggest`, {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ text })
                    });
                    const data = await res.json();

                    if (!res.ok) throw new Error(data.error || 'Failed to analyze task');

                    if (data.type === 'single_task') {
                        input.value = data.parsedTask.title;
                        if (data.parsedTask.priority) taskPriority.value = data.parsedTask.priority;
                        if (data.parsedTask.category) taskCategory.value = data.parsedTask.category;
                        if (data.parsedTask.dueDate) {
                            const dateObj = new Date(data.parsedTask.dueDate);
                            if (!isNaN(dateObj)) taskDueDate.value = dateObj.toISOString().split('T')[0];
                            clearDateBtn.classList.remove('hidden');
                        }
                    } else if (data.type === 'project' && data.suggestedSubtasks?.length > 0) {
                        // It's a project, bulk add the subtasks
                        input.value = ''; // clear input
                        for (const subText of data.suggestedSubtasks) {
                            await fetch(`${API_URL}/tasks`, {
                                method: 'POST',
                                headers: getAuthHeaders(),
                                body: JSON.stringify({
                                    text: subText,
                                    priority: 'Medium',
                                    category: taskCategory.value,
                                    dueDate: ''
                                })
                            });
                        }
                        fetchTasks(); // Reload the board
                    }
                } catch (error) {
                    showError(error.message);
                } finally {
                    aiEnhanceBtn.innerHTML = originalText;
                    aiEnhanceBtn.disabled = false;
                }
            });
        }

        // Add new task
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = input.value.trim();
            const category = taskCategory.value;
            const priority = taskPriority.value;
            const dueDate = taskDueDate.value;
            const isDaily = taskIsDaily.checked;

            if (!text) return;

            try {
                const response = await fetch(`${API_URL}/tasks`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({
                        text,
                        category,
                        priority,
                        dueDate: dueDate || null,
                        isDaily,
                        status: 'Pending',
                        order: tasks.length
                    })
                });
                if (!response.ok) {
                    if (response.status === 401) handleLogout();
                    throw new Error('Failed to add task');
                }
                const newTask = await response.json();
                tasks.push(newTask);
                input.value = '';
                taskDueDate.value = ''; // reset
                taskIsDaily.checked = false; // reset
                clearDateBtn.classList.add('hidden');
                renderTasks();
            } catch (error) {
                console.error('Error adding task:', error);
            }
        });

        // Enter Inline Edit Mode
        const enterEditMode = (li, task) => {
            li.innerHTML = `
            <input type="text" class="edit-input" value="${escapeHTML(task.text)}">
            <div class="task-actions" style="opacity: 1;">
                <button class="btn-icon btn-save" title="Save" style="color: var(--success);"><i class="ph ph-check-circle"></i></button>
                <button class="btn-icon btn-cancel" title="Cancel"><i class="ph ph-x-circle"></i></button>
            </div>
        `;

            const editInput = li.querySelector('.edit-input');
            editInput.focus();
            editInput.selectionStart = editInput.selectionEnd = editInput.value.length;

            const commitSave = async () => {
                const newText = editInput.value.trim();
                if (newText && newText !== task.text) {
                    await updateTaskOnServer(task.id, { text: newText });
                }
                renderTasks();
            };

            li.querySelector('.btn-save').addEventListener('click', commitSave);
            li.querySelector('.btn-cancel').addEventListener('click', renderTasks);
            editInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') commitSave();
                if (e.key === 'Escape') renderTasks();
            });
        };

        // Security: Escape HTML characters
        const escapeHTML = (str) => {
            const div = document.createElement('div');
            div.appendChild(document.createTextNode(str));
            return div.innerHTML;
        };

        // Theme Logic
        const applyTheme = (theme) => {
            if (theme === 'light') {
                document.body.classList.add('light-theme');
                themeToggleBtn.innerHTML = '<i class="ph ph-moon"></i>';
            } else {
                document.body.classList.remove('light-theme');
                themeToggleBtn.innerHTML = '<i class="ph ph-sun"></i>';
            }
        };
        applyTheme(currentTheme);
        themeToggleBtn.addEventListener('click', () => {
            currentTheme = currentTheme === 'light' ? 'dark' : 'light';
            localStorage.setItem('theme', currentTheme);
            applyTheme(currentTheme);
        });

        // Drag and Drop Logic
        const setupDragAndDrop = () => {
            const dropzones = document.querySelectorAll('.dropzone');
            dropzones.forEach(zone => {
                zone.addEventListener('dragover', e => {
                    e.preventDefault();
                    const afterElement = getDragAfterElement(zone, e.clientY);
                    const draggable = document.querySelector('.dragging');
                    if (!draggable) return;
                    if (afterElement == null) {
                        zone.appendChild(draggable);
                    } else {
                        zone.insertBefore(draggable, afterElement);
                    }
                });
            });
        };

        const getDragAfterElement = (container, y) => {
            const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
            return draggableElements.reduce((closest, child) => {
                const box = child.getBoundingClientRect();
                const offset = y - box.top - box.height / 2;
                if (offset < 0 && offset > closest.offset) {
                    return { offset: offset, element: child };
                } else {
                    return closest;
                }
            }, { offset: Number.NEGATIVE_INFINITY }).element;
        };

        const updateTaskOrderAndStatus = async () => {
            const dropzones = document.querySelectorAll('.dropzone');
            const bulkUpdate = [];
            let globalOrder = 0;

            dropzones.forEach(zone => {
                const status = zone.dataset.status;
                const items = zone.querySelectorAll('.task-item');
                items.forEach(item => {
                    const id = item.dataset.id;
                    const task = tasks.find(t => t.id === id);
                    if (task && (task.status !== status || task.order !== globalOrder)) {
                        task.status = status;
                        if (status === 'Completed') task.completed = true;
                        if (status === 'Pending') task.completed = false;
                        task.order = globalOrder;
                        bulkUpdate.push({ id: task.id, status: task.status, order: task.order });
                    }
                    globalOrder++;
                });
            });

            if (bulkUpdate.length > 0) {
                try {
                    await fetch(`${API_URL}/tasks/reorder/bulk`, {
                        method: 'PUT',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({ tasks: bulkUpdate })
                    });
                    renderTasks();
                } catch (e) { console.error('Reorder error', e); }
            } else {
                renderTasks();
            }
        };
        setupDragAndDrop();

        // Toolbar Filters
        searchInput.addEventListener('input', fetchTasks);
        filterCategory.addEventListener('change', fetchTasks);

        // Modals
        // --- PROFILE MODAL & LOGIC ---
        const profileEditForm = document.getElementById('profile-edit-form');
        const passwordEditForm = document.getElementById('password-edit-form');
        const profileMsg = document.getElementById('profile-msg');

        const fetchProfile = async () => {
            try {
                const res = await fetch(`${API_URL}/user/profile`, { headers: getAuthHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    document.getElementById('profile-modal-pic').src = data.profilePicture || 'https://cdn.iconscout.com/icon/free/png-256/free-user-circle-3609976-3014616.png';
                    document.getElementById('profile-pic-input').value = data.profilePicture || '';
                    document.getElementById('profile-name-input').value = data.username;
                    document.getElementById('profile-email-input').value = data.email;
                    profileModal.classList.remove('hidden');
                    profileMsg.classList.add('hidden');
                }
            } catch (err) { console.error('Failed to load profile details'); }
        };

        profileEditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = profileEditForm.querySelector('button');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            try {
                const res = await fetch(`${API_URL}/user/profile`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({
                        username: document.getElementById('profile-name-input').value,
                        email: document.getElementById('profile-email-input').value,
                        profilePicture: document.getElementById('profile-pic-input').value
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to update profile');

                currentUser = data; // Update local storage with new token and pic
                localStorage.setItem('user', JSON.stringify(currentUser));
                if (currentUser.profilePicture) {
                    document.getElementById('navbar-profile-pic').src = currentUser.profilePicture;
                    document.getElementById('navbar-profile-pic').style.display = 'block';
                    document.getElementById('navbar-profile-icon').style.display = 'none';
                }
                usernameDisplay.textContent = currentUser.username;

                document.getElementById('profile-modal-pic').src = document.getElementById('profile-pic-input').value;
                profileMsg.style.color = 'var(--success)';
                profileMsg.textContent = 'Profile updated successfully!';
                profileMsg.classList.remove('hidden');
            } catch (error) {
                profileMsg.style.color = 'var(--danger)';
                profileMsg.textContent = error.message;
                profileMsg.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Save Profile';
                setTimeout(() => profileMsg.classList.add('hidden'), 3000);
            }
        });

        passwordEditForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = passwordEditForm.querySelector('button');
            btn.disabled = true;
            btn.textContent = 'Updating...';

            try {
                const res = await fetch(`${API_URL}/user/password`, {
                    method: 'PUT',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({
                        currentPassword: document.getElementById('profile-old-pass').value,
                        newPassword: document.getElementById('profile-new-pass').value
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to update password');

                passwordEditForm.reset();
                profileMsg.style.color = 'var(--success)';
                profileMsg.textContent = 'Password updated successfully!';
                profileMsg.classList.remove('hidden');
            } catch (error) {
                profileMsg.style.color = 'var(--danger)';
                profileMsg.textContent = error.message;
                profileMsg.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Update Password';
                setTimeout(() => profileMsg.classList.add('hidden'), 3000);
            }
        });

        const fetchStats = async () => {
            try {
                // Fetch normal numerical stats
                const res = await fetch(`${API_URL}/user/stats`, { headers: getAuthHeaders() });
                const data = await res.json();
                document.getElementById('stat-total').textContent = data.totalTasks;
                document.getElementById('stat-completed').textContent = data.completedTasks;
                document.getElementById('stat-pending').textContent = data.pendingTasks;
                document.getElementById('stat-overdue').textContent = data.overdueTasks;

                const ctx = document.getElementById('stats-chart').getContext('2d');
                if (statsChartInstance) statsChartInstance.destroy();
                statsChartInstance = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Completed', 'Pending', 'Overdue'],
                        datasets: [{
                            data: [data.completedTasks, Math.max(0, data.pendingTasks - data.overdueTasks), data.overdueTasks],
                            backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                            borderWidth: 0
                        }]
                    },
                    options: { plugins: { legend: { labels: { color: currentTheme === 'light' ? '#0f172a' : '#fff' } } } }
                });

                dashboardModal.classList.remove('hidden');

                // Fire off AI Insights request in background (don't block dashboard open)
                const aiSection = document.getElementById('ai-insights-section');
                const aiText = document.getElementById('ai-insight-text');
                const aiPlan = document.getElementById('ai-daily-plan');

                aiSection.style.display = 'block';
                aiText.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Generating personalized insights...';
                aiPlan.innerHTML = '';

                fetch(`${API_URL}/ai/insights`, { headers: getAuthHeaders() })
                    .then(r => r.json())
                    .then(aiData => {
                        aiText.textContent = aiData.insight;
                        aiPlan.textContent = "Today's Suggested Plan:\n" + aiData.dailyPlan;
                    })
                    .catch(err => {
                        aiText.textContent = 'Could not load insights at this time.';
                    });

            } catch (error) { console.error(error); }
        };

        profileBtn.addEventListener('click', fetchProfile);
        statsBtn.addEventListener('click', fetchStats);
        closeProfileBtn.addEventListener('click', () => profileModal.classList.add('hidden'));
        closeDashboardBtn.addEventListener('click', () => dashboardModal.classList.add('hidden'));

        // Auth Flow Overrides
        closeProfileBtn.addEventListener('click', () => {
            const modals = document.querySelectorAll('.overlay:not(#auth-overlay)');
            modals.forEach(m => m.classList.add('hidden'));
        });

        // --- COMMENTS MODAL LOGIC ---
        const openCommentsModal = (task) => {
            currentCommentTaskId = task.id;
            renderComments(task.comments || []);
            commentsModal.classList.remove('hidden');
        };

        closeCommentsBtn.addEventListener('click', () => {
            commentsModal.classList.add('hidden');
            currentCommentTaskId = null;
        });

        const renderComments = (commentsArray) => {
            if (commentsArray.length === 0) {
                commentsList.innerHTML = '<div class="empty-state"><i class="ph ph-chat-circle-dots"></i><p>No comments yet. Be the first!</p></div>';
                return;
            }

            commentsList.innerHTML = commentsArray.map(c => `
            <div class="comment-item">
                <div class="comment-header">
                    <span class="comment-author">${escapeHTML(c.username || 'User')}</span>
                    <span class="comment-date">${new Date(c.createdAt).toLocaleDateString()} ${new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="comment-text">${escapeHTML(c.text)}</div>
            </div>
        `).join('');

            // Auto scroll to bottom
            commentsList.scrollTop = commentsList.scrollHeight;
        };

        commentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = commentInput.value.trim();
            if (!text || !currentCommentTaskId) return;

            try {
                const res = await fetch(`${API_URL}/tasks/${currentCommentTaskId}/comments`, {
                    method: 'POST',
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ text })
                });

                if (res.ok) {
                    const updatedComments = await res.json();
                    renderComments(updatedComments);

                    // Update local task cache so pill counter updates
                    const t = tasks.find(t => t.id === currentCommentTaskId);
                    if (t) t.comments = updatedComments;

                    commentInput.value = '';
                    renderTasks(); // Updates counters in UI
                }
            } catch (error) {
                console.error('Failed to post comment', error);
            }
        });

        // Initialize App
        checkAuthState();
    } catch (e) {
        document.body.innerHTML += `<div style="position:fixed; z-index:9999; top:10px; left:10px; background:red; color:white; padding:10px;">ERROR IN APP.JS: ${e.message}</div>`;
        console.error(e);
    }
});
