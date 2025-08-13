// --- IMPORTS & INITIALIZATION ---
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.8/+esm';

// --- CONFIGURATION ---
const API_BASE_URL = 'http://127.0.0.1:5000'; // Your Python server
const SUPABASE_URL = 'https://orfhzlynimdbbgochlpu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yZmh6bHluaW1kYmJnb2NobHB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwOTMzNDAsImV4cCI6MjA3MDY2OTM0MH0.OuOxnsIl7hrpOPuQ7WxrCNhJwEnwGdv8lE8rdODp3oU';

// --- INITIALIZATION ---
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// --- GLOBAL STATE ---
const state = {
    user: null,
    currentTask: null,
    taskSubscription: null,
    bidSubscription: null,
    chatSubscription: null,
};

// --- UI ELEMENTS ---
const mainContent = document.getElementById('main-content');
const userMenu = document.getElementById('user-menu');
const authLinks = document.getElementById('auth-links');
const userEmailEl = document.getElementById('user-email');
const userAvatar = document.getElementById('user-avatar');
const mobileMenu = document.getElementById('mobile-menu');
const modalContainer = document.getElementById('modal-container');
const modalContent = document.getElementById('modal-content');

// --- API HELPERS ---
const api = {
    async request(endpoint, options = {}) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("User not logged in.");
        
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            ...options.headers,
        };
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
        
        const responseData = await response.json();
        if (!response.ok) {
            throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
        }
        return responseData;
    },
    async publicRequest(endpoint, options = {}) {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        return response.json();
    },
    suggestDescription: (title) => api.request('/suggest-description', { method: 'POST', body: JSON.stringify({ title }) }),
     deleteTask: (taskId) => api.request(`/tasks/${taskId}`, { method: 'DELETE' }),
};

// --- AUTHENTICATION CONTROLLER ---
const authController = {
    init() {
        supabase.auth.onAuthStateChange((event, session) => {
            state.user = session?.user ?? null;
            this.updateUI(state.user);
            router.handleLocation();
        });
    },
    async handleRegister(email, password) {
        try {
            const response = await api.publicRequest('/register', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            showNotification(response.message);
            ui.closeModal();
            window.location.hash = '#login';
        } catch (error) {
            showNotification(error.message, true);
        }
    },
    async handleLogin(email, password) {
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
        } catch (error) {
            showNotification(error.message, true);
        }
    },
    async handleLogout() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            state.user = null;
            window.location.hash = '#login';
        } catch (error) {
            showNotification(error.message, true);
        }
    },
    updateUI(user) {
        if (user) {
            authLinks.classList.add('hidden');
            userMenu.classList.remove('hidden');
            userEmailEl.textContent = user.email;
            userAvatar.src = `https://placehold.co/40x40/DBE4C9/8AA624?text=${user.email[0].toUpperCase()}`;
        } else {
            authLinks.classList.remove('hidden');
            userMenu.classList.add('hidden');
            userEmailEl.textContent = '';
        }
        this.updateMobileMenu(user);
    },
    updateMobileMenu(user) {
        mobileMenu.innerHTML = '';
        if (user) {
            mobileMenu.innerHTML = `
                <button id="mobile-post-task-btn" class="btn btn-primary w-full">Post a Task</button>
                <button id="mobile-logout-btn" class="btn btn-secondary w-full">Logout</button>
            `;
        } else {
            mobileMenu.innerHTML = `
                <a href="#login" class="nav-link btn btn-secondary w-full">Log In</a>
                <a href="#register" class="nav-link btn btn-primary w-full">Register</a>
            `;
        }
    }
};

