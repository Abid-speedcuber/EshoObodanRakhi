// --- SUPABASE CONFIG (Your settings are here) ---
const SUPABASE_URL = "https://kszhmrhlsoqfxkcopvoe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzemhtcmhsc29xZnhrY29wdm9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5NjU5MTcsImV4cCI6MjA3NTU0MTkxN30.8TLXLfVbPiwtzpa_4wEYzC9Lfqm58Z7ICIaUQsa0izA";

const { createClient } = supabase;

// Check if running in Capacitor (mobile app)
if (typeof window.Capacitor === 'undefined') {
    window.Capacitor = {
        Plugins: {},
        isNativePlatform: () => false
    };
}
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- APPLICATION LOGIC ---
const App = {
    // --- STATE ---
    state: {
        currentUser: null,
        userProfile: null, // { id, name, role }
        isAdmin: false,
        currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start at current month
        allDonors: [],
        totalFund: 0,
        activeSection: 'blood',
        activeFundTab: 'sadakah', // Default for non-admin
        currentYear: new Date().getFullYear(),
        isLoading: {
            fund: false,
            donors: false,
            notices: false,
            notes: false,
        },
        allFundData: [], // Store all fund data for offline access
        cachedMonthlyData: {}, // Store monthly aggregated data
        notes: [], // All notes in memory
        currentNote: null, // Currently viewing/editing note
        notesNeedSync: false, // Track if local notes differ from server
        notesDeletedIds: [], // IDs of notes that user has deleted (prevent re-sync)
        notesRecycleBin2: [], // Recycle bin tier 1 (visible) - deleted notes
        notesRecycleBin: [], // Recycle bin tier 2 (permanent blocker) - just IDs
        notesEditMode: false, // Edit mode state for multi-select
    },

    shouldFetchFreshData: true, // Flag to control when to fetch from server

    pendingRoleChange: null, // Store pending role change data for confirmation flow

    // --- DOM ELEMENTS ---
    elements: {
        notification: document.getElementById('notification'),
        authBtn: document.getElementById('authBtn'),
        adminMenuBtn: document.getElementById('adminMenuBtn'),
        totalFundDisplay: document.getElementById('totalFundDisplay'),
        fundTabs: document.getElementById('fundTabs'),
        collectionView: document.getElementById('collectionView'),
        sadakahListView: document.getElementById('sadakahListView'),
        allSadakahList: document.getElementById('allSadakahList'),
        mainContent: document.getElementById('mainContent'),
        currentMonthDisplay: document.getElementById('currentMonthDisplay'),
        incomeList: document.getElementById('incomeList'),
        expenseList: document.getElementById('expenseList'),
        totalIncome: document.getElementById('totalIncome'),
        totalExpense: document.getElementById('totalExpense'),
        monthlyBalance: document.getElementById('monthlyBalance'),
        donorsList: document.getElementById('donorsList'),
        noticesList: document.getElementById('noticesList'),
        notesList: document.getElementById('notesList'),
        adminControls: document.getElementById('adminControls'),
        myDonorBtn: document.getElementById('myDonorBtn'),
        postNoticeBtn: document.getElementById('postNoticeBtn'),
        deleteDonorBtn: document.getElementById('deleteDonorBtn'),
        yearlyChart: document.getElementById('yearlyChart'),
        currentYearDisplay: document.getElementById('currentYearDisplay'),
    },

    // --- INITIALIZATION ---
    async checkOnlineStatus() {
        try {
            // Try to ping Supabase
            const { error } = await db.from('users').select('id').limit(1);
            return !error;
        } catch (err) {
            return false;
        }
    },

    init() {
        this.registerServiceWorker();
        this.bindEvents();
        this.setupScrollBehavior();

        // Don't load notes yet - wait until after auth is handled

        // Check if we have internet connection
        this.checkOnlineStatus().then(isOnline => {
            if (isOnline) {
                // Online: Fetch everything fresh
                this.initializeWithFreshData();
            } else {
                // Offline: Load from cache and restore last state
                this.initializeFromCache();
            }
        });

        // --- Setup Deep Link Listener for Mobile App ---
        if (typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform?.()) {
            const { App, Browser } = window.Capacitor.Plugins;

            App.addListener('appUrlOpen', async (data) => {
                console.log('App opened with URL:', data.url);

                // Close the browser if it's still open
                try {
                    await Browser.close();
                } catch (e) {
                    // Browser might already be closed
                }

                // Extract hash from URL (format: com.eor.app://oauth#access_token=...)
                const url = data.url;
                const hashIndex = url.indexOf('#');

                if (hashIndex !== -1) {
                    const hash = url.substring(hashIndex);

                    // Handle OAuth callback
                    if (hash.includes('access_token')) {
                        try {
                            // Parse the hash manually
                            const params = new URLSearchParams(hash.substring(1));
                            const accessToken = params.get('access_token');
                            const refreshToken = params.get('refresh_token');

                            if (accessToken) {
                                // Set the session manually
                                const { data: sessionData, error } = await db.auth.setSession({
                                    access_token: accessToken,
                                    refresh_token: refreshToken
                                });

                                if (error) throw error;

                                await this.handleAuthStateChange();
                                this.hideAllModals();
                                this.showNotification('Login successful!');
                            }
                        } catch (err) {
                            console.error('OAuth error:', err);
                            this.showNotification('Login failed: ' + err.message, true);
                        }
                    }
                    // Handle password reset
                    else if (hash.includes('type=recovery')) {
                        try {
                            const params = new URLSearchParams(hash.substring(1));
                            const accessToken = params.get('access_token');
                            const refreshToken = params.get('refresh_token');

                            if (accessToken) {
                                await db.auth.setSession({
                                    access_token: accessToken,
                                    refresh_token: refreshToken
                                });

                                this.showNotification('Please set your new password');
                                this.showModal('settingsModal');
                            }
                        } catch (err) {
                            console.error('Password reset error:', err);
                            this.showNotification('Password reset link invalid', true);
                        }
                    }
                }
            });
        }

        // --- Finish OAuth redirect when user returns from Google (Web) ---
        // This will parse URL fragments returned by Supabase after OAuth and store the session.
        // We ignore errors because if there's no oauth data in URL, that's fine.
        (async () => {
            try {
                await db.auth.getSessionFromUrl({ storeSession: true });
            } catch (err) {
                // ignore: no session in URL or parsing failed
            }
            await this.handleAuthStateChange(); // Initial check after attempting to finish OAuth
        })();

        this.setupLanguageToggle();
        this.setupMobileBackHandler();

        // Show blood section by default (will be overridden for admins in handleAuthStateChange)
        this.showSection('blood');
    },

    // --- AUTHENTICATION ---
    async initializeWithFreshData() {
        // Mark that we should fetch fresh data
        this.shouldFetchFreshData = true;

        try {
            // First, handle auth state - this will populate state.currentUser, state.userProfile, state.isAdmin
            await this.handleAuthStateChange();

            // Fetch all data in parallel (excluding notes - they are local-first)
            const promises = [
                this.fetchAllFundData(),
                this.fetchAllDonors(),
                this.fetchAllNotices()
            ];

            await Promise.all(promises);

            // Now do all calculations and cache them
            await this.processAndCacheAllCalculations();

            // Update UI FIRST to ensure admin controls are visible
            this.updateUI();
            
            // Load the appropriate section based on auth state
            if (this.state.isAdmin) {
                // Force admin view for fund section
                if (this.elements.fundTabs) {
                    this.elements.fundTabs.classList.add('hide');
                }
                if (this.elements.collectionView) {
                    this.elements.collectionView.classList.remove('hide');
                }
                if (this.elements.sadakahListView) {
                    this.elements.sadakahListView.classList.add('hide');
                }
                
                // Show section
                this.showSection('fund');
            } else {
                this.showSection('blood');
            }

            // Load data for active section
            this.loadDataForActiveSection();
            
            // Calculate and display total fund
            await this.calculateTotalFund();

        } catch (err) {
            console.error('Error initializing with fresh data:', err);
            this.showNotification('Failed to load data. Using cached data.', true);
            // Fall back to cached data
            this.initializeFromCache();
        }

        // After initial fetch, disable automatic fetching
        this.shouldFetchFreshData = false;
    },

    initializeFromCache() {
        // Load cached auth state
        const cachedAuthState = localStorage.getItem('authState');
        if (cachedAuthState) {
            const authState = JSON.parse(cachedAuthState);
            this.state.userProfile = authState.userProfile;
            this.state.isAdmin = authState.isAdmin;
            this.state.currentUser = { id: authState.userProfile?.id };
        } else {
            // No cached state - show login button by default
            this.state.userProfile = null;
            this.state.isAdmin = false;
            this.state.currentUser = null;
            document.getElementById('loginTopBtn').classList.remove('hide');
        }

        // Load cached total fund
        const cachedTotal = localStorage.getItem('totalFund');
        if (cachedTotal) {
            this.state.totalFund = parseFloat(cachedTotal);
            this.elements.totalFundDisplay.textContent = `৳ ${parseFloat(cachedTotal).toLocaleString()}`;
        }

        // Load cached fund data
        const cachedAllData = localStorage.getItem('allFundData');
        if (cachedAllData) {
            this.state.allFundData = JSON.parse(cachedAllData);
        }

        const cachedMonthly = localStorage.getItem('cachedMonthlyData');
        if (cachedMonthly) {
            this.state.cachedMonthlyData = JSON.parse(cachedMonthly);
        }

        // Load cached donors
        const cachedDonors = localStorage.getItem('allDonorsData');
        if (cachedDonors) {
            this.state.allDonors = JSON.parse(cachedDonors);
        }

        // Load cached section state
        const cachedSection = localStorage.getItem('activeSection');
        if (cachedSection) {
            this.state.activeSection = cachedSection;
        }

        // Update UI based on cached state
        this.updateUI();

        // Configure fund section for admin if needed
        if (this.state.isAdmin) {
            if (this.elements.fundTabs) {
                this.elements.fundTabs.classList.add('hide');
            }
            if (this.elements.collectionView) {
                this.elements.collectionView.classList.remove('hide');
            }
            if (this.elements.sadakahListView) {
                this.elements.sadakahListView.classList.add('hide');
            }
        }
        
        // Show the last active section
        if (this.state.activeSection && this.state.currentUser) {
            this.showSection(this.state.activeSection);
        } else if (this.state.isAdmin) {
            this.showSection('fund');
        } else {
            this.showSection('blood');
        }

        // Load data for active section from cache
        this.loadDataForActiveSection();

        // Show offline indicator
        this.showNotification('Offline mode - showing cached data');
    },

    async initializeAllData() {
        // This is now only used for refresh
        this.shouldFetchFreshData = true;

        const promises = [
            this.fetchAllFundData(),
            this.fetchAllDonors(),
            this.fetchAllNotices()
        ];

        try {
            await Promise.all(promises);
            await this.processAndCacheAllCalculations();
        } catch (err) {
            console.error('Error initializing data:', err);
        }

        this.shouldFetchFreshData = false;
    },

    async processAndCacheAllCalculations() {

        try {
            // 1. Process yearly overview data for all years
            const allData = this.state.allFundData;
            if (allData.length > 0) {
                const years = [...new Set(allData.filter(d => d.month).map(d => parseInt(d.month.split('-')[0])))];
                const yearlyOverviewCache = {};

                years.forEach(year => {
                    const yearData = allData.filter(d => parseInt(d.month.split('-')[0]) === year);
                    const monthlyIncome = new Array(12).fill(0);
                    const monthlyExpense = new Array(12).fill(0);

                    yearData.forEach(entry => {
                        const monthIndex = parseInt(entry.month.split('-')[1]) - 1;
                        if (entry.type === 'income') {
                            monthlyIncome[monthIndex] += entry.amount;
                        } else if (entry.type === 'expense' && !entry.is_calculation) {
                            monthlyExpense[monthIndex] += entry.amount;
                        }
                    });

                    // Calculate cumulative balance for each month
                    const previousYearsData = allData.filter(d => parseInt(d.month.split('-')[0]) < year);
                    let cumulativeBalance = previousYearsData.reduce((acc, entry) => {
                        if (entry.type === 'income') return acc + entry.amount;
                        // Only subtract expenses where is_calculation is true (NULL/false in DB)
                        if (entry.type === 'expense' && !entry.is_calculation) return acc - entry.amount;
                        return acc;
                    }, 0);

                    const monthlyBalance = monthlyIncome.map((income, i) => {
                        cumulativeBalance += income - monthlyExpense[i];
                        return cumulativeBalance;
                    });

                    yearlyOverviewCache[year] = {
                        monthlyIncome,
                        monthlyExpense,
                        monthlyBalance
                    };
                });

                localStorage.setItem('yearlyOverviewCache', JSON.stringify(yearlyOverviewCache));
            }

            // 2. Process and cache all sadakah history (only isDisplay=true)
            const allExpenses = allData.filter(d => d.type === 'expense' && !d.is_display)
                .sort((a, b) => {
                    if (b.month !== a.month) return b.month.localeCompare(a.month);
                    return new Date(b.timestamp) - new Date(a.timestamp);
                });
            localStorage.setItem('allSadakahCache', JSON.stringify(allExpenses));

            // 3. Process complete history for modal
            const completeHistoryData = this.calculateCompleteHistory(allData);
            localStorage.setItem('completeHistoryCache', JSON.stringify(completeHistoryData));
            // 4. Cache total fund calculation (only isCalculation=true expenses)
            const totalFund = allData.reduce((acc, entry) => {
                if (entry.type === 'income') return acc + entry.amount;
                // Only subtract expenses where is_calculation is true (NULL/false in DB)
                if (entry.type === 'expense' && !entry.is_calculation) return acc - entry.amount;
                return acc;
            }, 0);
            localStorage.setItem('totalFundCache', totalFund.toString());
            // 5. Cache collection tab totals
            const allIncome = allData.filter(d => d.type === 'income');
            const totalIncome = allIncome.reduce((sum, item) => sum + item.amount, 0);
            const now = new Date();
            const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const monthIncome = allIncome.filter(d => d.month === currentMonthKey).reduce((sum, item) => sum + item.amount, 0);

            localStorage.setItem('collectionTabCache', JSON.stringify({
                total: totalIncome,
                currentMonth: monthIncome
            }));
        } catch (err) {
            console.error('Error processing calculations:', err);
        }
    },

    calculateCompleteHistory(data) {
        const monthlyData = {};
        data.forEach(entry => {
            if (!monthlyData[entry.month]) {
                monthlyData[entry.month] = { income: 0, expenses: [] };
            }
            if (entry.type === 'income') {
                monthlyData[entry.month].income += entry.amount;
            } else if (entry.type === 'expense' && !entry.is_calculation) {
                // Only include expenses where is_calculation is true (NULL/false in DB)
                monthlyData[entry.month].expenses.push(entry);
            }
        });
        return monthlyData;
    },

    async fetchAllFundData() {
        try {
            const { data, error } = await db.from('fund').select('*').order('month', { ascending: true }).order('timestamp', { ascending: true });
            if (!error && data) {
                localStorage.setItem('allFundData', JSON.stringify(data));
                this.state.allFundData = data;

                // Cache monthly aggregated data
                const monthlyCache = {};
                data.forEach(entry => {
                    if (!monthlyCache[entry.month]) {
                        monthlyCache[entry.month] = [];
                    }
                    monthlyCache[entry.month].push(entry);
                });
                localStorage.setItem('cachedMonthlyData', JSON.stringify(monthlyCache));
                this.state.cachedMonthlyData = monthlyCache;
            }
        } catch (err) {
            console.error('Error fetching fund data:', err);
        }
    },

    async fetchAllDonors() {
        await window.BloodModule.fetchAllDonors();
    },

    async fetchAllNotices() {
        await window.NoticesModule.fetchAllNotices();
    },

    async handleAuthStateChange() {
        await window.AuthModule.handleAuthStateChange();
    },

    async signup(name, emailOrPhone, password) {
        await window.AuthModule.signup(name, emailOrPhone, password);
    },

    async login(emailOrPhone, password) {
        await window.AuthModule.login(emailOrPhone, password);
    },

    async signInWithGoogle() {
        await window.AuthModule.signInWithGoogle();
    },

    async logout() {
        await window.AuthModule.logout();
    },

    // --- DATA FETCHING & RENDERING ---
    loadDataForActiveSection() {
        switch (this.state.activeSection) {
            case 'fund':
                this.loadFundData();
                break;
            case 'blood': this.loadDonors(); break;
            case 'notices': this.loadNotices(); break;
            case 'notes': this.loadNotes(); break;
            case 'notifications': this.loadNotifications(); break;
            case 'userMessages':
                window.MessagesModule.loadUserMessages();
                window.MessagesModule.updateUserMessageBadge();
                break;
            case 'adminMessages':
                window.MessagesModule.loadAdminMessages('unread');
                break;
        }
    },

    async updateCollectionTabTotal() {
        await window.FundModule.updateCollectionTabTotal();
    },

    updateCollectionTabTotalOffline() {
        window.FundModule.updateCollectionTabTotalOffline();
    },

    async calculateTotalFund() {
        await window.FundModule.calculateTotalFund();
    },

    async loadAllSadakah() {
        await window.FundModule.loadAllSadakah();
    },

    renderAllSadakahList(sadakahList) {
        window.FundModule.renderAllSadakahList(sadakahList);
    },

    async loadFundData() {
        await window.FundModule.loadFundData();
    },

    renderFundData(data) {
        window.FundModule.renderFundData(data);
    },

    renderFundList(items, element, color) {
        window.FundModule.renderFundList(items, element, color);
    },

    updateFundTotals(income, expense) {
        window.FundModule.updateFundTotals(income, expense);
    },

    async calculateNetWorth() {
        await window.FundModule.calculateNetWorth();
    },

    async loadYearlyChartData() {
        await window.FundModule.loadYearlyChartData();
    },

    renderYearlyChart(income, expense, balance) {
        window.FundModule.renderYearlyChart(income, expense, balance);
    },

    changeYear(delta) {
        window.FundModule.changeYear(delta);
    },

    async updateFundEntry(id, details) {
        await window.FundModule.updateFundEntry(id, details);
    },

    async editFundEntry(id, type) {
        await window.FundModule.editFundEntry(id, type);
    },

    async addFundEntry(type, details) {
        await window.FundModule.addFundEntry(type, details);
    },

    async deleteFundEntry(id) {
        await window.FundModule.deleteFundEntry(id);
    },

    changeMonth(delta) {
        window.FundModule.changeMonth(delta);
    },

    updateFundTabView() {
        window.FundModule.updateFundTabView();
    },

    async copyIncomeList() {
        await window.FundModule.copyIncomeList();
    },

    calculateCompleteHistory(data) {
        return window.FundModule.calculateCompleteHistory(data);
    },

    async showCompleteHistory() {
        await window.FundModule.showCompleteHistory();
    },

    async copyCompleteHistory() {
        await window.FundModule.copyCompleteHistory();
    },

    async loadDonors() {
        await window.BloodModule.loadDonors();
    },

    async loadUsers() {
        const usersList = document.getElementById('usersList');
        usersList.innerHTML = '<div class="loader"></div>';

        // Setup search functionality
        const userSearch = document.getElementById('userSearch');
        const userClearBtn = document.getElementById('userClearBtn');

        userSearch.value = '';
        userClearBtn.classList.add('hide');

        userSearch.addEventListener('input', () => {
            const searchTerm = userSearch.value.trim().toLowerCase();
            userClearBtn.classList.toggle('hide', !searchTerm);
            this.filterUsers(searchTerm);
        });

        userClearBtn.addEventListener('click', () => {
            userSearch.value = '';
            userClearBtn.classList.add('hide');
            this.filterUsers('');
        });

        try {
            // Fetch users from users table
            const { data: usersData, error: usersError } = await db.from('users').select('*').order('name');
            if (usersError) {
                console.error('Error fetching users:', usersError);
                throw usersError;
            }

            // Try to fetch auth users for emails (this requires service role key, might fail)
            let emailMap = {};
            try {
                const { data: authData } = await db.auth.admin.listUsers();
                if (authData && authData.users) {
                    authData.users.forEach(authUser => {
                        emailMap[authUser.id] = authUser.email || authUser.phone || 'N/A';
                    });
                }
            } catch (authError) {
                console.warn('Could not fetch auth users (requires service role):', authError);
                // If we can't get emails, that's okay - we'll show "N/A"
            }

            if (!usersData || usersData.length === 0) {
                usersList.innerHTML = '<div class="text-gray-400 text-center py-4">No users found</div>';
                return;
            }

            // Store users data for filtering
            this.allUsersData = usersData;
            this.allUsersEmailMap = emailMap;

            // Render the users list
            this.renderUsersList(usersData, emailMap);

        } catch (err) {
            console.error('Error loading users:', err);
            usersList.innerHTML = '<div class="text-red-500 text-center py-4">Failed to load users. Make sure you have admin privileges.</div>';
        }
    },

    renderUsersList(usersData, emailMap) {
        const usersList = document.getElementById('usersList');

        if (!usersData || usersData.length === 0) {
            usersList.innerHTML = '<div class="text-gray-400 text-center py-4">No users found</div>';
            return;
        }

        usersList.innerHTML = usersData.map(user => {
            const isCurrentUser = user.id === this.state.currentUser?.id;
            const email = user.email || emailMap[user.id] || 'Email not available';
            const roleColor = {
                admin: 'bg-red-100 text-red-700',
                moderator: 'bg-purple-100 text-purple-700',
                student: 'bg-blue-100 text-blue-700',
                user: 'bg-gray-100 text-gray-700'
            }[user.role] || 'bg-gray-100 text-gray-700';

            return `
            <div class="bg-white border border-gray-200 rounded-lg p-3">
              <div class="flex items-start justify-between mb-2">
                <div class="flex-1">
                  <div class="font-semibold text-gray-800">${user.name}${isCurrentUser ? ' <span class="text-xs text-blue-600">(You)</span>' : ''}</div>
                  <div class="text-xs text-gray-500">${email}</div>
                  <div class="text-xs text-gray-400 mt-1">ID: ${user.id.substring(0, 12)}...</div>
                </div>
                <span class="text-xs px-2 py-1 rounded font-semibold ${roleColor}">${user.role.toUpperCase()}</span>
              </div>
              ${!isCurrentUser ? `
                <div class="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                  <select class="user-role-select flex-1 border border-gray-300 rounded px-2 py-1 text-sm" data-user-id="${user.id}" data-user-name="${user.name}" data-current-role="${user.role}">
                    <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="student" ${user.role === 'student' ? 'selected' : ''}>Student</option>
                    <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Moderator</option>
                    <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                  </select>
                  <button class="save-role-btn bg-green-600 text-white px-4 py-1 rounded text-sm hover:bg-green-700 transition" data-user-id="${user.id}">
                    Change
                  </button>
                </div>
              ` : '<div class="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">You cannot change your own role</div>'}
            </div>
          `;
        }).join('');

        // Bind save role buttons with confirmation modals
        document.querySelectorAll('.save-role-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.userId;
                const roleSelect = document.querySelector(`.user-role-select[data-user-id="${userId}"]`);
                const newRole = roleSelect.value;
                const currentRole = roleSelect.dataset.currentRole;
                const userName = roleSelect.dataset.userName;

                // Check if role actually changed
                if (newRole === currentRole) {
                    return this.showNotification('Role is already ' + newRole, true);
                }

                // Store data for confirmation flow
                this.pendingRoleChange = { userId, newRole, currentRole, userName };

                // Show first confirmation
                this.showRoleConfirmation();
            });
        });
    },

    filterUsers(searchTerm) {
        if (!this.allUsersData) return;

        if (!searchTerm) {
            this.renderUsersList(this.allUsersData, this.allUsersEmailMap);
            return;
        }

        const filtered = this.allUsersData.filter(user => {
            const name = (user.name || '').toLowerCase();
            const email = (this.allUsersEmailMap[user.id] || '').toLowerCase();
            const role = (user.role || '').toLowerCase();
            const id = (user.id || '').toLowerCase();

            return name.includes(searchTerm) ||
                email.includes(searchTerm) ||
                role.includes(searchTerm) ||
                id.includes(searchTerm);
        });

        this.renderUsersList(filtered, this.allUsersEmailMap);
    },

    showRoleConfirmation() {
        this.showModal('roleConfirmModal');

        const yesBtn = document.getElementById('roleConfirmYes');
        const noBtn = document.getElementById('roleConfirmNo');

        // Remove old listeners
        const newYesBtn = yesBtn.cloneNode(true);
        const newNoBtn = noBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
        noBtn.parentNode.replaceChild(newNoBtn, noBtn);

        newYesBtn.addEventListener('click', () => {
            this.hideAllModals();
            this.showRoleConsequences();
        });

        newNoBtn.addEventListener('click', () => {
            this.hideAllModals();
            this.pendingRoleChange = null;
        });
    },

    showRoleConsequences() {
        const { newRole, currentRole, userName } = this.pendingRoleChange;
        const consequencesText = document.getElementById('roleConsequencesText');

        let consequences = '';

        if (newRole === 'admin') {
            consequences = `
            <p class="font-semibold text-red-600">If you set the role of ${userName} to Admin:</p>
            <ul class="list-disc ml-5 mt-2 space-y-1">
              <li>They can add, delete, and edit collection and sadakah entries</li>
              <li>They will have full control over all blood donor profiles</li>
              <li>They can change the role of any individual, including removing you from admin</li>
              <li>They will have access to the admin menu and all its features</li>
            </ul>
          `;
        } else if (currentRole === 'admin') {
            consequences = `
            <p class="font-semibold text-orange-600">If you remove ${userName} from Admin role:</p>
            <ul class="list-disc ml-5 mt-2 space-y-1">
              <li>They will no longer be able to add, delete, or edit fund entries</li>
              <li>They will lose control over blood donor profiles</li>
              <li>They cannot change user roles anymore</li>
              <li>They will lose access to the admin menu</li>
            </ul>
          `;
        } else if (newRole === 'moderator') {
            consequences = `
            <p class="font-semibold text-purple-600">If you set the role of ${userName} to Moderator:</p>
            <ul class="list-disc ml-5 mt-2 space-y-1">
              <li>Moderator permissions will be defined later</li>
              <li>They will have more privileges than regular users</li>
            </ul>
          `;
        } else if (newRole === 'student') {
            consequences = `
            <p class="font-semibold text-blue-600">If you set the role of ${userName} to Student:</p>
            <ul class="list-disc ml-5 mt-2 space-y-1">
              <li>Student permissions will be defined later</li>
              <li>They may have limited access to certain features</li>
            </ul>
          `;
        } else {
            consequences = `
            <p class="font-semibold text-gray-600">If you set the role of ${userName} to User:</p>
            <ul class="list-disc ml-5 mt-2 space-y-1">
              <li>They will have standard user permissions</li>
              <li>They can manage their own donor profile</li>
              <li>They can post activities</li>
            </ul>
          `;
        }

        consequencesText.innerHTML = consequences;
        this.showModal('roleConsequencesModal');

        const confirmBtn = document.getElementById('roleConsequencesConfirm');
        const cancelBtn = document.getElementById('roleConsequencesCancel');

        // Remove old listeners
        const newConfirmBtn = confirmBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        newConfirmBtn.addEventListener('click', async () => {
            await this.executeRoleChange();
        });

        newCancelBtn.addEventListener('click', () => {
            this.hideAllModals();
            this.pendingRoleChange = null;
        });
    },

    async executeRoleChange() {
        const { userId, newRole } = this.pendingRoleChange;

        const { error } = await db.from('users').update({ role: newRole }).eq('id', userId);

        if (error) {
            this.showNotification('Failed to update role: ' + error.message, true);
        } else {
            this.showNotification('User role updated successfully!');
            this.loadUsers(); // Reload the list
        }

        this.hideAllModals();
        this.pendingRoleChange = null;
    },


    // --- UI & RENDERING ---
    updateUI() {
        console.log('updateUI called - isAdmin:', this.state.isAdmin, 'currentUser:', !!this.state.currentUser, 'userProfile:', this.state.userProfile);
        
        // Auth controls are now inside Settings only
        document.getElementById('settingsBtn').classList.remove('hide');
        document.getElementById('loginTopBtn').classList.toggle('hide', this.state.currentUser);



        // Show User Menu button for regular users
        const isRegularUser = this.state.currentUser && this.state.userProfile?.role === 'user';
        document.getElementById('userMenuBtn').classList.toggle('hide', !isRegularUser);

        this.elements.adminMenuBtn.classList.toggle('hide', !this.state.isAdmin);

        // Show Talib button for students
        const isStudent = this.state.userProfile?.role === 'student';
        document.getElementById('talibMenuBtn').classList.toggle('hide', !isStudent);
        document.getElementById('loginBtn').classList.toggle('hide', this.state.currentUser);
        document.getElementById('logoutBtn').classList.toggle('hide', !this.state.currentUser);

        // Show/hide fund tabs based on admin status
        this.elements.fundTabs.classList.toggle('hide', this.state.isAdmin);

        // Admin controls - force update visibility using display style and remove hide class
        const adminControls = this.elements.adminControls;
        if (adminControls) {
            if (this.state.isAdmin) {
                adminControls.style.display = 'block';
                adminControls.classList.remove('hide');
            } else {
                adminControls.style.display = 'none';
                adminControls.classList.add('hide');
            }
            console.log('Admin controls display set to:', adminControls.style.display);
        }

        // Hide donation info for admins
        const donationInfoText = document.getElementById('donationInfoText');
        if (donationInfoText && donationInfoText.parentElement) {
            if (this.state.isAdmin) {
                donationInfoText.parentElement.classList.add('hide');
            } else {
                donationInfoText.parentElement.classList.remove('hide');
            }
        }

        // User-specific buttons
        if (this.state.isAdmin) {
            this.elements.myDonorBtn.classList.remove('hide');
            const isBn = localStorage.getItem('lang') === 'bn';
            this.elements.myDonorBtn.textContent = isBn ? '+ ডোনার প্রোফাইল যুক্ত করুন' : '+ Add Donor Profile';
            this.elements.myDonorBtn.onclick = async () => {
                await this.populateDonorForm();
                this.showModal('donorProfileModal');
            };
        } else {
            this.elements.myDonorBtn.classList.toggle('hide', !this.state.currentUser);
            this.updateMyProfileButtonText();
            this.elements.myDonorBtn.onclick = async () => {
                await this.populateDonorForm();
                this.showModal('donorProfileModal');
            };
        }

        this.elements.postNoticeBtn.classList.toggle('hide', !this.state.currentUser);

        // Show create notification button for admins and moderators
        const createNotifBtn = document.getElementById('createNotificationBtn');
        if (createNotifBtn) {
            createNotifBtn.classList.toggle('hide', !this.canManageNotifications());
        }

        // Always show backup to cloud button for users with notes access
        const backupBtn = document.getElementById('createBackupBtn');
        if (backupBtn) {
            backupBtn.classList.toggle('hide', !this.canAccessNotes());
        }
    },

    updateMonthDisplay() {
        this.elements.currentMonthDisplay.textContent = this.state.currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
        this.elements.currentYearDisplay.textContent = this.state.currentYear;
    },

    renderFundList(items, element, color) {
        if (items.length === 0) {
            const isBn = localStorage.getItem('lang') === 'bn';
            const noEntriesText = color === 'green'
                ? (isBn ? 'কোনো এন্ট্রি নেই' : 'No collection entries')
                : (isBn ? 'কোনো এন্ট্রি নেই' : 'No sadakah entries');
            element.innerHTML = `<div class="text-gray-400 text-center py-4">${noEntriesText}</div>`;
            return;
        }
        element.innerHTML = items.map((item, index) => {
            const textColor = item.highlighted ? 'text-red-600' : 'text-gray-800';

            // Determine background color for expenses based on display/calculation flags
            let bgClass = `bg-${color}-50`;
            let opacity = '';

            if (color === 'red' && item.type === 'expense') {
                const isDisplay = !item.is_display; // NULL/false in DB = true (displayed)
                const isCalculation = !item.is_calculation; // NULL/false in DB = true (calculated)

                if (isDisplay && isCalculation) {
                    // Both: normal (as it is)
                    bgClass = 'bg-red-50';
                } else if (isDisplay && !isCalculation) {
                    // Only display: more transparent
                    bgClass = 'bg-red-50';
                    opacity = 'opacity-50';
                } else if (!isDisplay && isCalculation) {
                    // Only calculation: darker
                    bgClass = 'bg-red-200';
                } else {
                    // Neither: gray
                    bgClass = 'bg-gray-200';
                }
            }

            // Convert to Bangladesh time (UTC+6)
            const bdTime = new Date(new Date(item.timestamp).getTime() + (6 * 60 * 60 * 1000));
            const formattedTime = bdTime.toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            return `
      <div class="${bgClass} ${opacity} p-1.5 rounded-lg text-sm relative group" title="${formattedTime}">
                    <div class="flex justify-between items-start">
                        <div class="flex-1">
                            <span class="font-semibold text-gray-600">${index + 1}.</span>
                            <span class="ml-2 ${textColor}">${item.name || item.description}</span>
                        </div>
                        <div class="flex items-center gap-1">
                            <div class="font-bold text-${color}-700">৳ ${item.amount}</div>
                            ${this.state.isAdmin ? `
                                <button data-edit-fund="${item.id}" data-fund-type="${item.type}" class="ml-1 text-blue-500 hover:text-blue-700" style="width: 20px; height: 20px;"><img src="svgs/icon-edit.svg" style="width: 16px; height: 16px;"></button>
                                <button data-delete-fund="${item.id}" class="text-red-500 hover:text-red-700" style="width: 20px; height: 20px;"><img src="svgs/icon-delete.svg" style="width: 16px; height: 16px;"></button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="absolute left-0 top-full mt-1 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">${formattedTime}</div>
                </div>
            `;
        }).join('');
    },

    async loadNotices() {
        await window.NoticesModule.loadNotices();
    },

    filterAndRenderDonors() {
        window.BloodModule.filterAndRenderDonors();
    },

    renderNotices(notices) {
        window.NoticesModule.renderNotices(notices);
    },

    renderLoader(section) {
        const sectionMap = {
            fund: [this.elements.incomeList, this.elements.expenseList],
            blood: [this.elements.donorsList],
            notices: [this.elements.noticesList]
        };
        sectionMap[section].forEach(el => el.innerHTML = '<div class="loader"></div>');
    },

    // --- EVENT BINDING & HANDLERS ---
    convertBengaliToEnglishNumber(input) {
        const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
        const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        let result = input;
        bengaliDigits.forEach((bn, i) => {
            result = result.replace(new RegExp(bn, 'g'), englishDigits[i]);
        });
        return result;
    },

    bindEvents() {
        // Advanced options toggle
        document.getElementById('advancedOptionsToggle')?.addEventListener('click', () => {
            const options = document.getElementById('advancedOptions');
            const arrow = document.getElementById('advancedArrow');
            options.classList.toggle('hide');
            arrow.textContent = options.classList.contains('hide') ? '▼' : '▲';
        });

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.showSection(btn.dataset.section));
        });

        // Fund tab switching (non-admin only)
        document.getElementById('collectionTabBtn')?.addEventListener('click', () => {
            this.state.activeFundTab = 'collection';
            this.updateFundTabView();
        });

        document.getElementById('sadakahTabBtn')?.addEventListener('click', () => {
            this.state.activeFundTab = 'sadakah';
            this.updateFundTabView();
        });

        // Admin menu button
        this.elements.adminMenuBtn?.addEventListener('click', () => {
            this.showModal('adminMenuModal');
        });

        // User menu button
        document.getElementById('userMenuBtn')?.addEventListener('click', () => {
            this.showModal('userMenuModal');
        });

        // Talib menu button
        document.getElementById('talibMenuBtn')?.addEventListener('click', () => {
            this.showModal('talibMenuModal');
        });

        // Admin users button
        document.getElementById('adminUsersBtn')?.addEventListener('click', () => {
            this.hideAllModals();
            this.loadUsers();
            this.showModal('adminUsersModal');
        });

        // Admin notes button
        document.getElementById('adminNotesBtn')?.addEventListener('click', () => {
            this.hideAllModals();
            this.showSection('notes');
        });

        // User notes button
        document.getElementById('userNotesBtn')?.addEventListener('click', () => {
            this.hideAllModals();
            this.showSection('notes');
        });

        // User notifications button
        document.getElementById('userNotificationsBtn')?.addEventListener('click', () => {
            this.hideAllModals();
            this.showSection('notifications');
        });

        // Talib notes button
        document.getElementById('talibNotesBtn')?.addEventListener('click', () => {
            this.hideAllModals();
            this.showSection('notes');
        });

        // Talib notifications button
        document.getElementById('talibNotificationsBtn')?.addEventListener('click', () => {
            this.hideAllModals();
            this.showSection('notifications');
        });

        // Talib message admin button
        document.getElementById('talibMessageAdminBtn')?.addEventListener('click', async () => {
            this.hideAllModals();
            await window.MessagesModule.checkMessageCooldown(App.state.currentUser?.id);
            this.showSection('userMessages');
        });

        // Back to home buttons
        document.getElementById('notificationsBackBtn')?.addEventListener('click', () => {
            this.showSection('fund');
        });
        document.getElementById('userMessagesBackBtn')?.addEventListener('click', () => {
            this.showSection('fund');
        });
        document.getElementById('adminMessagesBackBtn')?.addEventListener('click', () => {
            this.showSection('fund');
        });
        document.getElementById('notesBackBtn')?.addEventListener('click', () => {
            this.showSection('fund');
        });

        // Admin notifications button
        document.getElementById('adminNotificationsBtn')?.addEventListener('click', () => {
            this.hideAllModals();
            this.showSection('notifications');
        });

        // Message admin button
        document.getElementById('messageAdminBtn')?.addEventListener('click', async () => {
            this.hideAllModals();
            await window.MessagesModule.checkMessageCooldown(App.state.currentUser?.id);
            this.showSection('userMessages');
        });

        // Admin messages button
        document.getElementById('adminMessagesBtn')?.addEventListener('click', () => {
            this.hideAllModals();
            this.showSection('adminMessages');
        });

        // Compose new message button
        document.getElementById('composeNewMessageBtn')?.addEventListener('click', async () => {
            await window.MessagesModule.openComposeMessage();
        });

        // Admin message tabs
        document.querySelectorAll('.admin-message-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                window.MessagesModule.loadAdminMessages(btn.dataset.tab);
            });
        });

        // Compose message form
        document.getElementById('composeMessageForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const subjectSelect = document.getElementById('messageSubject');
            const customSubject = document.getElementById('customSubject');
            const subject = subjectSelect.value === 'Other' ? customSubject.value.trim() : subjectSelect.value;
            const message = document.getElementById('messageContent').value.trim();

            if (!subject) {
                this.showNotification('Please enter a subject', true);
                return;
            }

            await window.MessagesModule.sendMessageToAdmin(subject, message);
        });

        // Custom subject toggle
        document.getElementById('messageSubject')?.addEventListener('change', (e) => {
            const customSection = document.getElementById('customSubjectSection');
            if (e.target.value === 'Other') {
                customSection.classList.remove('hide');
            } else {
                customSection.classList.add('hide');
            }
        });

        // Update message status when admin closes message modal
        const adminMsgModal = document.getElementById('adminViewMessageModal');
        if (adminMsgModal) {
            const closeBtn = adminMsgModal.querySelector('[data-close-modal]');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    window.MessagesModule.updateMessageStatusOnClose();
                });
            }
        }

        // Mark user reply as read when viewing
        document.addEventListener('click', (e) => {
            const viewMsgBtn = e.target.closest('[data-view-message]');
            if (viewMsgBtn) {
                const messageId = viewMsgBtn.dataset.viewMessage;
                // Check if message has admin reply
                setTimeout(() => {
                    const replySection = document.getElementById('viewMessageReply');
                    if (replySection && replySection.innerHTML.includes('Admin Reply')) {
                        window.MessagesModule.markUserReplyAsRead(messageId);
                    }
                }, 100);
            }
        });

        // Create notification button
        document.getElementById('createNotificationBtn')?.addEventListener('click', () => {
            document.getElementById('notificationId').value = '';
            document.getElementById('notificationForm').reset();
            document.getElementById('notificationModalTitle').textContent = 'Create Notification';
            this.showModal('notificationModal');
        });

        // Notes buttons
        document.getElementById('createNoteBtn')?.addEventListener('click', () => {
            this.editNote(null);
        });

        document.getElementById('notesFileMenuBtn')?.addEventListener('click', () => {
            // Show/hide backup button based on access
            const backupBtn = document.getElementById('createBackupBtnModal');
            if (backupBtn) {
                backupBtn.classList.toggle('hide', !this.canBackupNotesToCloud());
            }
            this.showModal('notesFileMenuModal');
        });

        document.getElementById('createBackupBtnModal')?.addEventListener('click', () => {
            if (this.canBackupNotesToCloud()) {
                this.backupNotesToServer();
            } else {
                this.showModal('notesAccessDeniedModal');
            }
        });

        document.getElementById('exportNotesBtnModal')?.addEventListener('click', () => {
            this.exportNotesToFile();
        });

        document.getElementById('importNotesBtnModal')?.addEventListener('click', () => {
            this.hideAllModals();
            this.showModal('importNotesModal');
        });

        document.getElementById('importNotesFile')?.addEventListener('change', (e) => {
            this.importNotesFromFile(e);
        });

        document.getElementById('editNoteBtn')?.addEventListener('click', () => {
            if (this.state.currentNote) {
                this.editNote(this.state.currentNote.id);
            }
        });

        document.getElementById('deleteNoteViewBtn')?.addEventListener('click', () => {
            if (this.state.currentNote) {
                this.deleteNote(this.state.currentNote.id);
            }
        });

        document.getElementById('deleteNoteEditBtn')?.addEventListener('click', () => {
            const noteId = document.getElementById('noteEditId').value;
            if (noteId) {
                this.deleteNote(noteId);
            }
        });

        document.getElementById('saveNoteBtn')?.addEventListener('click', () => {
            this.saveNote();
        });

        document.getElementById('notesFormattingGuideBtn')?.addEventListener('click', () => {
            this.showModal('formattingGuideModal');
        });

        // Notes search functionality (normal mode)
        document.getElementById('notesSearchBtn')?.addEventListener('click', () => {
            const searchInput = document.getElementById('notesSearchInput');
            const searchBtn = document.getElementById('notesSearchBtn');
            const clearBtn = document.getElementById('notesSearchClearBtn');
            const editBtn = document.getElementById('notesEditModeBtn');
            const fileBtn = document.getElementById('notesFileMenuBtn');

            searchInput.classList.remove('hide');
            searchBtn.classList.add('hide');
            clearBtn.classList.remove('hide');
            editBtn.classList.add('hide');
            fileBtn.classList.add('hide');
            searchInput.focus();
        });

        document.getElementById('notesSearchInput')?.addEventListener('input', (e) => {
            window.NotesModule.filterNotes(e.target.value.trim());
        });

        document.getElementById('notesSearchClearBtn')?.addEventListener('click', () => {
            const searchInput = document.getElementById('notesSearchInput');
            const searchBtn = document.getElementById('notesSearchBtn');
            const clearBtn = document.getElementById('notesSearchClearBtn');
            const editBtn = document.getElementById('notesEditModeBtn');
            const fileBtn = document.getElementById('notesFileMenuBtn');

            searchInput.value = '';
            searchInput.classList.add('hide');
            searchBtn.classList.remove('hide');
            clearBtn.classList.add('hide');
            if (this.canAccessNotes()) {
                editBtn.classList.remove('hide');
            }
            fileBtn.classList.remove('hide');
            window.NotesModule.renderNotes();
        });

        // Notes search functionality (edit mode)
        document.getElementById('notesEditSearchBtn')?.addEventListener('click', () => {
            const searchInput = document.getElementById('notesEditSearchInput');
            const searchBtn = document.getElementById('notesEditSearchBtn');
            const clearBtn = document.getElementById('notesEditSearchClearBtn');
            const actionsDiv = document.getElementById('notesEditActions');
            const quitBtn = document.getElementById('notesQuitEditBtn');

            searchInput.classList.remove('hide');
            searchBtn.classList.add('hide');
            clearBtn.classList.remove('hide');
            actionsDiv.classList.add('hide');
            quitBtn.classList.add('hide');
            searchInput.focus();
        });

        document.getElementById('notesEditSearchInput')?.addEventListener('input', (e) => {
            window.NotesModule.filterNotes(e.target.value.trim());
        });

        document.getElementById('notesEditSearchClearBtn')?.addEventListener('click', () => {
            const searchInput = document.getElementById('notesEditSearchInput');
            const searchBtn = document.getElementById('notesEditSearchBtn');
            const clearBtn = document.getElementById('notesEditSearchClearBtn');
            const actionsDiv = document.getElementById('notesEditActions');
            const quitBtn = document.getElementById('notesQuitEditBtn');

            searchInput.value = '';
            searchInput.classList.add('hide');
            searchBtn.classList.remove('hide');
            clearBtn.classList.add('hide');
            actionsDiv.classList.remove('hide');
            quitBtn.classList.remove('hide');
            window.NotesModule.renderNotes();
        });

        // Notes edit mode button
        document.getElementById('notesEditModeBtn')?.addEventListener('click', () => {
            window.NotesModule.enterEditMode(false);
        });

        // Notes edit mode tabs
        document.getElementById('notesTabYourNotes')?.addEventListener('click', () => {
            window.NotesModule.switchToYourNotesTab();
        });

        document.getElementById('notesTabRecycleBin')?.addEventListener('click', () => {
            window.NotesModule.switchToRecycleBinTab();
        });

        // Quit edit mode button
        document.getElementById('notesQuitEditBtn')?.addEventListener('click', () => {
            window.NotesModule.exitEditMode();
        });        

        // Import modal - file drop zone
        const importDropZone = document.getElementById('importFileDropZone');
        const importFileInput = document.getElementById('importNotesFile');

        if (importDropZone) {
            importDropZone.addEventListener('click', () => {
                importFileInput.click();
            });

            importDropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                importDropZone.classList.add('drag-over');
            });

            importDropZone.addEventListener('dragleave', () => {
                importDropZone.classList.remove('drag-over');
            });

            importDropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                importDropZone.classList.remove('drag-over');

                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    importFileInput.files = files;
                    const event = new Event('change', { bubbles: true });
                    importFileInput.dispatchEvent(event);
                }
            });
        }

        // Revive from deleted button
        document.getElementById('reviveFromDeletedBtn')?.addEventListener('click', () => {
            App.hideAllModals();
            window.NotesModule.enterEditMode(true);
        });

        // Notes close confirmation
        document.getElementById('noteCancelBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showModal('noteCloseConfirmModal');
        });

        document.getElementById('noteCloseSaveBtn')?.addEventListener('click', async () => {
            await this.saveNote();
            this.hideAllModals();
        });

        document.getElementById('noteCloseDiscardBtn')?.addEventListener('click', () => {
            this.hideAllModals();
        });

        // Unsaved changes warning (keep for other modals)
        document.getElementById('discardChangesBtn')?.addEventListener('click', () => {
            this.hideAllModals();
        });

        document.getElementById('keepEditingBtn')?.addEventListener('click', () => {
            document.getElementById('unsavedChangesModal').classList.add('hide');
            this.showModal('noteEditModal');
        });

        // Set initial active tab
        this.updateActiveTab();
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshApp());
        document.getElementById('settingsBtn').addEventListener('click', () => this.showModal('settingsModal'));
        document.getElementById('loginTopBtn').addEventListener('click', () => this.showModal('loginModal'));
        document.getElementById('loginBtn').addEventListener('click', () => this.showModal('loginModal'));
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());

        // Google OAuth button in login modal
        const googleBtn = document.getElementById('googleLoginBtn');
        if (googleBtn) {
            googleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.signInWithGoogle();
            });
        }


        // Modals
        document.getElementById('showSignupBtn').addEventListener('click', () => this.showModal('signupModal'));
        document.getElementById('showLoginBtn').addEventListener('click', () => this.showModal('loginModal'));
        document.getElementById('forgotPasswordBtn').addEventListener('click', () => this.showModal('forgotPasswordModal'));
        document.getElementById('backToLoginBtn').addEventListener('click', () => this.showModal('loginModal'));

        // Show/Hide Password toggles
        document.getElementById('toggleLoginPassword').addEventListener('click', () => {
            const input = document.getElementById('loginPassword');
            const icon = document.getElementById('loginEyeIcon');
            if (input.type === 'password') {
                input.type = 'text';
                icon.src = 'svgs/icon-eye-slash.svg';
            } else {
                input.type = 'password';
                icon.src = 'svgs/icon-eye.svg';
            }
        });
        document.getElementById('toggleSignupPassword').addEventListener('click', () => {
            const input = document.getElementById('signupPassword');
            const icon = document.getElementById('signupEyeIcon');
            if (input.type === 'password') {
                input.type = 'text';
                icon.src = 'svgs/icon-eye-slash.svg';
            } else {
                input.type = 'password';
                icon.src = 'svgs/icon-eye.svg';
            }
        });
        document.getElementById('toggleSignupConfirmPassword').addEventListener('click', () => {
            const input = document.getElementById('signupConfirmPassword');
            const icon = document.getElementById('signupConfirmEyeIcon');
            if (input.type === 'password') {
                input.type = 'text';
                icon.src = 'svgs/icon-eye-slash.svg';
            } else {
                input.type = 'password';
                icon.src = 'svgs/icon-eye.svg';
            }
        });
        document.querySelectorAll('[data-modal]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (btn.dataset.modal === 'donorProfileModal' && btn.id !== 'myDonorBtn') await this.populateDonorForm();

                // Reset income modal when opening for new entry
                if (btn.dataset.modal === 'addIncomeModal') {
                    const isBn = localStorage.getItem('lang') === 'bn';
                    document.getElementById('incomeId').value = '';
                    document.querySelector('#addIncomeModal h2').textContent = isBn ? 'কালেকশন যুক্ত করুন' : 'Add Collection';
                    document.querySelector('#addIncomeForm button[type="submit"]').textContent = isBn ? 'যুক্ত করুন' : 'Add';
                    document.getElementById('addIncomeForm').reset();
                }

                // Reset expense modal when opening for new entry
                if (btn.dataset.modal === 'addExpenseModal') {
                    const isBn = localStorage.getItem('lang') === 'bn';
                    document.getElementById('expenseId').value = '';
                    document.querySelector('#addExpenseModal h2').textContent = isBn ? 'সাদাকাহ যুক্ত করুন' : 'Add Sadakah';
                    document.querySelector('#addExpenseForm button[type="submit"]').textContent = isBn ? 'যুক্ত করুন' : 'Add';
                    document.getElementById('addExpenseForm').reset();
                }

                this.showModal(btn.dataset.modal);
            });
        });
        document.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => this.hideAllModals());
        });

        // Forms
        document.getElementById('signupForm').addEventListener('submit', e => {
            e.preventDefault();
            const name = e.target.elements.signupName.value.trim();
            const emailOrPhone = e.target.elements.signupEmail.value.trim();
            const pass = e.target.elements.signupPassword.value;
            const confirmPass = e.target.elements.signupConfirmPassword.value;

            if (!name) {
                this.hideAllModals();
                return this.showNotification('Please enter your full name', true);
            }
            if (pass.length < 6) {
                this.hideAllModals();
                return this.showNotification('Password must be at least 6 characters long', true);
            }
            if (pass !== confirmPass) {
                this.hideAllModals();
                return this.showNotification('Passwords do not match', true);
            }
            this.signup(name, emailOrPhone, pass);
        });
        document.getElementById('loginForm').addEventListener('submit', e => {
            e.preventDefault();
            const emailOrPhone = e.target.elements.loginEmail.value.trim();
            const password = e.target.elements.loginPassword.value;
            if (!emailOrPhone || !password) {
                this.hideAllModals();
                return this.showNotification('Please enter both email/phone and password', true);
            }
            this.login(emailOrPhone, password);
        });
        document.getElementById('forgotPasswordForm').addEventListener('submit', async e => {
            e.preventDefault();
            const email = e.target.elements.forgotEmail.value.trim();
            if (!email) {
                this.hideAllModals();
                return this.showNotification('Please enter your email', true);
            }
            // Detect if running in native app or web
            const isNative = typeof window.Capacitor !== 'undefined';
            const redirectTo = isNative ? 'com.eor.app://reset-password' : window.location.origin;

            const { error } = await db.auth.resetPasswordForEmail(email, {
                redirectTo
            });
            if (error) {
                this.hideAllModals();
                return this.showNotification(error.message, true);
            }
            this.hideAllModals();
            this.showNotification('Password reset link sent to your email!');
            e.target.reset();
        });
        document.getElementById('addIncomeForm').addEventListener('submit', async e => {
            e.preventDefault();
            const incomeId = document.getElementById('incomeId').value;
            const name = e.target.elements.incomeName.value;
            const amountInput = this.convertBengaliToEnglishNumber(e.target.elements.incomeAmount.value);
            const amount = parseFloat(amountInput);
            const highlighted = e.target.elements.incomeHighlighted.checked;

            if (incomeId) {
                // Update existing entry
                await this.updateFundEntry(incomeId, { name, amount, highlighted });
            } else {
                // Add new entry
                await this.addFundEntry('income', { name, amount, highlighted });
            }
            e.target.reset();
            document.getElementById('incomeId').value = '';
        });
        document.getElementById('addExpenseForm').addEventListener('submit', async e => {
            e.preventDefault();
            const expenseId = document.getElementById('expenseId').value;
            const description = e.target.elements.expenseDesc.value;
            const amountInput = this.convertBengaliToEnglishNumber(e.target.elements.expenseAmount.value);
            const amount = parseFloat(amountInput);
            const additional_info = e.target.elements.expenseAdditionalInfo.value.trim() || null;
            const highlighted = e.target.elements.expenseHighlighted.checked;

            // Inverse logic: checked (true) = store NULL/false, unchecked (false) = store true
            const isDisplay = document.getElementById('expenseDisplay').checked ? null : true;
            const isCalculation = document.getElementById('expenseCalculation').checked ? null : true;

            if (expenseId) {
                await this.updateFundEntry(expenseId, {
                    description, amount, additional_info, highlighted,
                    is_display: isDisplay,
                    is_calculation: isCalculation
                });
            } else {
                await this.addFundEntry('expense', {
                    description, amount, additional_info, highlighted,
                    is_display: isDisplay,
                    is_calculation: isCalculation
                });
            }
            e.target.reset();
            document.getElementById('expenseId').value = '';
            // Reset advanced options to default (display and calculation checked)
            document.getElementById('expenseDisplay').checked = true;
            document.getElementById('expenseCalculation').checked = true;
            document.getElementById('advancedOptions').classList.add('hide');
            document.getElementById('advancedArrow').textContent = '▼';
        });
        document.getElementById('postNoticeForm').addEventListener('submit', async e => {
            e.preventDefault();
            const text = e.target.elements.noticeText.value.trim();
            const noticeId = document.getElementById('noticeId').value;

            if (!text) return this.showNotification('Please add some text.', true);

            if (noticeId) {
                // Update existing notice
                const { error } = await db.from('notices').update({ text }).eq('id', parseInt(noticeId));
                if (error) return this.showNotification(error.message, true);
                this.showNotification('Activity updated!');
            } else {
                // Create new notice
                const { error } = await db.from('notices').insert({
                    text,
                    author_name: this.state.userProfile.name,
                    author_id: this.state.currentUser.id
                });
                if (error) return this.showNotification(error.message, true);
                this.showNotification('Activity posted!');
            }

            this.hideAllModals();
            this.loadNotices();
            e.target.reset();
            document.getElementById('noticeId').value = '';
        });
        document.getElementById('notificationForm').addEventListener('submit', async e => {
            e.preventDefault();
            const notificationId = document.getElementById('notificationId').value;
            const title = document.getElementById('notificationTitle').value.trim();
            const content = document.getElementById('notificationContent').value.trim();
            const targetAudience = document.getElementById('notificationTarget').value;

            if (!title || !content || !targetAudience) {
                return this.showNotification('Please fill in all fields', true);
            }

            if (notificationId) {
                // Update existing notification
                const { error } = await db.from('notifications').update({
                    title,
                    content,
                    target_audience: targetAudience
                }).eq('id', parseInt(notificationId));

                if (error) return this.showNotification(error.message, true);
                this.showNotification('Notification updated!');
            } else {
                // Create new notification
                const { error } = await db.from('notifications').insert({
                    title,
                    content,
                    target_audience: targetAudience,
                    created_by: this.state.currentUser.id
                });

                if (error) return this.showNotification(error.message, true);
                this.showNotification('Notification sent!');
            }

            this.hideAllModals();
            this.loadNotifications();
        });

        document.getElementById('donorProfileForm').addEventListener('submit', async e => {
            e.preventDefault();
            const donorId = document.getElementById('donorId').value;

            const hasLastDonated = document.getElementById('donorHasLastDonated').checked;
            const lastDonatedValue = document.getElementById('donorLastDonated').value;

            const profile = {
                name: e.target.elements.donorName.value,
                phone: e.target.elements.donorPhone.value,
                blood_group: e.target.elements.donorBloodGroup.value,
                location: e.target.elements.donorLocation.value,
                available: e.target.elements.donorAvailable.checked,
                last_donated: (hasLastDonated && lastDonatedValue) ? lastDonatedValue : null,
            };

            if (donorId) {
                // Update existing profile (admin or user's own)
                const { error } = await db.from('donors').update(profile).eq('id', parseInt(donorId));
                if (error) return this.showNotification(error.message, true);
            } else {
                // Create new profile
                profile.user_id = this.state.isAdmin ? null : this.state.currentUser.id;
                profile.created_by_admin = this.state.isAdmin;
                const { error } = await db.from('donors').insert(profile);
                if (error) return this.showNotification(error.message, true);
            }

            this.showNotification('Profile saved!');
            this.hideAllModals();
            this.loadDonors();
        });
        this.elements.deleteDonorBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to delete this donor profile?')) return;
            const donorId = document.getElementById('donorId').value;
            if (!donorId) return;
            const { error } = await db.from('donors').delete().eq('id', parseInt(donorId));
            if (error) return this.showNotification(error.message, true);
            this.showNotification('Profile deleted.');
            this.hideAllModals();
            this.loadDonors();
        });

        // Toggle last donated date field visibility
        document.getElementById('donorHasLastDonated').addEventListener('change', (e) => {
            const dateField = document.getElementById('donorLastDonated');
            if (e.target.checked) {
                dateField.classList.remove('hide');
            } else {
                dateField.classList.add('hide');
                dateField.value = '';
            }
        });

        // Other interactions
        document.getElementById('prevMonthBtn').addEventListener('click', () => this.changeMonth(-1));
        document.getElementById('nextMonthBtn').addEventListener('click', () => this.changeMonth(1));
        document.getElementById('prevYearBtn').addEventListener('click', () => this.changeYear(-1));
        document.getElementById('nextYearBtn').addEventListener('click', () => this.changeYear(1));
        this.elements.mainContent.addEventListener('click', e => {
            if (e.target.dataset.deleteFund) this.deleteFundEntry(e.target.dataset.deleteFund);
            if (e.target.dataset.editFund) this.editFundEntry(e.target.dataset.editFund, e.target.dataset.fundType);
            // Handle clicks on img inside buttons
            if (e.target.tagName === 'IMG' && e.target.parentElement.dataset.deleteFund) {
                this.deleteFundEntry(e.target.parentElement.dataset.deleteFund);
            }
            if (e.target.tagName === 'IMG' && e.target.parentElement.dataset.editFund) {
                this.editFundEntry(e.target.parentElement.dataset.editFund, e.target.parentElement.dataset.fundType);
            }
        });
        document.getElementById('bloodFilter').addEventListener('change', () => {
            this.state.allDonors = window.BloodModule.shuffleDonors(this.state.allDonors);
            window.BloodModule.filterAndRenderDonors();
        });

        // Blood search toggle
        document.getElementById('bloodSearchBtn').addEventListener('click', () => {
            const searchInput = document.getElementById('bloodSearch');
            const filterSelect = document.getElementById('bloodFilter');
            const searchBtn = document.getElementById('bloodSearchBtn');
            const clearBtn = document.getElementById('bloodClearBtn');

            searchInput.classList.remove('hide');
            filterSelect.classList.add('hide');
            searchBtn.classList.add('hide');
            clearBtn.classList.remove('hide');
            searchInput.focus();
        });

        // Blood search input
        document.getElementById('bloodSearch').addEventListener('input', () => {
            this.filterAndRenderDonors();
        });

        // Blood search blur
        document.getElementById('bloodSearch').addEventListener('blur', () => {
            const searchInput = document.getElementById('bloodSearch');
            if (!searchInput.value.trim()) {
                setTimeout(() => {
                    const filterSelect = document.getElementById('bloodFilter');
                    const searchBtn = document.getElementById('bloodSearchBtn');
                    const clearBtn = document.getElementById('bloodClearBtn');

                    searchInput.classList.add('hide');
                    filterSelect.classList.remove('hide');
                    searchBtn.classList.remove('hide');
                    clearBtn.classList.add('hide');
                    this.filterAndRenderDonors();
                }, 200);
            }
        });

        // Blood search clear
        document.getElementById('bloodClearBtn').addEventListener('click', () => {
            const searchInput = document.getElementById('bloodSearch');
            searchInput.value = '';
            searchInput.focus();
            this.filterAndRenderDonors();
        }); document.getElementById('showYearlyChartBtn').addEventListener('click', () => {
            this.showModal('yearlyChartModal');
            this.loadYearlyChartData();
        });
        document.getElementById('totalFundBtn').addEventListener('click', () => this.showCompleteHistory());
        document.getElementById('copyIncomeBtn').addEventListener('click', () => this.copyIncomeList());
        document.getElementById('copyHistoryBtn').addEventListener('click', () => this.copyCompleteHistory());

        // Copy donation numbers on click
        document.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('[data-copy-number]');
            if (copyBtn) {
                const number = copyBtn.dataset.copyNumber;
                navigator.clipboard.writeText(number).then(() => {
                    this.showNotification('Number copied: ' + number);
                });
            }
        });
    },

    async editNotice(noticeId) {
        await window.NoticesModule.editNotice(noticeId);
    },

    async bumpNotice(noticeId) {
        await window.NoticesModule.bumpNotice(noticeId);
    },

    async deleteNotice(noticeId) {
        await window.NoticesModule.deleteNotice(noticeId);
    },

    async populateDonorForm(donorId = null) {
        await window.BloodModule.populateDonorForm(donorId);
    },

    // --- NOTES MANAGEMENT ---
    canAccessNotes() {
        return window.NotesModule.canAccessNotes();
    },

    canBackupNotesToCloud() {
        return window.NotesModule.canBackupNotesToCloud();
    },

    canManageNotifications() {
        return window.NotificationsModule.canManageNotifications();
    },

    async loadNotifications() {
        await window.NotificationsModule.loadNotifications();
    },

    renderNotifications(notifications) {
        window.NotificationsModule.renderNotifications(notifications);
    },

    updateNotificationBadge(notifications) {
        window.NotificationsModule.updateNotificationBadge(notifications);
    },

    async editNotification(notificationId) {
        await window.NotificationsModule.editNotification(notificationId);
    },

    async bumpNotification(notificationId) {
        await window.NotificationsModule.bumpNotification(notificationId);
    },

    async deleteNotification(notificationId) {
        await window.NotificationsModule.deleteNotification(notificationId);
    },
    loadNotesFromLocalStorage() {
        window.NotesModule.loadNotesFromLocalStorage();
    },

    saveNotesToLocalStorage() {
        window.NotesModule.saveNotesToLocalStorage();
    },

    async syncNotesFromServer() {
        await window.NotesModule.syncNotesFromServer();
    },

    exportNotesToFile() {
        window.NotesModule.exportNotesToFile();
    },

    async importNotesFromFile(event) {
        await window.NotesModule.importNotesFromFile(event);
    },

    async backupNotesToServer() {
        await window.NotesModule.backupNotesToServer();
    },

    updateUnsyncedCount() {
        window.NotesModule.updateUnsyncedCount();
    },

    loadNotes() {
        window.NotesModule.loadNotes();
    },

    renderNotes() {
        window.NotesModule.renderNotes();
    },

    stripFormatting(text) {
        return window.NotesModule.stripFormatting(text);
    },

    parseFormatting(text) {
        return window.NotesModule.parseFormatting(text);
    },

    viewNote(noteId) {
        window.NotesModule.viewNote(noteId);
    },

    renderFormattedContent(content) {
        return window.NotesModule.renderFormattedContent(content);
    },

    editNote(noteId = null) {
        window.NotesModule.editNote(noteId);
    },

    setupNoteEditorEventListeners() {
        window.NotesModule.setupNoteEditorEventListeners();
    },

    async saveNote() {
        await window.NotesModule.saveNote();
    },

    generateNoteId() {
        return window.NotesModule.generateNoteId();
    },

    async deleteNote(noteId) {
        await window.NotesModule.deleteNote(noteId);
    },

    checkUnsavedChanges() {
        return window.NotesModule.checkUnsavedChanges();
    },

    enterNotesEditMode(startInRecycleBin = false) {
        window.NotesModule.enterEditMode(startInRecycleBin);
    },

    exitNotesEditMode() {
        window.NotesModule.exitEditMode();
    },

    deleteSelectedNotes() {
        window.NotesModule.deleteSelectedNotes();
    },

    deleteFromRecycleBin() {
        window.NotesModule.deleteFromRecycleBin();
    },

    reviveSelectedNotes() {
        window.NotesModule.reviveSelectedNotes();
    },

    // --- UTILITIES ---
    showSection(sectionId) {
        this.state.activeSection = sectionId;
        
        // Save active section to cache
        localStorage.setItem('activeSection', sectionId);
        
        document.querySelectorAll('.section').forEach(s => s.classList.add('hide'));
        const section = document.getElementById(`${sectionId}Section`);
        if (section) {
            section.classList.remove('hide');
            section.classList.add('fade-in');
        }
        
        // Hide main navigation for special sections
        const mainNav = document.getElementById('mainNavigation');
        const specialSections = ['notifications', 'userMessages', 'adminMessages', 'notes'];
        if (mainNav) {
            mainNav.classList.toggle('hide', specialSections.includes(sectionId));
        }
        
        this.updateActiveTab();

        // Handle fund section display based on user role
        if (sectionId === 'fund') {
            if (this.state.isAdmin) {
                // Admin: hide tabs, show collection view only
                if (this.elements.fundTabs) {
                    this.elements.fundTabs.classList.add('hide');
                }
                if (this.elements.collectionView) {
                    this.elements.collectionView.classList.remove('hide');
                }
                if (this.elements.sadakahListView) {
                    this.elements.sadakahListView.classList.add('hide');
                }
                // Force admin controls to show
                if (this.elements.adminControls) {
                    this.elements.adminControls.style.display = 'block';
                }
            } else {
                // Non-admin: show tabs, default to sadakah tab
                this.state.activeFundTab = 'sadakah';
                this.updateFundTabView();
                // Force admin controls to hide
                if (this.elements.adminControls) {
                    this.elements.adminControls.style.display = 'none';
                }
            }
        }

        this.loadDataForActiveSection();
    },

    updateActiveTab() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            if (btn.dataset.section === this.state.activeSection) {
                btn.classList.add('bg-emerald-100', 'border-2', 'border-emerald-500');
                btn.classList.remove('bg-white');
            } else {
                btn.classList.remove('bg-emerald-100', 'border-2', 'border-emerald-500');
                btn.classList.add('bg-white');
            }
        });
    },

    showModal(modalId) {
        this.hideAllModals();
        const modal = document.getElementById(modalId);
        if (modal) {
            // Calculate scrollbar width
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.documentElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);

            modal.classList.remove('hide');
            document.body.classList.add('modal-open');

            // Define modals that should NOT close on outside click (text/data input modals)
            const noOutsideCloseModals = [
                'signupModal', 'loginModal', 'forgotPasswordModal',
                'addIncomeModal', 'addExpenseModal', 'postNoticeModal',
                'donorProfileModal', 'noteEditModal'
            ];

            // Close on outside click only for non-text modals
            if (!noOutsideCloseModals.includes(modalId)) {
                setTimeout(() => {
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) {
                            this.hideAllModals();
                        }
                    });
                }, 0);
            }
        }
    },

    hideAllModals() {
        document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hide'));
        document.body.classList.remove('modal-open');
        document.documentElement.style.setProperty('--scrollbar-width', '0px');

        // Close any open dropdowns
        document.querySelectorAll('.note-dropdown').forEach(d => d.classList.remove('active'));

        // Clean up click-outside listener
        if (this.closeDropdownsHandler) {
            document.removeEventListener('click', this.closeDropdownsHandler);
            this.closeDropdownsHandler = null;
        }

        // Reset note editor when closing modals
        this.noteEditor = null;
    },

    showNotification(message, isError = false) {
        const el = this.elements.notification;
        el.textContent = message;
        el.className = isError ? 'error' : 'success';
        el.classList.remove('hide');
        setTimeout(() => el.classList.add('hide'), 3000);
    },  

    async refreshApp() {
        this.showNotification('Refreshing app...');

        // Re-enable data fetching
        this.shouldFetchFreshData = true;

        // Clear service worker cache
        if ('serviceWorker' in navigator && 'caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
        }

        // Reload the page
        window.location.reload(true);
    },

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/serviceWorker.js')
                .then(registration => {
                    console.log('Service Worker registered successfully:', registration.scope);
                })
                .catch(error => {
                    console.log('Service Worker registration failed:', error);
                });
        }
    },
    updateMyProfileButtonText() {
        window.BloodModule.updateMyProfileButtonText();
    },

    setupScrollBehavior() {
        const topBar = document.querySelector('.bg-gradient-to-r');
        let lastScrollTop = 0;
        const topBarHeight = topBar.offsetHeight;
        let currentTranslate = 0;

        // Create placeholder for blood filter
        const bloodFilterContainer = document.getElementById('bloodFilterContainer');
        const placeholder = document.createElement('div');
        placeholder.id = 'bloodFilterPlaceholder';
        if (bloodFilterContainer) {
            bloodFilterContainer.parentNode.insertBefore(placeholder, bloodFilterContainer.nextSibling);
        }

        // Store original position of blood filter
        let bloodFilterOriginalTop = 0;

        // Calculate original position on load and section change
        const calculateFilterPosition = () => {
            if (bloodFilterContainer && this.state.activeSection === 'blood') {
                bloodFilterContainer.classList.remove('sticky');
                placeholder.classList.remove('active');
                setTimeout(() => {
                    bloodFilterOriginalTop = bloodFilterContainer.getBoundingClientRect().top + window.pageYOffset;
                }, 100);
            }
        };

        // Calculate initial position
        setTimeout(calculateFilterPosition, 500);

        // Recalculate when switching to blood section
        const originalShowSection = this.showSection.bind(this);
        this.showSection = function (sectionId) {
            originalShowSection(sectionId);
            if (sectionId === 'blood') {
                setTimeout(calculateFilterPosition, 300);
            }
        };

        window.addEventListener('scroll', () => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollDelta = scrollTop - lastScrollTop;

            // Check if we're in blood section
            const isBloodSection = this.state.activeSection === 'blood';

            if (isBloodSection) {
                // Calculate if filter should be sticky
                const shouldBeSticky = scrollTop >= bloodFilterOriginalTop;

                if (shouldBeSticky) {
                    // Filter is sticky
                    if (bloodFilterContainer) {
                        const filterHeight = bloodFilterContainer.offsetHeight;
                        bloodFilterContainer.classList.add('sticky');
                        placeholder.classList.add('active');
                        placeholder.style.height = `${filterHeight}px`;
                    }
                } else {
                    // Filter is back to original position
                    if (bloodFilterContainer) {
                        bloodFilterContainer.classList.remove('sticky');
                        placeholder.classList.remove('active');
                    }
                }

                // Topbar scrolls naturally - remove any transform
                topBar.style.transform = '';
                topBar.style.position = 'relative';
            } else {
                // Other sections: normal topbar sticky behavior
                topBar.style.position = '';
                currentTranslate -= scrollDelta;
                currentTranslate = Math.max(-topBarHeight, Math.min(0, currentTranslate));
                topBar.style.transform = `translateY(${currentTranslate}px)`;

                // Remove sticky from filter if present
                if (bloodFilterContainer) {
                    bloodFilterContainer.classList.remove('sticky');
                    placeholder.classList.remove('active');
                }
            }

            lastScrollTop = scrollTop;
        }, { passive: true });
    },

    setupLanguageToggle() {
        const toggle = document.getElementById('bengaliModeToggle');
        const appTitle = document.getElementById('appTitle');
        const elementsToTranslate = {
            // --- Navigation / Tabs ---
            fund: { en: 'Fund History', bn: 'ফান্ড' },
            notices: { en: 'Activities', bn: 'কার্যক্রম' },
            blood: { en: 'Blood Donors', bn: 'রক্তদান' },

            // --- Buttons ---
            income: { en: 'Collection', bn: 'কালেকশন' },
            expense: { en: 'Sadakah', bn: 'সাদাকাহ' },
            copyList: { en: '<img src="svgs/icon-copy.svg"> Copy List', bn: '<img src="svgs/icon-copy.svg"> তালিকা কপি করুন' },
            addIncome: { en: '+ Collection', bn: '+ কালেকশন' },
            addExpense: { en: '+ Sadakah', bn: '+ সাদাকাহ' },
            viewOverview: { en: '<img src="svgs/overview-icon.svg" style="width: 20px; height: 20px; display: inline;"> View Yearly Overview', bn: '<img src="svgs/overview-icon.svg" style="width: 20px; height: 20px; display: inline;"> এই বছরের বিবরণ' },
            myProfile: { en: 'My Profile', bn: 'আমার প্রোফাইল' },
            postActivity: { en: 'Post Activity', bn: 'কার্যক্রম পোস্ট করুন' },
            save: { en: 'Save', bn: 'সেভ করুন' },
            cancel: { en: 'Cancel', bn: 'বাতিল করুন' },
            delete: { en: 'Delete', bn: 'ডিলিট করুন' },
            close: { en: 'Close', bn: 'বন্ধ করুন' },

            // --- Authentication ---
            login: { en: 'Login', bn: 'লগইন করুন' },
            logout: { en: 'Logout', bn: 'লগআউট করুন' },
            signup: { en: 'Sign Up', bn: 'সাইন-আপ করুন' },
            settings: { en: 'Settings', bn: 'সেটিংস' },
            email: { en: 'Email', bn: 'ইমেইল' },
            password: { en: 'Password', bn: 'পাসওয়ার্ড' },
            confirmPassword: { en: 'Confirm Password', bn: 'পাসওয়ার্ড কনফার্ম করুন' },
            fullName: { en: 'Full Name', bn: 'সম্পূর্ন নাম' },
            dontHaveAccount: { en: "Don't have an account? Sign up", bn: 'অ্যাকাউন্ট নেই? সাইন-আপ করুন' },
            alreadyHaveAccount: { en: 'Already have an account? Login', bn: 'অ্যাকাউন্ট আছে? লগইন করুন' },
            forgotPassword: { en: 'Forgot Password?', bn: 'পাসওয়ার্ড ভুলে গেছেন?' },
            forgotPasswordTitle: { en: 'Forgot Password', bn: 'পাসওয়ার্ড ভুলে গেছেন' },
            forgotPasswordDesc: { en: "Enter your email address and we'll send you a password reset link.", bn: 'আপনার ইমেইল লিখুন, আমরা পাসওয়ার্ড রিসেট লিঙ্ক পাঠাবো।' },
            sendResetLink: { en: 'Send Reset Link', bn: 'রিসেট লিঙ্ক পাঠান' },
            backToLogin: { en: 'Back to Login', bn: 'লগইনে ফিরে যান' },

            // --- Donor Form ---
            donorTitle: { en: 'My Donor Profile', bn: 'আমার ডোনার প্রোফাইল' },
            phoneNumber: { en: 'Phone Number', bn: 'ফোন নাম্বার' },
            bloodGroup: { en: 'Select Blood Group', bn: 'রক্তের গ্রুপ সিলেক্ট করুন' },
            location: { en: 'Location', bn: 'লোকেশন' },
            available: { en: 'Available to donate', bn: 'অ্যাভেইলেবল' },
            notAvailable: { en: 'Not Available', bn: 'অ্যাভেইলেবল নয়' },
            allGroups: { en: 'All Blood Groups', bn: 'সকল রক্তের গ্রুপ' },

            // --- Modals ---
            loginModal: { en: 'Login', bn: 'লগইন করুন' },
            signupModal: { en: 'Sign Up', bn: 'সাইন-আপ করুন' },
            addIncomeModal: { en: 'Add Collection', bn: 'কালেকশন যুক্ত করুন' },
            addExpenseModal: { en: 'Add Sadakah', bn: 'সাদাকাহ যুক্ত করুন' },
            donorProfileModal: { en: 'My Donor Profile', bn: 'আমার ডোনার প্রোফাইল' },
            postNoticeModal: { en: 'Post Activity', bn: 'কার্যক্রম পোস্ট করুন' },
            yearlyChartModal: { en: 'Yearly Overview', bn: 'বাৎসরিক তথ্য' },
            completeHistoryModal: { en: 'Complete Fund History', bn: 'ফান্ডের সম্পুর্ণ তথ্য' },
            optionalImage: { en: 'Optional Image:', bn: 'ছবি যুক্ত করুন (অপশনাল)' },

            // --- Chart Labels ---
            incomeChart: { en: 'Collection', bn: 'কালেকশন' },
            expenseChart: { en: 'Sadakah', bn: 'সাদাকাহ' },
            totalFund: { en: 'Total Fund', bn: 'ফান্ডে মোট অর্থ' },

            // --- Notices ---
            noActivities: { en: 'No activities yet', bn: 'এখনো কোনো কার্যক্রম নেই' },
            postedBy: { en: 'Posted by', bn: 'পোস্টটি করেছেন' },

            // --- Fund / History Section ---
            totalIncome: { en: 'Total Collection:', bn: 'মোট কালেকশন' },
            totalExpense: { en: 'Total Sadakah:', bn: 'মোট সাদাকাহ' },
            monthlyBalance: { en: 'Monthly economy:', bn: 'মাসিক ইকোনমি' },
            netWorth: { en: 'Net worth at month end:', bn: 'মাস শেষে অবশিষ্ট অর্থ:' },
            copyHistory: { en: '<img src="svgs/icon-copy.svg"> Copy', bn: '<img src="svgs/icon-copy.svg"> কপি করুন' },
            noEntries: { en: 'No entries found', bn: 'কোনো এন্ট্রি নেই' },
            noDonors: { en: 'No donors found', bn: 'কোনো দাতা নেই' },
            noHistory: { en: 'No fund history available', bn: 'ফান্ডের তথ্য অ্যাভেইলেবল নেই' },
            noIncomeEntries: { en: 'No Collection entries', bn: 'কোনো এন্ট্রি নেই' },
            noExpenseEntries: { en: 'No Sadakah entries', bn: 'কোনো এন্ট্রি নেই' },
            addDonorProfile: { en: '+ Add Donor Profile', bn: '+ ডোনার প্রোফাইল যুক্ত করুন' },

            // --- Settings ---
            bengaliMode: { en: 'Bengali Mode', bn: 'বাংলা করুন' },
            enable: { en: 'Enable', bn: 'চালু করুন' },
            talib: { en: 'Talib', bn: 'তালিব' },
            talibMenu: { en: 'Talib Menu', bn: 'তালিব মেনু' },
        };



        const updateLanguage = (isBn) => {
            document.querySelector('[data-section="fund"] div:last-child').textContent = isBn ? elementsToTranslate.fund.bn : elementsToTranslate.fund.en;
            document.querySelector('[data-section="notices"] div:last-child').textContent = isBn ? elementsToTranslate.notices.bn : elementsToTranslate.notices.en;
            document.querySelector('[data-section="blood"] div:last-child').textContent = isBn ? elementsToTranslate.blood.bn : elementsToTranslate.blood.en;
            document.getElementById('copyIncomeBtn').innerHTML = isBn ? '<img src="svgs/icon-copy.svg" style="display: inline;"> তালিকা কপি করুন' : '<img src="svgs/icon-copy.svg" style="display: inline;"> Copy List';
            document.getElementById('showYearlyChartBtn').innerHTML = isBn ? '<img src="svgs/overview-icon.svg" style="width: 20px; height: 20px; display: inline;"> এই বছরের বিবরণ' : '<img src="svgs/overview-icon.svg" style="width: 20px; height: 20px; display: inline;"> View Yearly Overview';
            document.getElementById('copyHistoryBtn').innerHTML = isBn ? '<img src="svgs/icon-copy.svg" style="display: inline;"> কপি করুন' : '<img src="svgs/icon-copy.svg" style="display: inline;"> Copy';
            appTitle.innerHTML = isBn ? 'এসো অবদান রাখি<br><span class="text-sm opacity-90">Esho Obodan Rakhi</span>' : 'Esho Obodan Rakhi<br><span class="text-sm opacity-90">এসো অবদান রাখি</span>';

            // Fund History Section Headers
            document.querySelector('#fundSection h3.text-green-700').textContent = isBn ? elementsToTranslate.income.bn : elementsToTranslate.income.en;

            // Donation info text (collection view)
            const donationInfoText = document.getElementById('donationInfoText');
            if (donationInfoText) {
                donationInfoText.textContent = isBn ? 'এখানে সাদাকাহ করে আপনিও অবদান রাখতে পারেনঃ' : 'You can also contribute by donating to:';
            }
            const donationNumbers = donationInfoText?.nextElementSibling?.querySelectorAll('div');
            if (donationNumbers && donationNumbers.length >= 2) {
                donationNumbers[0].innerHTML = isBn ? '<span class="underline">+880 1937-222273</span> - নগদ' : '<span class="underline">+880 1937-222273</span> - nogod';
                donationNumbers[1].innerHTML = isBn ? '<span class="underline">+880 1515-214867</span> - বিকাশ' : '<span class="underline">+880 1515-214867</span> - bkash';
            }

            // Donation info text (sadakah list view)
            const sadakahDonationInfoText = document.getElementById('sadakahDonationInfoText');
            if (sadakahDonationInfoText) {
                sadakahDonationInfoText.textContent = isBn ? 'এখানে সাদাকাহ করে আপনিও অবদান রাখতে পারেনঃ' : 'You can also contribute by donating to:';
            }
            const sadakahDonationNumbers = sadakahDonationInfoText?.nextElementSibling?.querySelectorAll('div');
            if (sadakahDonationNumbers && sadakahDonationNumbers.length >= 2) {
                sadakahDonationNumbers[0].innerHTML = isBn ? '<span class="underline">+880 1937-222273</span> - নগদ' : '<span class="underline">+880 1937-222273</span> - nogod';
                sadakahDonationNumbers[1].innerHTML = isBn ? '<span class="underline">+880 1515-214867</span> - বিকাশ' : '<span class="underline">+880 1515-214867</span> - bkash';
            }
            document.querySelector('#fundSection h3.text-red-700').textContent = isBn ? elementsToTranslate.expense.bn : elementsToTranslate.expense.en;
            document.querySelector('#totalIncome').previousElementSibling.textContent = isBn ? elementsToTranslate.totalIncome.bn : elementsToTranslate.totalIncome.en;
            document.querySelector('#totalExpense').previousElementSibling.textContent = isBn ? elementsToTranslate.totalExpense.bn : elementsToTranslate.totalExpense.en;
            document.querySelector('#monthlyBalance').previousElementSibling.textContent = isBn ? elementsToTranslate.monthlyBalance.bn : elementsToTranslate.monthlyBalance.en;
            document.querySelector('#netWorth').previousElementSibling.textContent = isBn ? elementsToTranslate.netWorth.bn : elementsToTranslate.netWorth.en;

            // Activities Section
            document.querySelector('#noticesSection h2').textContent = isBn ? 'কার্যক্রম সমূহ' : 'Fund Activities';
            document.getElementById('postNoticeBtn').textContent = isBn ? elementsToTranslate.postActivity.bn : elementsToTranslate.postActivity.en;

            // Blood Donors Section
            document.querySelector('#bloodSection h2').textContent = isBn ? elementsToTranslate.blood.bn : elementsToTranslate.blood.en;
            const donorPrompt = document.getElementById('donorPromptMessage');
            if (donorPrompt) {
                donorPrompt.textContent = isBn ? 'ব্লাড ডোনার হওয়ার জন্য "আমার প্রোফাইল" এ ক্লিক করুন এবং আপনার ফোন নম্বর ও লোকেশন যুক্ত করুন।' : 'To be a blood donor, click on "My Profile" and add your phone number and location.';
            }
            // Update My Profile button
            App.updateMyProfileButtonText();

            // Donor Profile Modal
            document.querySelector('#donorProfileModal h2').textContent = isBn ? elementsToTranslate.donorProfileModal.bn : elementsToTranslate.donorProfileModal.en;
            document.getElementById('donorName').placeholder = isBn ? elementsToTranslate.fullName.bn : elementsToTranslate.fullName.en;
            document.getElementById('donorPhone').placeholder = isBn ? elementsToTranslate.phoneNumber.bn : elementsToTranslate.phoneNumber.en;
            document.querySelector('#donorBloodGroup option[value=""]').textContent = isBn ? elementsToTranslate.bloodGroup.bn : elementsToTranslate.bloodGroup.en;
            document.getElementById('donorLocation').placeholder = isBn ? elementsToTranslate.location.bn : elementsToTranslate.location.en;
            document.querySelector('#donorProfileForm label span').textContent = isBn ? elementsToTranslate.available.bn : elementsToTranslate.available.en;

            // Last donated label
            const hasLastDonatedLabel = document.querySelector('#donorHasLastDonated').nextElementSibling;
            if (hasLastDonatedLabel) {
                hasLastDonatedLabel.textContent = isBn ? 'আগে দান করেছেন' : 'Has donated before';
            }

            // Update highlight checkbox labels
            document.querySelector('#addIncomeForm label span').textContent = isBn ? 'এই এন্ট্রি হাইলাইট করুন' : 'Highlight this entry';
            document.querySelector('#addExpenseForm label span').textContent = isBn ? 'এই এন্ট্রি হাইলাইট করুন' : 'Highlight this entry';
            document.querySelector('#donorProfileForm button[type="submit"]').textContent = isBn ? elementsToTranslate.save.bn : elementsToTranslate.save.en;

            // Blood Filter
            document.querySelector('#bloodFilter option[value="all"]').textContent = isBn ? elementsToTranslate.allGroups.bn : elementsToTranslate.allGroups.en;
            document.getElementById('bloodSearch').placeholder = isBn ? 'ডোনার খুঁজুন...' : 'Search donors...';
            document.getElementById('deleteDonorBtn').textContent = isBn ? elementsToTranslate.delete.bn : elementsToTranslate.delete.en;

            // Update donor availability text in rendered list
            App.filterAndRenderDonors();
            document.querySelector('#donorProfileModal [data-close-modal]').textContent = isBn ? elementsToTranslate.cancel.bn : elementsToTranslate.cancel.en;

            // Add Income/Expense Modals
            document.querySelector('#addIncomeModal h2').textContent = isBn ? 'কালেকশন যুক্ত করুন' : 'Add Collection';
            document.getElementById('addIncomeBtn').textContent = isBn ? '+কালেকশন' : '+Collection';
            document.getElementById('incomeName').placeholder = isBn ? 'দাতার নাম' : 'Donor Name';
            document.getElementById('incomeAmount').placeholder = isBn ? 'পরিমাণ (৳)' : 'Amount (৳)';
            document.querySelector('#addIncomeForm button[type="submit"]').textContent = isBn ? 'যুক্ত করুন' : 'Add';
            document.querySelector('#addIncomeModal [data-close-modal]').textContent = isBn ? elementsToTranslate.cancel.bn : elementsToTranslate.cancel.en;

            document.querySelector('#addExpenseModal h2').textContent = isBn ? 'সাদাকাহ যুক্ত করুন' : 'Add Sadakah';
            document.getElementById('addExpenseBtn').textContent = isBn ? '+সাদাকাহ' : '+Sadakah';
            document.getElementById('expenseDesc').placeholder = isBn ? 'শিরোনাম' : 'Title';
            document.getElementById('expenseAmount').placeholder = isBn ? 'পরিমাণ (৳)' : 'Amount (৳)';
            document.getElementById('expenseAdditionalInfo').placeholder = isBn ? 'অতিরিক্ত তথ্য (ঐচ্ছিক)' : 'Additional info (optional)';

            // Notes Close Confirmation Modal
            const noteCloseTitle = document.querySelector('#noteCloseConfirmModal h2');
            if (noteCloseTitle) {
                noteCloseTitle.textContent = isBn ? 'নোট বন্ধ করবেন?' : 'Close Note?';
            }
            const noteCloseText = document.querySelector('#noteCloseConfirmModal p');
            if (noteCloseText) {
                noteCloseText.textContent = isBn ? 'হয়তো কিছু পরিবর্তন সেভ হয়নি।' : 'There might be unsaved changes.';
            }
            const noteCloseSaveBtn = document.getElementById('noteCloseSaveBtn');
            if (noteCloseSaveBtn) {
                noteCloseSaveBtn.textContent = isBn ? 'সেভ করুন' : 'Save';
            }
            const noteCloseDiscardBtn = document.getElementById('noteCloseDiscardBtn');
            if (noteCloseDiscardBtn) {
                noteCloseDiscardBtn.textContent = isBn ? 'বাদ দিন' : 'Discard';
            }

            // Notes cancel button
            const noteCancelBtn = document.getElementById('noteCancelBtn');
            if (noteCancelBtn) {
                noteCancelBtn.textContent = isBn ? 'বাতিল' : 'Cancel';
            }

            // Unsaved Changes Warning Modal
            const unsavedTitle = document.querySelector('#unsavedChangesModal h2');

            // Fund tabs
            if (document.getElementById('collectionTabBtn')) {
                document.querySelector('#collectionTabBtn .text-sm').textContent = isBn ? 'কালেকশন' : 'Collection';
                const collectionMonth = document.getElementById('collectionTabMonth');
                if (collectionMonth) {
                    const amount = collectionMonth.textContent.split(' ')[1];
                    collectionMonth.textContent = isBn ? `৳ ${amount} এই মাসে` : `৳ ${amount} this month`;
                }
            }

            if (document.getElementById('sadakahTabBtn')) {
                document.querySelector('#sadakahTabBtn .text-sm').textContent = isBn ? 'সাদাকাহ' : 'Sadakah';
                const sadakahCount = document.getElementById('sadakahTabCount');
                if (sadakahCount) {
                    const amount = sadakahCount.textContent.match(/৳\s*[\d,]+/)?.[0] || '৳ 0';
                    sadakahCount.textContent = isBn ? `${amount} ফান্ড থেকে` : `${amount} from fund`;
                }
            }

            // Sadakah list view
            const sadakahListTitle = document.querySelector('#sadakahListView h3');
            if (sadakahListTitle) {
                sadakahListTitle.textContent = isBn ? 'সকল সাদাকাহ এর তথ্য' : 'All Sadakah History';
            }
            document.querySelector('#addExpenseForm button[type="submit"]').textContent = isBn ? 'যুক্ত করুন' : 'Add';
            document.querySelector('#addExpenseModal [data-close-modal]').textContent = isBn ? elementsToTranslate.cancel.bn : elementsToTranslate.cancel.en;

            // Post Notice Modal (only update if not in edit mode)
            if (!document.getElementById('noticeId').value) {
                document.querySelector('#postNoticeModal h2').textContent = isBn ? elementsToTranslate.postNoticeModal.bn : elementsToTranslate.postNoticeModal.en;
                document.querySelector('#postNoticeForm button[type="submit"]').textContent = isBn ? 'পোস্ট করুন' : 'Post';
            }
            document.getElementById('noticeText').placeholder = isBn ? 'কী ঘটছে?' : "What's happening?";
            document.querySelector('#postNoticeModal [data-close-modal]').textContent = isBn ? elementsToTranslate.cancel.bn : elementsToTranslate.cancel.en;

            // Yearly Chart Modal
            document.querySelector('#yearlyChartModal h2').textContent = isBn ? elementsToTranslate.yearlyChartModal.bn : elementsToTranslate.yearlyChartModal.en;
            document.querySelector('#yearlyChartModal [data-close-modal]').textContent = isBn ? elementsToTranslate.close.bn : elementsToTranslate.close.en;

            // Top Login Button
            document.getElementById('loginTopBtn').textContent = isBn ? elementsToTranslate.login.bn : elementsToTranslate.login.en;

            // Settings Modal
            document.querySelector('#settingsModal h2').textContent = isBn ? 'সেটিংস' : 'Settings';
            document.querySelector('#settingsModal .flex.items-center.justify-between span').textContent = isBn ? elementsToTranslate.bengaliMode.bn : elementsToTranslate.bengaliMode.en;
            document.querySelector('#settingsModal label span').textContent = isBn ? elementsToTranslate.enable.bn : elementsToTranslate.enable.en;
            document.getElementById('loginBtn').textContent = isBn ? elementsToTranslate.login.bn : elementsToTranslate.login.en;
            document.getElementById('logoutBtn').textContent = isBn ? elementsToTranslate.logout.bn : elementsToTranslate.logout.en;
            document.querySelector('#settingsModal [data-close-modal]').textContent = isBn ? elementsToTranslate.close.bn : elementsToTranslate.close.en;

            // Login Modal
            document.querySelector('#loginModal h2').textContent = isBn ? elementsToTranslate.loginModal.bn : elementsToTranslate.loginModal.en;
            document.getElementById('loginEmail').placeholder = isBn ? elementsToTranslate.email.bn : elementsToTranslate.email.en;
            document.getElementById('loginPassword').placeholder = isBn ? elementsToTranslate.password.bn : elementsToTranslate.password.en;
            document.querySelector('#loginForm button[type="submit"]').textContent = isBn ? elementsToTranslate.login.bn : elementsToTranslate.login.en;
            document.getElementById('showSignupBtn').textContent = isBn ? elementsToTranslate.dontHaveAccount.bn : elementsToTranslate.dontHaveAccount.en;
            document.querySelector('#loginModal [data-close-modal]').textContent = isBn ? elementsToTranslate.cancel.bn : elementsToTranslate.cancel.en;

            // Signup Modal
            document.querySelector('#signupModal h2').textContent = isBn ? elementsToTranslate.signupModal.bn : elementsToTranslate.signupModal.en;
            document.getElementById('signupName').placeholder = isBn ? elementsToTranslate.fullName.bn : elementsToTranslate.fullName.en;
            document.getElementById('signupEmail').placeholder = isBn ? elementsToTranslate.email.bn : elementsToTranslate.email.en;
            document.getElementById('signupPassword').placeholder = isBn ? elementsToTranslate.password.bn : elementsToTranslate.password.en;
            document.getElementById('signupConfirmPassword').placeholder = isBn ? elementsToTranslate.confirmPassword.bn : elementsToTranslate.confirmPassword.en;
            document.querySelector('#signupForm button[type="submit"]').textContent = isBn ? elementsToTranslate.signup.bn : elementsToTranslate.signup.en;
            document.getElementById('showLoginBtn').textContent = isBn ? elementsToTranslate.alreadyHaveAccount.bn : elementsToTranslate.alreadyHaveAccount.en;
            document.querySelector('#signupModal [data-close-modal]').textContent = isBn ? elementsToTranslate.cancel.bn : elementsToTranslate.cancel.en;

            // Forgot Password Modal
            document.getElementById('forgotPasswordBtn').textContent = isBn ? elementsToTranslate.forgotPassword.bn : elementsToTranslate.forgotPassword.en;
            document.querySelector('#forgotPasswordModal h2').textContent = isBn ? elementsToTranslate.forgotPasswordTitle.bn : elementsToTranslate.forgotPasswordTitle.en;
            document.querySelector('#forgotPasswordModal p').textContent = isBn ? elementsToTranslate.forgotPasswordDesc.bn : elementsToTranslate.forgotPasswordDesc.en;
            document.getElementById('forgotEmail').placeholder = isBn ? elementsToTranslate.email.bn : elementsToTranslate.email.en;
            document.querySelector('#forgotPasswordForm button[type="submit"]').textContent = isBn ? elementsToTranslate.sendResetLink.bn : elementsToTranslate.sendResetLink.en;
            document.getElementById('backToLoginBtn').textContent = isBn ? elementsToTranslate.backToLogin.bn : elementsToTranslate.backToLogin.en;
            document.querySelector('#forgotPasswordModal [data-close-modal]').textContent = isBn ? elementsToTranslate.cancel.bn : elementsToTranslate.cancel.en;

            // Complete History Modal
            document.querySelector('#completeHistoryModal [data-close-modal]').textContent = isBn ? elementsToTranslate.close.bn : elementsToTranslate.close.en;

            // User button and modal
            const userBtn = document.getElementById('userMenuBtn');
            if (userBtn) {
                userBtn.textContent = isBn ? 'মেনু' : 'Menu';
            }
            const userMenuTitle = document.querySelector('#userMenuModal h2');
            if (userMenuTitle) {
                userMenuTitle.textContent = isBn ? 'মেনু' : 'Menu';
            }
            const userNotesBtn = document.getElementById('userNotesBtn');
            if (userNotesBtn) {
                userNotesBtn.innerHTML = isBn ? '📝 নোট' : '📝 Notes';
            }
            const userNotifBtn = document.getElementById('userNotificationsBtn');
            if (userNotifBtn) {
                userNotifBtn.innerHTML = isBn ? '🔔 নোটিফিকেশন' : '🔔 Notifications';
            }

            // Talib button and modal
            const talibBtn = document.getElementById('talibMenuBtn');
            if (talibBtn) {
                talibBtn.textContent = isBn ? 'মেনু' : 'Menu';
            }
            const talibMenuTitle = document.querySelector('#talibMenuModal h2');
            if (talibMenuTitle) {
                talibMenuTitle.textContent = isBn ? 'মেনু' : 'Menu';
            }

            // Admin Menu Modal
            const adminMenuTitle = document.querySelector('#adminMenuModal h2');
            if (adminMenuTitle) {
                adminMenuTitle.textContent = isBn ? 'অ্যাডমিন মেনু' : 'Admin Menu';
            }
            const adminUsersBtn = document.getElementById('adminUsersBtn');
            if (adminUsersBtn) {
                adminUsersBtn.innerHTML = isBn ? '👥 ইউজারস' : '👥 Users';
            }
            // Notes section buttons - update tooltips only
            const notesFileMenuBtn = document.getElementById('notesFileMenuBtn');
            if (notesFileMenuBtn) {
                notesFileMenuBtn.title = isBn ? 'ফাইল ম্যানেজমেন্ট' : 'File Management';
            }

            const notesFormattingGuideBtn = document.getElementById('notesFormattingGuideBtn');
            if (notesFormattingGuideBtn) {
                notesFormattingGuideBtn.title = isBn ? 'ফরম্যাটিং গাইড' : 'Formatting Guide';
            }

            const createNoteBtn = document.getElementById('createNoteBtn');
            if (createNoteBtn) {
                createNoteBtn.textContent = isBn ? '+ নতুন নোট' : '+ New Note';
            }

            // Notes File Menu Modal
            const notesFileMenuTitle = document.querySelector('#notesFileMenuModal h2');
            if (notesFileMenuTitle) {
                notesFileMenuTitle.textContent = isBn ? 'নোটস ডেটা ম্যানেজমেন্ট' : 'Notes Data Management';
            }

            const createBackupBtnModal = document.getElementById('createBackupBtnModal');
            if (createBackupBtnModal) {
                createBackupBtnModal.innerHTML = isBn ? 'ক্লাউডে ব্যাকআপ' : 'Backup to Cloud';
            }

            const exportNotesBtnModal = document.getElementById('exportNotesBtnModal');
            if (exportNotesBtnModal) {
                exportNotesBtnModal.innerHTML = isBn ? 'ফাইলে এক্সপোর্ট' : 'Export to File';
            }

            const importNotesBtnModal = document.getElementById('importNotesBtnModal');
            if (importNotesBtnModal) {
                importNotesBtnModal.innerHTML = isBn ? 'ফাইল থেকে ইম্পোর্ট' : 'Import from File';
            }

            // Admin Users Modal
            const adminUsersTitle = document.querySelector('#adminUsersModal h2');
            if (adminUsersTitle) {
                adminUsersTitle.textContent = isBn ? 'ইউজার ম্যানেজমেন্ট' : 'Manage Users';
            }

            // Notifications
            const notificationsTitle = document.querySelector('#notificationsSection h2');
            if (notificationsTitle) {
                notificationsTitle.textContent = isBn ? 'নোটিফিকেশন' : 'Notifications';
            }
            const createNotifBtn = document.getElementById('createNotificationBtn');
            if (createNotifBtn) {
                createNotifBtn.textContent = isBn ? '+ নোটিফিকেশন' : '+ New Notification';
            }
            const talibNotifBtn = document.getElementById('talibNotificationsBtn');
            if (talibNotifBtn) {
                talibNotifBtn.innerHTML = isBn ? '🔔 নোটিফিকেশন' : '🔔 Notifications';
            }
            const talibMessageBtn = document.getElementById('talibMessageAdminBtn');
            if (talibMessageBtn) {
                talibMessageBtn.innerHTML = isBn ? '💬 অ্যাডমিনকে মেসেজ করুন<span id="talibMessageAdminBadge" class="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full hide"></span>' : '💬 Message Admin<span id="talibMessageAdminBadge" class="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full hide"></span>';
            }
            
            // Update back button tooltips
            const backButtons = ['notificationsBackBtn', 'userMessagesBackBtn', 'adminMessagesBackBtn', 'notesBackBtn'];
            backButtons.forEach(btnId => {
                const btn = document.getElementById(btnId);
                if (btn) {
                    btn.title = isBn ? 'হোমে ফিরে যান' : 'Back to Home';
                }
            });
            
            const adminNotifBtn = document.getElementById('adminNotificationsBtn');
            if (adminNotifBtn) {
                adminNotifBtn.innerHTML = isBn ? '🔔 নোটিফিকেশন' : '🔔 Notifications';
            }

            // Role Confirmation Modals
            const roleConfirmTitle = document.querySelector('#roleConfirmModal h2');
            if (roleConfirmTitle) {
                roleConfirmTitle.textContent = isBn ? 'রোল পরিবর্তন নিশ্চিত করুন' : 'Confirm Role Change';
            }
            const roleConfirmText = document.querySelector('#roleConfirmModal p');
            if (roleConfirmText) {
                roleConfirmText.textContent = isBn ? 'আপনি কি নিশ্চিত যে আপনি এই ইউজারের রোল পরিবর্তন করতে চান?' : 'Are you sure you want to change this user\'s role?';
            }

            const roleConsequencesTitle = document.querySelector('#roleConsequencesModal h2');
            if (roleConsequencesTitle) {
                roleConsequencesTitle.textContent = isBn ? '⚠️ গুরুত্বপূর্ণ: ফলাফল বুঝুন' : '⚠️ Important: Understand the Consequences';
            }
        };

        const savedLang = localStorage.getItem('lang') || 'en';
        const isBn = savedLang === 'bn';
        toggle.checked = isBn;
        updateLanguage(isBn);


        toggle.addEventListener('change', () => {
            const newLang = toggle.checked ? 'bn' : 'en';
            localStorage.setItem('lang', newLang);
            updateLanguage(toggle.checked);
        });
    },

    setupMobileBackHandler() {
        // Handle back button on mobile devices
        if (typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform?.()) {
            const { App: CapApp } = window.Capacitor.Plugins;

            CapApp.addListener('backButton', () => {
                // Check if any modal is open
                const openModal = document.querySelector('.modal:not(.hide)');

                if (openModal) {
                    // Close the modal instead of exiting app
                    this.hideAllModals();
                } else if (this.state.notesEditMode) {
                    // In notes edit mode - exit to normal notes view
                    this.exitNotesEditMode();
                } else if (['notifications', 'userMessages', 'adminMessages', 'notes'].includes(this.state.activeSection)) {
                    // In special sections - go back to homepage
                    this.showSection('fund');
                    // Stop cooldown interval if leaving user messages
                    if (this.state.activeSection === 'userMessages' && window.MessagesModule.cooldownInterval) {
                        clearInterval(window.MessagesModule.cooldownInterval);
                    }
                } else {
                    // No modal open and not in special section - allow default back behavior (exit app)
                    CapApp.exitApp();
                }
            });
        } else {
            // For web: handle browser back button
            window.addEventListener('popstate', (event) => {
                const openModal = document.querySelector('.modal:not(.hide)');

                if (openModal) {
                    event.preventDefault();
                    this.hideAllModals();
                    // Push state back so we don't navigate away
                    history.pushState(null, '', window.location.href);
                } else if (this.state.notesEditMode) {
                    event.preventDefault();
                    this.exitNotesEditMode();
                    history.pushState(null, '', window.location.href);
                } else if (['notifications', 'userMessages', 'adminMessages', 'notes'].includes(this.state.activeSection)) {
                    event.preventDefault();
                    this.showSection('fund');
                    // Stop cooldown interval if leaving user messages
                    if (this.state.activeSection === 'userMessages' && window.MessagesModule.cooldownInterval) {
                        clearInterval(window.MessagesModule.cooldownInterval);
                    }
                    history.pushState(null, '', window.location.href);
                }
            });

            // Initial state push for web
            history.pushState(null, '', window.location.href);
        }
    }
};



// Start the application once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => App.init());