// --- UI & RENDERING ---
const ui = {
    render(html) {
        mainContent.innerHTML = html;
        lucide.createIcons();
    },
    createStaggeredTitle(text) {
        return text.split('').map((letter, index) =>
            `<span class="stagger-letter" style="animation-delay: ${index * 40}ms">${letter === ' ' ? '&nbsp;' : letter}</span>`
        ).join('');
    },
    WelcomeView: () => `
        <div class="text-center py-16 md:py-24 fade-in">
            <h1 class="text-5xl md:text-7xl font-heading font-bold mb-4">${ui.createStaggeredTitle('Fast. Local. Trusted.')}</h1>
            <p class="text-lg text-slate-600 max-w-2xl mx-auto mb-8">Your community's marketplace for getting things done. Post a task and get bids from trusted locals in minutes.</p>
            <div><a href="#register" class="nav-link btn btn-primary">Get Started Now</a></div>
        </div>
    `,
    LoginView: () => `
        <div class="max-w-md mx-auto mt-12 bg-white p-8 rounded-2xl shadow-lg fade-in">
            <h2 class="font-heading text-3xl font-bold text-center mb-2">Welcome Back!</h2>
            <p class="text-center text-slate-500 mb-8">Log in to manage your tasks.</p>
            <form id="login-form">
                <div class="mb-4">
                    <label for="login-email" class="block text-sm font-medium text-slate-600 mb-2">Email</label>
                    <input type="email" id="login-email" name="email" required class="form-input">
                </div>
                <div class="mb-6">
                    <label for="login-password" class="block text-sm font-medium text-slate-600 mb-2">Password</label>
                    <input type="password" id="login-password" name="password" required class="form-input">
                </div>
                <button type="submit" class="btn btn-primary w-full">Log In</button>
            </form>
            <p class="text-center text-sm text-slate-500 mt-6">Don't have an account? <a href="#register" class="nav-link font-semibold text-[#8AA624] hover:underline">Register here</a></p>
        </div>
    `,
    RegisterView: () => `
        <div class="max-w-md mx-auto mt-12 bg-white p-8 rounded-2xl shadow-lg fade-in">
            <h2 class="font-heading text-3xl font-bold text-center mb-2">Join BidBridge</h2>
            <p class="text-center text-slate-500 mb-8">Create an account to post and bid on tasks.</p>
            <form id="register-form">
                <div class="mb-4">
                    <label for="register-email" class="block text-sm font-medium text-slate-600 mb-2">Email</label>
                    <input type="email" id="register-email" name="email" required class="form-input">
                </div>
                <div class="mb-6">
                    <label for="register-password" class="block text-sm font-medium text-slate-600 mb-2">Password</label>
                    <input type="password" id="register-password" name="password" required class="form-input">
                </div>
                <button type="submit" class="btn btn-primary w-full">Create Account</button>
            </form>
            <p class="text-center text-sm text-slate-500 mt-6">Already have an account? <a href="#login" class="nav-link font-semibold text-[#8AA624] hover:underline">Log in here</a></p>
        </div>
    `,
    DashboardView: (tasks) => `
        <div class="fade-in">
            <h1 class="font-heading text-4xl font-bold mb-8">Available Tasks</h1>
            <div id="task-list" class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${tasks.length > 0 ? tasks.map(ui.TaskCard).join('') : ui.EmptyState('inbox', 'No tasks yet', 'Why not post the first one?')}
            </div>
        </div>
    `,

TaskCard: (task) => {
        const now = new Date();
        const expires = new Date(task.expires_at);

        // A task is urgent if it has a future expiration date.
        const isUrgent = task.expires_at && expires > now;

        const urgentClass = isUrgent ? 'urgent-task' : '';

        return `
        <a href="#task-${task.id}" class="nav-link task-card bg-white rounded-2xl shadow-md p-6 border-2 border-slate-200/80 ${urgentClass}" id="task-card-${task.id}">
            <div class="flex justify-between items-start">
                <h3 class="font-heading text-xl font-bold mb-2 pr-4">${task.title}</h3>
                <div class="text-right">
                    <span class="font-bold text-lg text-[#8AA624]">₹${task.budget}</span>
                    ${isUrgent ? `<span class="block mt-1 text-xs font-semibold px-2 py-1 rounded-full bg-orange-100 text-orange-800">🔥 Urgent</span>` : ''}
                </div>
            </div>
            <p class="text-slate-500 mb-4 h-12 overflow-hidden">${task.description}</p>
            <div class="flex items-center text-sm text-slate-500 mt-4 pt-4 border-t">
                <i data-lucide="map-pin" class="h-4 w-4 mr-2"></i>
                <span>${task.from_location} to ${task.to_location}</span>
            </div>
        </a>
    `;
    },
TaskDetailView: (task, bids) => {
    const isOwner = task.poster_id === state.user?.id;
    return `
    <div class="fade-in">
        <a href="#dashboard" class="nav-link btn btn-secondary mb-6"><i data-lucide="arrow-left"></i>Back</a>
        <div class="bg-white rounded-2xl shadow-xl p-6 md:p-8">
            <div class="flex flex-col md:flex-row justify-between items-start gap-4">
                <div>
                    <h2 class="font-heading text-4xl font-bold">${task.title}</h2>
                    <p class="text-slate-500 mt-2">Posted by ${task.users.email}</p>
                </div>
                <div class="text-right flex-shrink-0">
                    <div class="font-bold text-2xl text-[#8AA624]">₹${task.budget}</div>
                    <span class="text-sm font-semibold px-3 py-1 rounded-full mt-2 inline-block ${task.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}">${task.status}</span>
                </div>
            </div>

            ${isOwner ? `
            <div class="mt-6 p-4 border-l-4 border-red-400 bg-red-50 rounded-r-lg">
                <div class="flex">
                    <div class="flex-shrink-0">
                        <i data-lucide="shield-alert" class="h-5 w-5 text-red-500"></i>
                    </div>
                    <div class="ml-3">
                        <p class="text-sm text-red-700">
                            You are the owner of this task.
                            <button id="delete-task-btn" class="ml-2 font-medium underline hover:text-red-600">Delete this task</button>
                        </p>
                    </div>
                </div>
            </div>
            ` : ''}

            <div class="grid lg:grid-cols-2 gap-8 mt-8">
                <div id="bids-section">
                    <h3 class="font-heading text-2xl font-semibold mb-4">Bids</h3>
                    <div id="bids-list" class="space-y-4">
                        ${bids.length > 0 ? bids.map(bid => ui.BidCard(bid, task)).join('') : ui.EmptyState('gavel', 'No bids yet', 'Be the first!')}
                    </div>
                    ${(task.status === 'open' && !isOwner) ? ui.BidForm() : ''}
                </div>
                <div id="chat-section" class="${task.status === 'assigned' ? '' : 'hidden'}">
                    <h3 class="font-heading text-2xl font-semibold mb-4">Chat</h3>
                    <div id="chat-messages" class="chat-box"></div>
                    <form id="chat-form" class="flex gap-2 mt-4">
                        <input type="text" id="chat-message-input" class="form-input flex-grow" placeholder="Type a message...">
                        <button type="submit" class="btn btn-primary"><i data-lucide="send"></i></button>
                    </form>
                </div>
            </div>
        </div>
    </div>
`},

 BidCard: (bid, task) => {
        const isOwner = task.poster_id === state.user?.id;
        const isAccepted = task.accepted_bid_id === bid.id;
        return `
        <div class="p-4 rounded-lg flex justify-between items-center transition-all ${isAccepted ? 'bg-blue-100 border-blue-300' : 'bg-slate-50 border-slate-200'} border" id="bid-${bid.id}">
            <div>
                <p class="font-semibold text-slate-800">${bid.users.email}</p>
                <p class="text-sm text-slate-500">ETA: ${bid.time_estimate}</p>
            </div>
            <div class="text-right">
                <p class="text-xl font-bold text-slate-800">₹${bid.amount}</p>
                ${(isOwner && task.status === 'open') ? `<button class="btn btn-secondary text-xs py-1 px-2 mt-1" data-bid-id="${bid.id}" onclick="app.handleAcceptBid(${task.id}, ${bid.id})">Accept</button>` : ''}
                ${isAccepted ? `<span class="text-xs font-bold text-blue-800 block mt-1">ACCEPTED</span>` : ''}
            </div>
        </div>
    `},
    BidForm: () => `
        <form id="bid-form" class="mt-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h4 class="font-semibold mb-3">Place Your Bid</h4>
            <div class="grid sm:grid-cols-2 gap-3">
                <input type="number" id="bid-amount" name="amount" placeholder="Price (₹)" required class="form-input">
                <input type="text" id="bid-eta" name="timeEstimate" placeholder="ETA (e.g., 2 days)" required class="form-input">
            </div>
            <button type="submit" class="btn btn-primary w-full mt-3">Submit Bid</button>
        </form>
    `,
    PostTaskModal: () => `
        <div class="p-8">
            <div class="flex justify-between items-center mb-6">
                <h2 class="font-heading text-3xl font-bold">Post a New Task</h2>
                <button onclick="ui.closeModal()" class="p-2 rounded-full hover:bg-slate-100"><i data-lucide="x"></i></button>
            </div>
            <form id="post-task-form">
                <div class="mb-4">
                    <label for="task-title" class="block text-sm font-medium text-slate-600 mb-2">Title</label>
                    <input type="text" id="task-title" name="title" required class="form-input" placeholder="e.g., Deliver a fragile vase">
                </div>
                 <div class="mb-4">
                    <div class="flex justify-between items-center mb-2">
                        <label for="task-description" class="block text-sm font-medium text-slate-600">Description</label>
                        <button type="button" id="suggest-details-btn" class="btn btn-secondary text-xs py-1 px-2">
                            <i data-lucide="sparkles" class="h-4 w-4"></i> Suggest Details
                        </button>
                    </div>
                    <textarea id="task-description" name="description" required rows="4" class="form-input" placeholder="Provide details or click 'Suggest Details' for a template."></textarea>
                </div>
                <div class="grid sm:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label for="task-from" class="block text-sm font-medium text-slate-600 mb-2">From (City)</label>
                        <input type="text" id="task-from" name="from_location" required class="form-input" placeholder="e.g., Yeola">
                    </div>
                     <div>
                        <label for="task-to" class="block text-sm font-medium text-slate-600 mb-2">To (City)</label>
                        <input type="text" id="task-to" name="to_location" required class="form-input" placeholder="e.g., Nashik">
                    </div>
                </div>
                 <div class="mb-4">
                    <label for="task-budget" class="block text-sm font-medium text-slate-600 mb-2">Budget (₹)</label>
                    <input type="number" id="task-budget" name="budget" required class="form-input" placeholder="e.g., 2000">
                </div>
                <div class="flex items-center mb-6">
                    <input id="task-urgent" name="is_urgent" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-[#8AA624] focus:ring-[#8AA624]">
                    <label for="task-urgent" class="ml-2 block text-sm text-slate-900">
                        Urgent? <span class="text-slate-500">(Task will expire in 24 hours and be highlighted)</span>
                    </label>
                </div>
                <button type="submit" class="btn btn-primary w-full">Post Task</button>
            </form>
        </div>
    `,

    EmptyState: (icon, title, text) => `
        <div class="col-span-full text-center py-16 bg-white/80 rounded-lg">
            <i data-lucide="${icon}" class="mx-auto h-12 w-12 text-slate-400"></i>
            <h3 class="mt-2 text-lg font-medium">${title}</h3>
            <p class="mt-1 text-sm text-slate-500">${text}</p>
        </div>
    `,
    openModal(html) {
        modalContent.innerHTML = html;
        lucide.createIcons();
        modalContainer.classList.remove('hidden');
        modalContainer.classList.add('flex');
        setTimeout(() => {
            modalContent.classList.remove('scale-95', 'opacity-0');
        }, 10);
    },
    closeModal() {
        modalContent.classList.add('scale-95', 'opacity-0');
        setTimeout(() => {
            modalContainer.classList.add('hidden');
            modalContainer.classList.remove('flex');
            modalContent.innerHTML = '';
        }, 300);
    },
};

// --- ROUTER ---
const router = {
    cleanup() {
        if (state.taskSubscription) supabase.removeChannel(state.taskSubscription);
        if (state.bidSubscription) supabase.removeChannel(state.bidSubscription);
        if (state.chatSubscription) supabase.removeChannel(state.chatSubscription);
    },
    async handleLocation() {
        this.cleanup();
        const path = window.location.hash || '';
        
        const isAuthRoute = path === '#login' || path === '#register';
        const isProtectedRoute = path === '#dashboard' || path.startsWith('#task-');
        if (!state.user && isProtectedRoute) return window.location.hash = '#login';
        if (state.user && (isAuthRoute || path === '')) return window.location.hash = '#dashboard';

        if (path.startsWith('#task-')) {
            const taskId = parseInt(path.substring(6));
            await app.loadTaskDetail(taskId);
        } else {
            switch (path) {
                case '': ui.render(ui.WelcomeView()); break;
                case '#login': ui.render(ui.LoginView()); break;
                case '#register': ui.render(ui.RegisterView()); break;
                case '#dashboard': await app.loadDashboard(); break;
                default: ui.render(ui.WelcomeView());
            }
        }
    }
};

// --- MAIN APP CONTROLLER ---
const app = {
    init() {
        authController.init();
        this.addEventListeners();
    },
    addEventListeners() {
        document.body.addEventListener('click', e => {
            const navLink = e.target.closest('.nav-link');
            if (navLink) {
                e.preventDefault();
                const newHash = new URL(navLink.href).hash;
                if (window.location.hash !== newHash) window.location.hash = newHash;
            }
            if (e.target.closest('#logout-btn') || e.target.closest('#mobile-logout-btn')) authController.handleLogout();
            if (e.target.closest('#post-task-btn') || e.target.closest('#mobile-post-task-btn')) ui.openModal(ui.PostTaskModal());
            if (e.target.closest('#mobile-menu-btn')) mobileMenu.classList.toggle('hidden');
            if (e.target.closest('#suggest-details-btn')) {
                this.handleAiSuggest(e.target.closest('#suggest-details-btn'));
            }
            if (e.target.closest('#delete-task-btn')) {
                app.handleDeleteTask();
            }
            // Toggle notification list
            const bell = e.target.closest('#notification-bell');
            const notificationList = document.getElementById('notification-list');
            if (bell) {
                notificationList.classList.toggle('hidden');
            } else if (!e.target.closest('#notification-list')) {
                notificationList.classList.add('hidden');
            }
        });
        document.body.addEventListener('submit', e => {
            e.preventDefault();
            const form = e.target;
            if (form.id === 'login-form') authController.handleLogin(form.email.value, form.password.value);
            else if (form.id === 'register-form') authController.handleRegister(form.email.value, form.password.value);
            else if (form.id === 'post-task-form') this.handlePostTask(form);
            else if (form.id === 'bid-form') this.handlePostBid(form);
            else if (form.id === 'chat-form') this.handleSendMessage(form);
        });
        window.addEventListener('hashchange', () => router.handleLocation());
    },

    async loadDashboard() {
        try {
            const tasks = await api.publicRequest('/tasks');
            ui.render(ui.DashboardView(tasks));
            lucide.createIcons();
            app.subscribeToAllTasks();
            app.subscribeToNotifications(); // Listen for new notifications
        } catch (error) {
            showNotification(error.message, true);
        }
    },

    async loadTaskDetail(taskId) {
        try {
            const { task, bids } = await api.publicRequest(`/tasks/${taskId}`);
            state.currentTask = task;
            ui.render(ui.TaskDetailView(task, bids));
            lucide.createIcons();

            if (task.status === 'assigned') {
                app.initChat(taskId);
            }

            app.subscribeToBids(taskId);
            app.subscribeToNotifications(); // Also listen on this page
        } catch (error) {
            showNotification(error.message, true);
        }
    },
async handleDeleteTask() {
    if (!state.currentTask) return;

    if (confirm(`Are you sure you want to permanently delete the task: "${state.currentTask.title}"?`)) {
        try {
            await api.deleteTask(state.currentTask.id);
            showNotification('Task deleted successfully.');
            window.location.hash = '#dashboard'; // Redirect to the dashboard
        } catch (error) {
            showNotification(error.message, true);
        }
    }
},

    async handlePostTask(form) {
        const taskData = {
            title: form.querySelector('#task-title').value,
            description: form.querySelector('#task-description').value,
            from_location: form.querySelector('#task-from').value,
            to_location: form.querySelector('#task-to').value,
            budget: form.querySelector('#task-budget').value,
            is_urgent: form.querySelector('#task-urgent').checked
        };

        try {
            await api.request('/tasks', { method: 'POST', body: JSON.stringify(taskData) });
            showNotification('Task posted successfully!');
            ui.closeModal();
            window.location.hash = '#dashboard';
            app.loadDashboard();
        } catch (error) {
            showNotification(error.message, true);
        }
    },

    async handlePostBid(form) {
        if (!state.currentTask) return;
        const formData = new FormData(form);
        const bidData = Object.fromEntries(formData.entries());
        try {
            await api.request(`/tasks/${state.currentTask.id}/bids`, { method: 'POST', body: JSON.stringify(bidData) });
            showNotification('Bid placed successfully!');
            form.reset();
        } catch (error) {
            showNotification(error.message, true);
        }
    },

    async handleAcceptBid(taskId, bidId) {
        if (!confirm('Are you sure you want to accept this bid?')) return;
        try {
            await api.request(`/tasks/${taskId}/accept_bid`, { method: 'POST', body: JSON.stringify({ bid_id: bidId }) });
            showNotification('Bid accepted!');
            app.loadTaskDetail(taskId);
        } catch(error) {
            showNotification(error.message, true);
        }
    },

    // --- REAL-TIME SUBSCRIPTIONS ---
    subscribeToAllTasks() {
        state.taskSubscription = supabase.channel('public:tasks')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
                if (window.location.hash === '#dashboard') {
                    app.loadDashboard();
                }
            }).subscribe();
    },

    subscribeToBids(taskId) {
        state.bidSubscription = supabase.channel(`bids:${taskId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `task_id=eq.${taskId}` }, payload => {
                if (window.location.hash === `#task-${taskId}`) {
                    app.loadTaskDetail(taskId);
                }
            }).subscribe();
    },

    subscribeToNotifications() {
        const notificationCount = document.getElementById('notification-count');
        const notificationList = document.getElementById('notification-list');

        supabase.from('notifications').select('*').eq('is_read', false).then(({ data, error }) => {
            if (data && data.length > 0) {
                notificationCount.textContent = data.length;
                notificationCount.classList.remove('hidden');
                notificationList.innerHTML = data.map(n => `<a href="${n.link}" class="block p-2 text-sm text-slate-700 hover:bg-slate-100 rounded-md">${n.message}</a>`).join('');
            } else {
                notificationList.innerHTML = `<p class="p-2 text-sm text-slate-500">No new notifications.</p>`;
            }
        });

        supabase.channel('public:notifications')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${state.user.id}` }, payload => {
                showNotification("You have a new notification!");
                this.subscribeToNotifications();
            }).subscribe();
    },

    async initChat(taskId) {
        const chatBox = document.getElementById('chat-messages');

        const { data: messages, error } = await supabase.from('messages').select(`*, users(email)`).eq('task_id', taskId).order('created_at');
        if (error) return showNotification(error.message, true);

        chatBox.innerHTML = messages.map(app.renderMessage).join('');
        chatBox.scrollTop = chatBox.scrollHeight;

        state.chatSubscription = supabase.channel(`chat:${taskId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `task_id=eq.${taskId}` }, async (payload) => {
                const { data: newMessage, error } = await supabase.from('messages').select(`*, users(email)`).eq('id', payload.new.id).single();
                if (error) return;

                if (!document.getElementById(`msg-${newMessage.id}`)) {
                    chatBox.insertAdjacentHTML('beforeend', app.renderMessage(newMessage));
                    chatBox.scrollTop = chatBox.scrollHeight;
                }
            })
            .subscribe();
    },

    async handleSendMessage(form) {
        const input = form.querySelector('input');
        const text = input.value.trim();
        if (text && state.currentTask) {
            const originalText = text;
            input.value = '';

            const { error } = await supabase.from('messages').insert({
                text: text,
                task_id: state.currentTask.id,
                sender_id: state.user.id
            });

            if (error) {
                showNotification(error.message, true);
                input.value = originalText;
            }
        }
    },

    renderMessage(msg) {
        const isSent = msg.sender_id === state.user.id;
        const senderEmail = msg.users ? msg.users.email : 'Unknown User';
        return `
            <div class="chat-bubble ${isSent ? 'sent' : 'received'}" id="msg-${msg.id}">
                ${!isSent ? `<div class="text-xs font-bold mb-1">${senderEmail}</div>` : ''}
                <p>${msg.text}</p>
                <div class="chat-timestamp">${new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            </div>
        `;
    },

    async handleAiSuggest(button) {
        const titleInput = document.getElementById('task-title');
        const descriptionInput = document.getElementById('task-description');
        const title = titleInput.value;

        if (!title) {
            return showNotification('Please enter a task title first.', true);
        }

        button.disabled = true;
        button.innerHTML = `<i data-lucide="loader" class="animate-spin h-4 w-4"></i> Thinking...`;
        lucide.createIcons();

        try {
            const { suggestion } = await api.suggestDescription(title);
            descriptionInput.value = suggestion;
            descriptionInput.style.height = 'auto';
            descriptionInput.style.height = descriptionInput.scrollHeight + 'px';
        } catch (error) {
            showNotification(error.message, true);
        } finally {
            button.disabled = false;
            button.innerHTML = `<i data-lucide="sparkles" class="h-4 w-4"></i> Suggest Details`;
            lucide.createIcons();
        }
    },
};

// --- UTILS ---
function showNotification(message, isError = false) {
    const el = document.getElementById('notification');
    const msgEl = document.getElementById('notification-message');
    const iconEl = document.getElementById('notification-icon');
    
    msgEl.textContent = message;
    el.className = `fixed bottom-5 right-5 text-white py-3 px-6 rounded-xl shadow-2xl translate-x-[120%] transform transition-transform duration-500 ease-in-out z-50 flex items-center gap-3 ${isError ? 'bg-red-600' : 'bg-[#8AA624]'}`;
    iconEl.setAttribute('data-lucide', isError ? 'alert-triangle' : 'check-circle');
    lucide.createIcons();
    
    el.classList.remove('translate-x-[120%]');
    setTimeout(() => {
        el.classList.add('translatex-[120%]');
    }, 3500);
}

// --- START THE APP ---
window.app = { handleAcceptBid: app.handleAcceptBid };
window.ui = { closeModal: ui.closeModal };
app.init();