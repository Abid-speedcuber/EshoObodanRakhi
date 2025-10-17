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
// --- STATE ---
const state = {
    currentUser: null,
    userProfile: null, // { id, name, role }
    isAdmin: false,
    currentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // Start at current month
    allDonors: [],
    totalFund: 0,
    activeSection: 'blood',
    currentYear: new Date().getFullYear(),
    isLoading: {
        fund: false,
        donors: false,
        notices: false,
    },
    allFundData: [], // Store all fund data for offline access
    cachedMonthlyData: {}, // Store monthly aggregated data
};

// --- DOM ELEMENTS ---
const elements = {
    notification: document.getElementById('notification'),
    authBtn: document.getElementById('authBtn'),
    totalFundDisplay: document.getElementById('totalFundDisplay'),
    mainContent: document.getElementById('mainContent'),
    currentMonthDisplay: document.getElementById('currentMonthDisplay'),
    incomeList: document.getElementById('incomeList'),
    expenseList: document.getElementById('expenseList'),
    totalIncome: document.getElementById('totalIncome'),
    totalExpense: document.getElementById('totalExpense'),
    monthlyBalance: document.getElementById('monthlyBalance'),
    donorsList: document.getElementById('donorsList'),
    noticesList: document.getElementById('noticesList'),
    adminControls: document.getElementById('adminControls'),
    myDonorBtn: document.getElementById('myDonorBtn'),
    postNoticeBtn: document.getElementById('postNoticeBtn'),
    deleteDonorBtn: document.getElementById('deleteDonorBtn'),
    yearlyChart: document.getElementById('yearlyChart'),
    currentYearDisplay: document.getElementById('currentYearDisplay'),
};

// --- INITIALIZATION ---
async function init() {
    registerServiceWorker();
    bindEvents();
    setupScrollBehavior();

    // Load cached total fund immediately for offline support
    const cachedTotal = localStorage.getItem('totalFund');
    if (cachedTotal) {
        state.totalFund = parseFloat(cachedTotal);
        elements.totalFundDisplay.textContent = `৳ ${parseFloat(cachedTotal).toLocaleString()}`;
    }

    // Load cached fund data
    const cachedAllData = localStorage.getItem('allFundData');
    if (cachedAllData) {
        state.allFundData = JSON.parse(cachedAllData);
    }

    const cachedMonthly = localStorage.getItem('cachedMonthlyData');
    if (cachedMonthly) {
        state.cachedMonthlyData = JSON.parse(cachedMonthly);
    }

    // --- Setup Deep Link Listener for Mobile App ---
    if (typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform?.()) {
        const { App, Browser } = window.Capacitor.Plugins;

        App.addListener('appUrlOpen', async (data) => {
            console.log('App opened with URL:', data.url);

            try {
                await Browser.close();
            } catch (e) {
                // Browser might already be closed
            }

            const url = data.url;
            const hashIndex = url.indexOf('#');

            if (hashIndex !== -1) {
                const hash = url.substring(hashIndex);

                // Handle OAuth callback
                if (hash.includes('access_token')) {
                    try {
                        const params = new URLSearchParams(hash.substring(1));
                        const accessToken = params.get('access_token');
                        const refreshToken = params.get('refresh_token');

                        if (accessToken) {
                            const { data: sessionData, error } = await db.auth.setSession({
                                access_token: accessToken,
                                refresh_token: refreshToken
                            });

                            if (error) throw error;

                            await handleAuthStateChange();
                            hideAllModals();
                            showNotification('Login successful!');
                        }
                    } catch (err) {
                        console.error('OAuth error:', err);
                        showNotification('Login failed: ' + err.message, true);
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

                            showNotification('Please set your new password');
                            showModal('settingsModal');
                        }
                    } catch (err) {
                        console.error('Password reset error:', err);
                        showNotification('Password reset link invalid', true);
                    }
                }
            }
        });
    }

    // --- Finish OAuth redirect when user returns from Google (Web) ---
    (async () => {
        try {
            await db.auth.getSessionFromUrl({ storeSession: true });
        } catch (err) {
            // ignore: no session in URL or parsing failed
        }
        await handleAuthStateChange();
    })();

    setupLanguageToggle();

    // Show blood section by default (will be overridden for admins)
    showSection('blood');
}

// --- AUTHENTICATION ---
async function handleAuthStateChange() {
    const { data: { session } } = await db.auth.getSession();
    state.currentUser = session?.user || null;

    if (state.currentUser) {
        const { data, error } = await db.from('users').select('name, role').eq('id', state.currentUser.id).single();

        if (error && error.code === 'PGRST116') {
            // ignore missing profile
        }

        if (!data) {
            const profileName = (state.currentUser.user_metadata &&
                (state.currentUser.user_metadata.full_name || state.currentUser.user_metadata.name))
                || state.currentUser.email || 'User';
            const { error: insertError } = await db.from('users')
                .insert({ id: state.currentUser.id, name: profileName, role: 'user' });
            if (insertError) {
                console.error('Failed to create users profile:', insertError);
                state.userProfile = { id: state.currentUser.id, name: profileName, role: 'user' };
                state.isAdmin = false;
            } else {
                state.userProfile = { id: state.currentUser.id, name: profileName, role: 'user' };
                state.isAdmin = false;
            }
        } else {
            state.userProfile = { id: state.currentUser.id, ...data };
            state.isAdmin = data?.role === 'admin';
        }
    } else {
        state.userProfile = null;
        state.isAdmin = false;
    }

    updateUI();

    if (state.isAdmin) {
        showSection('fund');
    } else {
        showSection('blood');
    }

    loadDataForActiveSection();
    calculateTotalFund();
}

async function signup(name, emailOrPhone, password) {
    const isPhone = /^[\d+]/.test(emailOrPhone.trim());

    let signupResult;
    if (isPhone) {
        const phone = emailOrPhone.startsWith('+') ? emailOrPhone : `+88${emailOrPhone}`;
        signupResult = await db.auth.signUp({ phone, password });
    } else {
        signupResult = await db.auth.signUp({ email: emailOrPhone, password });
    }

    if (signupResult.error) {
        hideAllModals();
        return showNotification(signupResult.error.message, true);
    }

    const { error: profileError } = await db.from('users').insert({
        id: signupResult.data.user.id,
        name,
        role: 'user'
    });

    if (profileError) {
        hideAllModals();
        return showNotification(profileError.message, true);
    }

    hideAllModals();
    if (isPhone) {
        showNotification('Account created! Check your phone for OTP verification code.');
    } else {
        showNotification('Account created! Activate your account from the email we sent you through Supabase and then login with your credentials.');
    }
    setTimeout(() => showModal('loginModal'), 1000);
}

async function login(emailOrPhone, password) {
    const isPhone = /^[\d+]/.test(emailOrPhone.trim());

    let authResult;
    if (isPhone) {
        const phone = emailOrPhone.startsWith('+') ? emailOrPhone : `+88${emailOrPhone}`;
        authResult = await db.auth.signInWithPassword({ phone, password });
    } else {
        authResult = await db.auth.signInWithPassword({ email: emailOrPhone, password });
    }

    if (authResult.error) {
        hideAllModals();
        return showNotification(authResult.error.message, true);
    }
    hideAllModals();
    showNotification('Login successful!');
    handleAuthStateChange();
}

async function signInWithGoogle() {
    try {
        const isNative = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform?.();

        if (isNative) {
            const { data, error } = await db.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: 'com.eor.app://oauth',
                    skipBrowserRedirect: true
                }
            });

            if (error) {
                showNotification(error.message, true);
                return;
            }

            const { Browser } = window.Capacitor.Plugins;
            await Browser.open({ url: data.url, presentationStyle: 'popover' });

            showNotification('Redirecting to Google...');
        } else {
            const { error } = await db.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin }
            });

            if (error) {
                showNotification(error.message, true);
            } else {
                showNotification('Redirecting to Google for sign-in...');
            }
        }
    } catch (err) {
        console.error('Google sign-in error', err);
        showNotification('Google sign-in failed: ' + err.message, true);
    }
}

async function logout() {
    await db.auth.signOut();
    state.currentUser = null;
    state.userProfile = null;
    state.isAdmin = false;
    updateUI();
    loadDataForActiveSection();
    showNotification('Logged out successfully.');
}

function loadDataForActiveSection() {
    switch (state.activeSection) {
        case 'fund':
            loadFundData();
            break;
        case 'blood':
            loadDonors();
            break;
        case 'notices':
            loadNotices();
            break;
    }
}

async function calculateTotalFund() {
    let data = [];
    const { data: freshData, error } = await db.from('fund').select('type, amount');

    if (error || !freshData) {
        const cached = localStorage.getItem('allFundData');
        data = cached ? JSON.parse(cached) : [];
    } else {
        data = freshData;
        localStorage.setItem('allFundData', JSON.stringify(freshData));
        state.allFundData = freshData;
    }

    const total = data.reduce((acc, entry) => {
        if (entry.type === 'income') return acc + entry.amount;
        if (entry.type === 'expense') return acc - entry.amount;
        return acc;
    }, 0);

    state.totalFund = total;
    elements.totalFundDisplay.textContent = `৳ ${total.toLocaleString()}`;
    localStorage.setItem('totalFund', total.toString());
}

async function loadFundData() {
    if (state.isLoading.fund) return;
    state.isLoading.fund = true;
    renderLoader('fund');
    updateMonthDisplay();

    const monthKey = `${state.currentMonth.getFullYear()}-${String(state.currentMonth.getMonth() + 1).padStart(2, '0')}`;

    try {
        const { data: allData, error: allError } = await db.from('fund').select('*')
            .order('month', { ascending: true })
            .order('timestamp', { ascending: true });

        if (!allError && allData) {
            localStorage.setItem('allFundData', JSON.stringify(allData));
            state.allFundData = allData;

            const monthlyCache = {};
            allData.forEach(entry => {
                if (!monthlyCache[entry.month]) monthlyCache[entry.month] = [];
                monthlyCache[entry.month].push(entry);
            });

            localStorage.setItem('cachedMonthlyData', JSON.stringify(monthlyCache));
            state.cachedMonthlyData = monthlyCache;

            const monthData = allData.filter(d => d.month === monthKey);
            renderFundData(monthData);
        } else {
            throw new Error('Failed to fetch data');
        }
        await calculateNetWorth();
    } catch (err) {
        console.log('Loading from cache due to:', err);
        const allCached = JSON.parse(localStorage.getItem('allFundData') || '[]');
        const monthlyCache = JSON.parse(localStorage.getItem('cachedMonthlyData') || '{}');

        state.allFundData = allCached;
        state.cachedMonthlyData = monthlyCache;

        const monthData = monthlyCache[monthKey] || allCached.filter(d => d.month === monthKey);
        renderFundData(monthData);
        await calculateNetWorth();
    }
    state.isLoading.fund = false;
}

function renderFundData(data) {
    const income = data.filter(d => d.type === 'income');
    const expense = data.filter(d => d.type === 'expense');
    renderFundList(income, elements.incomeList, 'green');
    renderFundList(expense, elements.expenseList, 'red');
    updateFundTotals(income, expense);
}

async function loadDonors() {
    if (state.isLoading.donors) return;
    state.isLoading.donors = true;
    renderLoader('blood');

    try {
        const { data, error } = await db.from('donors').select('*').order('name');
        if (error) throw error;
        localStorage.setItem('donorsData', JSON.stringify(data));
        state.allDonors = data || [];
    } catch {
        state.allDonors = JSON.parse(localStorage.getItem('donorsData') || '[]');
    }

    state.allDonors = shuffleDonors(state.allDonors);
    filterAndRenderDonors();

    const promptMsg = document.getElementById('donorPromptMessage');
    if (promptMsg) {
        const isBn = localStorage.getItem('lang') === 'bn';
        if (state.isAdmin) {
            promptMsg.classList.add('hide');
        } else if (!state.currentUser) {
            promptMsg.classList.remove('hide');
            promptMsg.textContent = isBn
                ? 'ব্লাড ডোনার তালিকায় যুক্ত হতে লগইন করে আপনার ব্লাড ডোনার প্রোফাইল কমপ্লিট করুন'
                : 'To be a blood donor, login and complete your donor profile';
        } else {
            try {
                const { data } = await db.from('donors').select('*').eq('user_id', state.currentUser.id).single();
                if (!data) {
                    promptMsg.classList.remove('hide');
                    promptMsg.textContent = isBn
                        ? 'ব্লাড ডোনার হতে "আমার প্রোফাইল" ক্লিক করে আপনার ফোন নম্বর এবং লোকেশন যুক্ত করুন'
                        : 'To be a blood donor, click on "My Profile" and add your phone number and location.';
                } else {
                    promptMsg.classList.add('hide');
                }
            } catch {
                promptMsg.classList.remove('hide');
                promptMsg.textContent = isBn
                    ? 'ব্লাড ডোনার হতে "আমার প্রোফাইল" ক্লিক করে আপনার ফোন নম্বর এবং লোকেশন যুক্ত করুন'
                    : 'To be a blood donor, click on "My Profile" and add your phone number and location.';
            }
        }
    }

    state.isLoading.donors = false;
}

async function loadNotices() {
    if (state.isLoading.notices) return;
    state.isLoading.notices = true;
    renderLoader('notices');
    try {
        const { data, error } = await db.from('notices')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(20);
        if (error) throw error;
        localStorage.setItem('noticesData', JSON.stringify(data));
        renderNotices(data);
    } catch {
        const cached = JSON.parse(localStorage.getItem('noticesData') || '[]');
        renderNotices(cached);
    }
    state.isLoading.notices = false;
}

// --- UI & RENDERING ---
function updateUI() {
    document.getElementById('settingsBtn').classList.remove('hide');
    document.getElementById('loginTopBtn').classList.toggle('hide', state.currentUser);
    document.getElementById('loginBtn').classList.toggle('hide', state.currentUser);
    document.getElementById('logoutBtn').classList.toggle('hide', !state.currentUser);

    elements.adminControls.classList.toggle('hide', !state.isAdmin);

    if (state.isAdmin) {
        elements.myDonorBtn.classList.remove('hide');
        const isBn = localStorage.getItem('lang') === 'bn';
        elements.myDonorBtn.textContent = isBn ? '+ ডোনার প্রোফাইল যুক্ত করুন' : '+ Add Donor Profile';
        elements.myDonorBtn.onclick = async () => {
            await populateDonorForm();
            showModal('donorProfileModal');
        };
    } else {
        elements.myDonorBtn.classList.toggle('hide', !state.currentUser);
        updateMyProfileButtonText();
        elements.myDonorBtn.onclick = async () => {
            await populateDonorForm();
            showModal('donorProfileModal');
        };
    }

    elements.postNoticeBtn.classList.toggle('hide', !state.currentUser);
}

function updateMonthDisplay() {
    elements.currentMonthDisplay.textContent = state.currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
    elements.currentYearDisplay.textContent = state.currentYear;
}

function renderFundList(items, element, color) {
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
            <div class="bg-${color}-50 p-1.5 rounded-lg text-sm relative group" title="${formattedTime}">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <span class="font-semibold text-gray-600">${index + 1}.</span>
                        <span class="ml-2 ${textColor}">${item.name || item.description}</span>
                        ${color === 'red' ? `<div class="text-xs text-gray-500 mt-1">${formattedTime}</div>` : ''}
                    </div>
                    <div class="flex items-center gap-1">
                        <div class="font-bold text-${color}-700">৳ ${item.amount}</div>
                        ${state.isAdmin ? `
                            <button data-edit-fund="${item.id}" data-fund-type="${item.type}" class="ml-1 text-blue-500 hover:text-blue-700" style="width: 20px; height: 20px;"><img src="svgs/icon-edit.svg" style="width: 16px; height: 16px;"></button>
                            <button data-delete-fund="${item.id}" class="text-red-500 hover:text-red-700" style="width: 20px; height: 20px;"><img src="svgs/icon-delete.svg" style="width: 16px; height: 16px;"></button>
                        ` : ''}
                    </div>
                </div>
                ${color === 'green' ? `<div class="absolute left-0 top-full mt-1 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">${formattedTime}</div>` : ''}
            </div>
        `;
    }).join('');
}

function updateFundTotals(income, expense) {
    const totalIncome = income.reduce((sum, item) => sum + item.amount, 0);
    const totalExpense = expense.reduce((sum, item) => sum + item.amount, 0);
    const balance = totalIncome - totalExpense;

    elements.totalIncome.textContent = `৳ ${totalIncome}`;
    elements.totalExpense.textContent = `৳ ${totalExpense}`;
    elements.monthlyBalance.textContent = `৳ ${balance}`;
    elements.monthlyBalance.style.color = balance >= 0 ? 'var(--brand-green-dark)' : '#dc2626';
}

async function calculateNetWorth() {
    const currentMonthKey = `${state.currentMonth.getFullYear()}-${String(state.currentMonth.getMonth() + 1).padStart(2, '0')}`;
    let data = [];

    try {
        const { data: freshData, error } = await db.from('fund')
            .select('type, amount, month')
            .lte('month', currentMonthKey);
        if (!error && freshData) {
            data = freshData;
        } else {
            throw new Error('Network error');
        }
    } catch {
        const allCached = state.allFundData.length > 0
            ? state.allFundData
            : JSON.parse(localStorage.getItem('allFundData') || '[]');
        data = allCached.filter(entry => entry.month <= currentMonthKey);
    }

    const netWorth = data.reduce((acc, entry) => {
        if (entry.type === 'income') return acc + entry.amount;
        if (entry.type === 'expense') return acc - entry.amount;
        return acc;
    }, 0);

    const netWorthElement = document.getElementById('netWorth');
    if (netWorthElement) {
        netWorthElement.textContent = `৳ ${netWorth.toLocaleString()}`;
        netWorthElement.style.color = netWorth >= 0 ? '#2563eb' : '#dc2626';
    }
}

function highlightMatch(text, searchTerm) {
    if (!searchTerm || !text) return text;
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark style="background-color: #fef08a; padding: 2px 0;">$1</mark>');
}

function filterAndRenderDonors() {
    const filterValue = document.getElementById('bloodFilter').value;
    const searchValue = document.getElementById('bloodSearch').value.trim().toLowerCase();

    let filteredDonors = state.allDonors;

    if (!searchValue && filterValue !== 'all') {
        filteredDonors = filteredDonors.filter(d => d.blood_group === filterValue);
    }

    if (searchValue) {
        filteredDonors = filteredDonors.filter(d => {
            const name = (d.name || '').toLowerCase();
            const phone = (d.phone || '').toLowerCase();
            const location = (d.location || '').toLowerCase();
            const bloodGroup = (d.blood_group || '').toLowerCase();
            return name.includes(searchValue) || phone.includes(searchValue) || location.includes(searchValue) || bloodGroup.includes(searchValue);
        });
    }

    if (!searchValue) {
        filteredDonors = shuffleDonors(filteredDonors);
    }

    if (filteredDonors.length === 0) {
        elements.donorsList.innerHTML = `<div class="text-gray-400 text-center py-8">No donors found</div>`;
        return;
    }

    const isBn = localStorage.getItem('lang') === 'bn';
    elements.donorsList.innerHTML = filteredDonors.map(donor => {
        const isAdminProfile = donor.created_by_admin;
        const availableClass = donor.available ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-300';
        const availableText = donor.available ? (isBn ? '✔অ্যাভেইলেবল' : '✔ Available') : (isBn ? '✖ অ্যাভেইলেবল নয়' : '✖ Not Available');
        const nameColor = isAdminProfile ? 'text-gray-500' : 'text-gray-800';

        const searchVal = document.getElementById('bloodSearch').value.trim().toLowerCase();
        const highlightedName = searchVal ? highlightMatch(donor.name, searchVal) : donor.name;
        const highlightedLocation = searchVal ? highlightMatch(donor.location || 'N/A', searchVal) : (donor.location || 'N/A');
        const highlightedPhone = searchVal ? highlightMatch(donor.phone || 'N/A', searchVal) : (donor.phone || 'N/A');
        const highlightedBloodGroup = searchVal ? highlightMatch(donor.blood_group, searchVal) : donor.blood_group;

        return `
<div class="bg-white rounded-xl shadow-lg p-3 border-l-4 ${availableClass}">
    <div class="flex justify-between items-start mb-2">
        <div>
            <div class="flex items-center">
                <h3 class="font-bold text-lg ${nameColor}">${highlightedName}${!donor.available ? ' <span class="text-sm font-normal text-gray-500">(not available)</span>' : ''}</h3>
            </div>
            <div class="text-sm text-gray-600 flex items-center gap-1"><img src="svgs/icon-location.svg"> ${highlightedLocation}</div>
        </div>
        <div class="text-2xl font-bold text-red-600">${highlightedBloodGroup}</div>
    </div>
    <div class="flex items-center justify-between">
        <a href="tel:${donor.phone}" class="text-sm text-gray-700 hover:text-blue-600 flex items-center gap-1"><img src="svgs/icon-call.svg"> ${highlightedPhone}</a>
        <div class="flex gap-1">
            <button class="copy-phone-btn text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition" data-phone="${donor.phone}"><img src="svgs/icon-copy.svg"></button>
            ${state.isAdmin ? `<button class="edit-donor-btn text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition" data-donor-id="${donor.id}"><img src="svgs/icon-edit.svg"></button>` : ''}
        </div>
    </div>
</div>`;
    }).join('');

    document.querySelectorAll('.copy-phone-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            navigator.clipboard.writeText(btn.dataset.phone).then(() => showNotification('Copied!'));
        });
    });

    document.querySelectorAll('.edit-donor-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const donorId = btn.dataset.donorId;
            await populateDonorForm(donorId);
            showModal('donorProfileModal');
        });
    });
}

function renderNotices(notices) {
    if (notices.length === 0) {
        const isBn = localStorage.getItem('lang') === 'bn';
        const noActivitiesText = isBn ? 'কোনো কার্যক্রম নেই' : 'No activities yet';
        elements.noticesList.innerHTML = `<div class="text-gray-400 text-center py-8">${noActivitiesText}</div>`;
        return;
    }

    elements.noticesList.innerHTML = notices.map(notice => {
        const bdTime = new Date(new Date(notice.timestamp).getTime() + (6 * 60 * 60 * 1000));
        const formattedTime = bdTime.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
        return `
            <div class="bg-white rounded-xl shadow-lg p-4">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center">
                        <div class="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-bold mr-3">
                            ${notice.author_name ? notice.author_name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                            <div class="font-bold text-gray-800">${notice.author_name || 'Anonymous'}</div>
                            <div class="text-xs text-gray-500">${formattedTime}</div>
                        </div>
                    </div>
                    ${state.isAdmin ? `
                        <div class="flex gap-1">
                            <button class="edit-notice-btn text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition" data-notice-id="${notice.id}">
                                <img src="svgs/icon-edit.svg" style="width: 16px; height: 16px;">
                            </button>
                            <button class="bump-notice-btn text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 transition" data-notice-id="${notice.id}" title="Bump to top"><img src="svgs/icon-bump.svg"></button>
                            <button class="delete-notice-btn text-xs bg-red-100 text-red-700 px-2 py-1 rounded hover:bg-red-200 transition" data-notice-id="${notice.id}">
                                <img src="svgs/icon-delete.svg" style="width: 16px; height: 16px;">
                            </button>
                        </div>
                    ` : ''}
                </div>
                <p class="text-gray-700 whitespace-pre-wrap">${notice.text || ''}</p>
            </div>
        `;
    }).join('');

    // Bind event listeners for admin actions
    if (state.isAdmin) {
        document.querySelectorAll('.edit-notice-btn').forEach(btn => {
            btn.addEventListener('click', () => editNotice(btn.dataset.noticeId));
        });
        document.querySelectorAll('.bump-notice-btn').forEach(btn => {
            btn.addEventListener('click', () => bumpNotice(btn.dataset.noticeId));
        });
        document.querySelectorAll('.delete-notice-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteNotice(btn.dataset.noticeId));
        });
    }
}

async function loadYearlyChartData() {
    const year = state.currentYear;
    let data = [];

    try {
        const { data: freshData, error } = await db.from('fund')
            .select('*')
            .gte('month', `${year}-01`)
            .lte('month', `${year}-12`);

        if (error) throw error;
        data = freshData;
    } catch (err) {
        console.log('Loading chart from cache:', err);
        const allCached = state.allFundData.length > 0
            ? state.allFundData
            : JSON.parse(localStorage.getItem('allFundData') || '[]');

        data = allCached.filter(entry => {
            const entryYear = parseInt(entry.month.split('-')[0]);
            return entryYear === year;
        });
    }

    if (!data || data.length === 0) {
        console.log('No data available for year:', year);
        const canvas = elements.yearlyChart;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#6b7280';
            ctx.font = '20px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('No data available for this year', canvas.width / 2, canvas.height / 2);
        }
        return;
    }

    const monthlyIncome = new Array(12).fill(0);
    const monthlyExpense = new Array(12).fill(0);
    const monthlyBalance = new Array(12).fill(0);

    data.forEach(entry => {
        const monthIndex = parseInt(entry.month.split('-')[1]) - 1;
        if (entry.type === 'income') {
            monthlyIncome[monthIndex] += entry.amount;
        } else if (entry.type === 'expense') {
            monthlyExpense[monthIndex] += entry.amount;
        }
    });

    let cumulativeBalance = 0;
    const { data: previousData } = await db.from('fund').select('type, amount').lt('month', `${year}-01`);
    if (previousData) {
        cumulativeBalance = previousData.reduce((acc, entry) =>
            entry.type === 'income' ? acc + entry.amount : acc - entry.amount, 0);
    }

    for (let i = 0; i < 12; i++) {
        cumulativeBalance += monthlyIncome[i] - monthlyExpense[i];
        monthlyBalance[i] = cumulativeBalance;
    }

    renderYearlyChart(monthlyIncome, monthlyExpense, monthlyBalance);
}

function renderYearlyChart(income, expense, balance) {
    const canvas = elements.yearlyChart;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    chartData = { income, expense, balance };

    const width = canvas.width;
    const height = canvas.height;
    const padding = 80;
    const rightPadding = 50;
    const chartWidth = width - padding - rightPadding;
    const chartHeight = height - padding - 50;

    ctx.clearRect(0, 0, width, height);

    const actualMaxValue = Math.max(...income, ...expense, ...balance.map(Math.abs));
    const actualMinValue = Math.min(0, ...balance);
    const maxValue = actualMaxValue * 1.1;
    const minValue = actualMinValue * 1.1;
    const range = maxValue - minValue;

    const getY = value => padding + chartHeight - ((value - minValue) / range) * chartHeight;
    const getX = index => padding + (index / 11) * chartWidth;

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
        const y = padding + (i / 5) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(padding + chartWidth, y);
        ctx.stroke();
    }

    if (minValue < 0) {
        ctx.strokeStyle = '#9ca3af';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const zeroY = getY(0);
        ctx.moveTo(padding, zeroY);
        ctx.lineTo(padding + chartWidth, zeroY);
        ctx.stroke();
    }

    const drawLine = (data, color, lineWidth = 2) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        data.forEach((value, i) => {
            const x = getX(i);
            const y = getY(value);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.fillStyle = color;
        data.forEach((value, i) => {
            const x = getX(i);
            const y = getY(value);
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
    };

    drawLine(income, '#10b981', 3);
    drawLine(expense, '#ef4444', 3);
    drawLine(balance, '#3b82f6', 3);

    ctx.fillStyle = '#6b7280';
    ctx.font = 'bold 20px system-ui';
    ctx.textAlign = 'center';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    months.forEach((month, i) => {
        const x = padding + (i / 11) * chartWidth;
        ctx.fillText(month, x, height - 50 + 20);
    });

    ctx.textAlign = 'right';
    ctx.font = 'bold 18px system-ui';
    for (let i = 0; i <= 5; i++) {
        const value = minValue + (range * i / 5);
        const y = padding + chartHeight - (i / 5) * chartHeight;
        ctx.fillText(Math.round(value).toLocaleString(), padding - 10, y + 4);
    }

    const handleClick = (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const scaledX = mouseX * scaleX;
        const scaledY = mouseY * scaleY;

        let clickedPoint = null;
        let minDistance = 40;

        [income, expense, balance].forEach((data, dataIndex) => {
            data.forEach((value, i) => {
                const x = getX(i);
                const y = getY(value);
                const distance = Math.sqrt((scaledX - x) ** 2 + (scaledY - y) ** 2);
                if (distance < minDistance) {
                    minDistance = distance;
                    const labels = ['Collection', 'Sadakah', 'Total Fund'];
                    const labelsBn = ['কালেকশন', 'সাদাকাহ', 'ফান্ডে মোট অর্থ'];
                    const isBn = localStorage.getItem('lang') === 'bn';
                    clickedPoint = {
                        x, y, value,
                        label: isBn ? labelsBn[dataIndex] : labels[dataIndex],
                        month: months[i]
                    };
                }
            });
        });

        canvas.clickedPoint = clickedPoint;
        renderYearlyChart(income, expense, balance);

        if (clickedPoint) {
            ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
            ctx.beginPath();
            ctx.arc(clickedPoint.x, clickedPoint.y, 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.beginPath();
            ctx.arc(clickedPoint.x, clickedPoint.y, 5, 0, Math.PI * 2);
            ctx.fill();

            const tooltipText = `${clickedPoint.month}: ৳ ${Math.round(clickedPoint.value).toLocaleString()}`;
            const tooltipWidth = ctx.measureText(tooltipText).width + 20;
            const tooltipHeight = 30;
            let tooltipX = clickedPoint.x - tooltipWidth / 2;
            let tooltipY = clickedPoint.y - 40;

            if (tooltipX < 10) tooltipX = 10;
            if (tooltipX + tooltipWidth > width - 10) tooltipX = width - tooltipWidth - 10;
            if (tooltipY < 10) tooltipY = clickedPoint.y + 20;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
            ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 16px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(tooltipText, tooltipX + tooltipWidth / 2, tooltipY + 20);
            ctx.fillStyle = '#10b981';
            ctx.font = '12px system-ui';
            ctx.fillText(clickedPoint.label, tooltipX + tooltipWidth / 2, tooltipY + tooltipHeight + 15);
        }
    };

    const oldClick = canvas.clickHandler;
    if (oldClick) canvas.removeEventListener('click', oldClick);
    canvas.clickHandler = handleClick;
    canvas.addEventListener('click', handleClick);
    canvas.style.cursor = 'pointer';
}

function changeYear(delta) {
    state.currentYear += delta;
    if (state.currentYear < 2017) state.currentYear = 2017;
    if (state.currentYear > new Date().getFullYear()) state.currentYear = new Date().getFullYear();

    elements.currentYearDisplay.textContent = state.currentYear;
    loadYearlyChartData();
}

function renderLoader(section) {
    const sectionMap = {
        fund: [elements.incomeList, elements.expenseList],
        blood: [elements.donorsList],
        notices: [elements.noticesList]
    };
    sectionMap[section].forEach(el => el.innerHTML = '<div class="loader"></div>');
}

function convertBengaliToEnglishNumber(input) {
    const bengaliDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    let result = input;
    bengaliDigits.forEach((bn, i) => {
        result = result.replace(new RegExp(bn, 'g'), englishDigits[i]);
    });
    return result;
}

function bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => showSection(btn.dataset.section));
    });
    updateActiveTab();
    document.getElementById('refreshBtn').addEventListener('click', () => refreshApp());
    document.getElementById('settingsBtn').addEventListener('click', () => showModal('settingsModal'));
    document.getElementById('loginTopBtn').addEventListener('click', () => showModal('loginModal'));
    document.getElementById('loginBtn').addEventListener('click', () => showModal('loginModal'));
    document.getElementById('logoutBtn').addEventListener('click', () => logout());

    const googleBtn = document.getElementById('googleLoginBtn');
    if (googleBtn) {
        googleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            signInWithGoogle();
        });
    }

    // Modals
    document.getElementById('showSignupBtn').addEventListener('click', () => showModal('signupModal'));
    document.getElementById('showLoginBtn').addEventListener('click', () => showModal('loginModal'));
    document.getElementById('forgotPasswordBtn').addEventListener('click', () => showModal('forgotPasswordModal'));
    document.getElementById('backToLoginBtn').addEventListener('click', () => showModal('loginModal'));

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
            if (btn.dataset.modal === 'donorProfileModal' && btn.id !== 'myDonorBtn') await populateDonorForm();

            if (btn.dataset.modal === 'addIncomeModal') {
                const isBn = localStorage.getItem('lang') === 'bn';
                document.getElementById('incomeId').value = '';
                document.querySelector('#addIncomeModal h2').textContent = isBn ? 'কালেকশন যুক্ত করুন' : 'Add Collection';
                document.querySelector('#addIncomeForm button[type="submit"]').textContent = isBn ? 'যুক্ত করুন' : 'Add';
                document.getElementById('addIncomeForm').reset();
            }

            if (btn.dataset.modal === 'addExpenseModal') {
                const isBn = localStorage.getItem('lang') === 'bn';
                document.getElementById('expenseId').value = '';
                document.querySelector('#addExpenseModal h2').textContent = isBn ? 'সাদাকাহ যুক্ত করুন' : 'Add Sadakah';
                document.querySelector('#addExpenseForm button[type="submit"]').textContent = isBn ? 'যুক্ত করুন' : 'Add';
                document.getElementById('addExpenseForm').reset();
            }

            showModal(btn.dataset.modal);
        });
    });
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => hideAllModals());
    });

    // Forms
    document.getElementById('signupForm').addEventListener('submit', e => {
        e.preventDefault();
        const name = e.target.elements.signupName.value.trim();
        const emailOrPhone = e.target.elements.signupEmail.value.trim();
        const pass = e.target.elements.signupPassword.value;
        const confirmPass = e.target.elements.signupConfirmPassword.value;

        if (!name) {
            hideAllModals();
            return showNotification('Please enter your full name', true);
        }
        if (pass.length < 6) {
            hideAllModals();
            return showNotification('Password must be at least 6 characters long', true);
        }
        if (pass !== confirmPass) {
            hideAllModals();
            return showNotification('Passwords do not match', true);
        }
        signup(name, emailOrPhone, pass);
    });

    document.getElementById('loginForm').addEventListener('submit', e => {
        e.preventDefault();
        const emailOrPhone = e.target.elements.loginEmail.value.trim();
        const password = e.target.elements.loginPassword.value;
        if (!emailOrPhone || !password) {
            hideAllModals();
            return showNotification('Please enter both email/phone and password', true);
        }
        login(emailOrPhone, password);
    });

    document.getElementById('forgotPasswordForm').addEventListener('submit', async e => {
        e.preventDefault();
        const email = e.target.elements.forgotEmail.value.trim();
        if (!email) {
            hideAllModals();
            return showNotification('Please enter your email', true);
        }
        const isNative = typeof window.Capacitor !== 'undefined';
        const redirectTo = isNative ? 'com.eor.app://reset-password' : window.location.origin;
        const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) {
            hideAllModals();
            return showNotification(error.message, true);
        }
        hideAllModals();
        showNotification('Password reset link sent to your email!');
        e.target.reset();
    });

    document.getElementById('addIncomeForm').addEventListener('submit', async e => {
        e.preventDefault();
        const incomeId = document.getElementById('incomeId').value;
        const name = e.target.elements.incomeName.value;
        const amountInput = convertBengaliToEnglishNumber(e.target.elements.incomeAmount.value);
        const amount = parseFloat(amountInput);
        const highlighted = e.target.elements.incomeHighlighted.checked;

        if (incomeId) {
            await updateFundEntry(incomeId, { name, amount, highlighted });
        } else {
            await addFundEntry('income', { name, amount, highlighted });
        }
        e.target.reset();
        document.getElementById('incomeId').value = '';
    });

    document.getElementById('addExpenseForm').addEventListener('submit', async e => {
        e.preventDefault();
        const expenseId = document.getElementById('expenseId').value;
        const description = e.target.elements.expenseDesc.value;
        const amountInput = convertBengaliToEnglishNumber(e.target.elements.expenseAmount.value);
        const amount = parseFloat(amountInput);
        const highlighted = e.target.elements.expenseHighlighted.checked;

        if (expenseId) {
            await updateFundEntry(expenseId, { description, amount, highlighted });
        } else {
            await addFundEntry('expense', { description, amount, highlighted });
        }
        e.target.reset();
        document.getElementById('expenseId').value = '';
    });

    document.getElementById('postNoticeForm').addEventListener('submit', async e => {
        e.preventDefault();
        const text = e.target.elements.noticeText.value.trim();
        const noticeId = document.getElementById('noticeId').value;
        if (!text) return showNotification('Please add some text.', true);

        if (noticeId) {
            const { error } = await db.from('notices').update({ text }).eq('id', parseInt(noticeId));
            if (error) return showNotification(error.message, true);
            showNotification('Activity updated!');
        } else {
            const { error } = await db.from('notices').insert({
                text,
                author_name: state.userProfile.name,
                author_id: state.currentUser.id
            });
            if (error) return showNotification(error.message, true);
            showNotification('Activity posted!');
        }

        hideAllModals();
        loadNotices();
        e.target.reset();
        document.getElementById('noticeId').value = '';
    });

    document.getElementById('donorProfileForm').addEventListener('submit', async e => {
        e.preventDefault();
        const donorId = document.getElementById('donorId').value;
        const profile = {
            name: e.target.elements.donorName.value,
            phone: e.target.elements.donorPhone.value,
            blood_group: e.target.elements.donorBloodGroup.value,
            location: e.target.elements.donorLocation.value,
            available: e.target.elements.donorAvailable.checked,
        };

        if (donorId) {
            const { error } = await db.from('donors').update(profile).eq('id', parseInt(donorId));
            if (error) return showNotification(error.message, true);
        } else {
            profile.user_id = state.isAdmin ? null : state.currentUser.id;
            profile.created_by_admin = state.isAdmin;
            const { error } = await db.from('donors').insert(profile);
            if (error) return showNotification(error.message, true);
        }

        showNotification('Profile saved!');
        hideAllModals();
        loadDonors();
    });

    elements.deleteDonorBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to delete this donor profile?')) return;
        const donorId = document.getElementById('donorId').value;
        if (!donorId) return;
        const { error } = await db.from('donors').delete().eq('id', parseInt(donorId));
        if (error) return showNotification(error.message, true);
        showNotification('Profile deleted.');
        hideAllModals();
        loadDonors();
    });

    document.getElementById('prevMonthBtn').addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonthBtn').addEventListener('click', () => changeMonth(1));
    document.getElementById('prevYearBtn').addEventListener('click', () => changeYear(-1));
    document.getElementById('nextYearBtn').addEventListener('click', () => changeYear(1));
    elements.mainContent.addEventListener('click', e => {
        if (e.target.dataset.deleteFund) deleteFundEntry(e.target.dataset.deleteFund);
        if (e.target.dataset.editFund) editFundEntry(e.target.dataset.editFund, e.target.dataset.fundType);
        if (e.target.tagName === 'IMG' && e.target.parentElement.dataset.deleteFund)
            deleteFundEntry(e.target.parentElement.dataset.deleteFund);
        if (e.target.tagName === 'IMG' && e.target.parentElement.dataset.editFund)
            editFundEntry(e.target.parentElement.dataset.editFund, e.target.parentElement.dataset.fundType);
    });

    document.getElementById('bloodFilter').addEventListener('change', () => {
        state.allDonors = shuffleDonors(state.allDonors);
        filterAndRenderDonors();
    });

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

    document.getElementById('bloodSearch').addEventListener('input', () => {
        filterAndRenderDonors();
    });

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
                filterAndRenderDonors();
            }, 200);
        }
    });

    document.getElementById('bloodClearBtn').addEventListener('click', () => {
        const searchInput = document.getElementById('bloodSearch');
        searchInput.value = '';
        searchInput.focus();
        filterAndRenderDonors();
    });

    document.getElementById('showYearlyChartBtn').addEventListener('click', () => {
        showModal('yearlyChartModal');
        loadYearlyChartData();
    });

    document.getElementById('totalFundBtn').addEventListener('click', () => showCompleteHistory());
    document.getElementById('copyIncomeBtn').addEventListener('click', () => copyIncomeList());
    document.getElementById('copyHistoryBtn').addEventListener('click', () => copyCompleteHistory());
}

async function updateFundEntry(id, details) {
    const { error } = await db.from('fund').update(details).eq('id', parseInt(id));
    if (error) {
        showNotification(error.message, true);
    } else {
        showNotification('Entry updated successfully.');
        hideAllModals();
        loadFundData();
        calculateTotalFund();
    }
}

async function editFundEntry(id, type) {
    const { data, error } = await db.from('fund').select('*').eq('id', parseInt(id)).single();
    if (error) return showNotification(error.message, true);

    const isBn = localStorage.getItem('lang') === 'bn';

    if (type === 'income') {
        document.getElementById('incomeId').value = id;
        document.getElementById('incomeName').value = data.name || '';
        document.getElementById('incomeAmount').value = data.amount || '';
        document.getElementById('incomeHighlighted').checked = data.highlighted || false;

        const modalTitle = document.querySelector('#addIncomeModal h2');
        modalTitle.textContent = isBn ? 'কালেকশন এডিট করুন' : 'Edit Collection';

        const submitBtn = document.querySelector('#addIncomeForm button[type="submit"]');
        submitBtn.textContent = isBn ? 'আপডেট করুন' : 'Update';

        showModal('addIncomeModal');
    } else if (type === 'expense') {
        document.getElementById('expenseId').value = id;
        document.getElementById('expenseDesc').value = data.description || '';
        document.getElementById('expenseAmount').value = data.amount || '';
        document.getElementById('expenseHighlighted').checked = data.highlighted || false;

        const modalTitle = document.querySelector('#addExpenseModal h2');
        modalTitle.textContent = isBn ? 'সাদাকাহ এডিট করুন' : 'Edit Sadakah';

        const submitBtn = document.querySelector('#addExpenseForm button[type="submit"]');
        submitBtn.textContent = isBn ? 'আপডেট করুন' : 'Update';

        showModal('addExpenseModal');
    }
}

async function addFundEntry(type, details) {
    const monthKey = `${state.currentMonth.getFullYear()}-${String(state.currentMonth.getMonth() + 1).padStart(2, '0')}`;
    const { error } = await db.from('fund').insert({
        ...details,
        month: monthKey,
        type: type,
        updated_by: state.currentUser.id
    });

    if (error) {
        showNotification(error.message, true);
    } else {
        showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} added successfully.`);
        hideAllModals();
        loadFundData();
        calculateTotalFund();
    }
}

async function deleteFundEntry(id) {
    if (!state.isAdmin || !confirm('Are you sure you want to delete this entry?')) return;
    const { error } = await db.from('fund').delete().eq('id', id);
    if (error) {
        showNotification(error.message, true);
    } else {
        showNotification('Entry deleted.');
        loadFundData();
        calculateTotalFund();
    }
}

async function editNotice(noticeId) {
    const { data, error } = await db.from('notices').select('*').eq('id', parseInt(noticeId)).single();
    if (error) return showNotification(error.message, true);

    document.getElementById('noticeId').value = noticeId;
    document.getElementById('noticeText').value = data.text || '';

    const modalTitle = document.querySelector('#postNoticeModal h2');
    const isBn = localStorage.getItem('lang') === 'bn';
    modalTitle.textContent = isBn ? 'কার্যক্রম এডিট করুন' : 'Edit Activity';

    const submitBtn = document.querySelector('#postNoticeForm button[type="submit"]');
    submitBtn.textContent = isBn ? 'আপডেট করুন' : 'Update';

    showModal('postNoticeModal');
}

async function bumpNotice(noticeId) {
    if (!confirm('Bump this activity to the top? (Original timestamp will be kept)')) return;

    const { data, error } = await db.from('notices').select('*').eq('id', parseInt(noticeId)).single();
    if (error) return showNotification(error.message, true);

    const { error: deleteError } = await db.from('notices').delete().eq('id', parseInt(noticeId));
    if (deleteError) return showNotification(deleteError.message, true);

    const { error: insertError } = await db.from('notices').insert({
        text: data.text,
        author_name: data.author_name,
        author_id: data.author_id,
        timestamp: data.timestamp
    });

    if (insertError) return showNotification(insertError.message, true);

    showNotification('Activity bumped to top!');
    loadNotices();
}

async function deleteNotice(noticeId) {
    if (!confirm('Are you sure you want to delete this activity?')) return;

    const { error } = await db.from('notices').delete().eq('id', parseInt(noticeId));
    if (error) return showNotification(error.message, true);

    showNotification('Activity deleted.');
    loadNotices();
}

async function populateDonorForm(donorId = null) {
    const form = document.getElementById('donorProfileForm');
    form.reset();
    elements.deleteDonorBtn.classList.add('hide');
    document.getElementById('donorId').value = '';

    if (donorId) {
        // Admin editing someone else's profile
        const { data } = await db.from('donors').select('*').eq('id', donorId).single();
        if (data) {
            form.elements.donorName.value = data.name || '';
            form.elements.donorPhone.value = data.phone || '';
            form.elements.donorBloodGroup.value = data.blood_group || '';
            form.elements.donorLocation.value = data.location || '';
            form.elements.donorAvailable.checked = data.available;
            document.getElementById('donorId').value = donorId;
            elements.deleteDonorBtn.classList.remove('hide');
        }
    } else if (state.currentUser && !state.isAdmin) {
        // Regular user editing their own profile
        const { data } = await db.from('donors').select('*').eq('user_id', state.currentUser.id).single();
        if (data) {
            form.elements.donorName.value = data.name || '';
            form.elements.donorPhone.value = data.phone || '';
            form.elements.donorBloodGroup.value = data.blood_group || '';
            form.elements.donorLocation.value = data.location || '';
            form.elements.donorAvailable.checked = data.available;
            document.getElementById('donorId').value = data.id;
            elements.deleteDonorBtn.classList.remove('hide');
        } else {
            form.elements.donorName.value = state.userProfile?.name || '';
        }
    }
}

function changeMonth(delta) {
    state.currentMonth.setMonth(state.currentMonth.getMonth() + delta);
    // Prevent going before June 2017
    if (state.currentMonth < new Date(2017, 5, 1)) {
        state.currentMonth = new Date(2017, 5, 1);
    }
    // Prevent going beyond current month
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    if (state.currentMonth > currentMonthStart) {
        state.currentMonth = currentMonthStart;
    }
    loadFundData();
}

function showSection(sectionId) {
    state.activeSection = sectionId;
    document.querySelectorAll('.section').forEach(s => s.classList.add('hide'));
    const section = document.getElementById(`${sectionId}Section`);
    if (section) {
        section.classList.remove('hide');
        section.classList.add('fade-in');
    }
    updateActiveTab();
    loadDataForActiveSection();
}

function updateActiveTab() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.dataset.section === state.activeSection) {
            btn.classList.add('bg-emerald-100', 'border-2', 'border-emerald-500');
            btn.classList.remove('bg-white');
        } else {
            btn.classList.remove('bg-emerald-100', 'border-2', 'border-emerald-500');
            btn.classList.add('bg-white');
        }
    });
}

function showModal(modalId) {
    hideAllModals();
    const modal = document.getElementById(modalId);
    if (modal) {
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.documentElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);

        modal.classList.remove('hide');
        document.body.classList.add('modal-open');

        setTimeout(() => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    hideAllModals();
                }
            });
        }, 0);
    }
}

function hideAllModals() {
    document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hide'));
    document.body.classList.remove('modal-open');
    document.documentElement.style.setProperty('--scrollbar-width', '0px');
}

function showNotification(message, isError = false) {
    const el = elements.notification;
    el.textContent = message;
    el.className = isError ? 'error' : 'success';
    el.classList.remove('hide');
    setTimeout(() => el.classList.add('hide'), 3000);
}

// --- COPY INCOME LIST ---
async function copyIncomeList() {
    const monthKey = `${state.currentMonth.getFullYear()}-${String(state.currentMonth.getMonth() + 1).padStart(2, '0')}`;
    const { data, error } = await db
        .from('fund')
        .select('*')
        .eq('month', monthKey)
        .eq('type', 'income')
        .order('timestamp', { ascending: true });

    if (error || !data || data.length === 0) {
        return showNotification('No collection data to copy', true);
    }

    // Get current date in Bangladesh time (UTC+6)
    const now = new Date();
    const bdTime = new Date(now.getTime() + (6 * 60 * 60 * 1000));
    const monthName = bdTime.toLocaleString('en-US', { month: 'long' });
    const date = bdTime.getDate();

    const dateHeader = `আজ ${monthName} এর ${date} তারিখ:\n\n`;
    const collectionList = data.map((item, index) => `${index + 1}. ${item.name}- ${item.amount} tk`).join('\n');

    let text = dateHeader + collectionList;

    // Only add admin suffix if user is admin
    if (state.isAdmin) {
        text += '\n\nঅনেক ভাইরা বাকি, আমরা আল্লাহর জন্য নিয়াত করি দেওয়ার ভাইরা। এই কাজ গুলোতো আপনাদের সদাকার মাধ্যমে হচ্ছে আল্লাহর তৌফিকে। \n+880 1937-222273 - nogod \n+880 1515-214867 - bkash\n\nআমাদের ফান্ডের ওয়েবসাইট লিংকঃ eshoobodanrakhi.web.app';
    }

    try {
        await navigator.clipboard.writeText(text);
        showNotification('Collection list copied to clipboard!');
    } catch (err) {
        showNotification('Failed to copy to clipboard', true);
    }
}

// --- SHOW COMPLETE HISTORY ---
async function showCompleteHistory() {
    showModal('completeHistoryModal');
    const content = document.getElementById('completeHistoryContent');
    const modeToggle = document.getElementById('historyModeToggle');
    const isBn = localStorage.getItem('lang') === 'bn';
    let isYearlyBrief = true;

    modeToggle.textContent = isBn ? 'সংক্ষিপ্ত' : 'Yearly Brief';
    content.innerHTML = '<div class="loader"></div>';

    let data = [];

    try {
        const { data: freshData, error } = await db
            .from('fund')
            .select('*')
            .order('month', { ascending: true })
            .order('timestamp', { ascending: true });

        if (error) throw error;
        data = freshData;

        // Update cache
        localStorage.setItem('allFundData', JSON.stringify(freshData));
        state.allFundData = freshData;
    } catch (err) {
        console.log('Loading history from cache:', err);
        data = state.allFundData.length > 0
            ? state.allFundData
            : JSON.parse(localStorage.getItem('allFundData') || '[]');
    }

    if (!data || data.length === 0) {
        content.innerHTML = '<div style="color: #9ca3af; text-align: center; padding: 2rem;">কোনো তথ্য নেই</div>';
        return;
    }

    modeToggle.addEventListener('click', () => {
        isYearlyBrief = !isYearlyBrief;
        const isBn = localStorage.getItem('lang') === 'bn';
        if (isYearlyBrief) {
            modeToggle.textContent = isBn ? 'সংক্ষিপ্ত' : 'Yearly Brief';
            modeToggle.classList.remove('bg-gray-600');
            modeToggle.classList.add('bg-blue-600');
        } else {
            modeToggle.textContent = isBn ? 'বিস্তারিত' : 'Elaborate';
            modeToggle.classList.remove('bg-blue-600');
            modeToggle.classList.add('bg-gray-600');
        }
        renderHistory(isYearlyBrief);
    });

    function renderHistory(isYearlyBrief) {
        const monthlyData = {};
        data.forEach(entry => {
            if (!monthlyData[entry.month]) {
                monthlyData[entry.month] = { income: 0, expenses: [] };
            }
            if (entry.type === 'income') {
                monthlyData[entry.month].income += entry.amount;
            } else {
                monthlyData[entry.month].expenses.push(entry);
            }
        });

        let html = '';
        let runningBalance = 0;
        const months = Object.keys(monthlyData).sort();
        const currentYear = new Date().getFullYear();

        if (isYearlyBrief) {
            const previousYearMonths = months.filter(m => parseInt(m.split('-')[0]) < currentYear);
            previousYearMonths.forEach(month => {
                const monthData = monthlyData[month];
                runningBalance += monthData.income;
                monthData.expenses.forEach(expense => {
                    runningBalance -= expense.amount;
                });
            });

            if (previousYearMonths.length > 0) {
                const lastYear = currentYear - 1;
                html += `<div class="font-bold text-purple-700 mb-4">${lastYear} সালের শেষে অবশিষ্ট টাকা: ৳ ${runningBalance.toLocaleString()}</div>`;
            }

            html += `<div class="font-bold text-gray-800 mb-3">${currentYear} সাল:</div>`;

            const currentYearMonths = months.filter(m => parseInt(m.split('-')[0]) === currentYear);
            const now = new Date();
            const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

            currentYearMonths.forEach(month => {
                const monthData = monthlyData[month];
                const date = new Date(month + '-01');
                const monthName = date.toLocaleString('default', { month: 'long' });
                const isCurrentMonth = month === currentMonthKey;

                if (isCurrentMonth) {
                    const today = now.getDate();
                    const monthNameBn = date.toLocaleString('default', { month: 'long' });
                    html += `<div class="font-bold text-gray-700 mt-3 mb-1">${today} ${monthNameBn} পর্যন্ত:</div>`;
                } else {
                    html += `<div class="font-bold text-gray-700 mt-3 mb-1">${monthName}:</div>`;
                }

                if (isCurrentMonth) {
                    if (monthData.expenses.length > 0) {
                        monthData.expenses.forEach(expense => {
                            runningBalance -= expense.amount;
                            html += `<div class="text-red-600 ml-2">সাদাকাহ (${expense.description}): ৳ ${expense.amount.toLocaleString()}</div>`;
                        });
                        html += `<div class="text-blue-600 ml-2 font-semibold">অবশিষ্ট থাকে: ৳ ${runningBalance.toLocaleString()}</div>`;
                    }

                    if (monthData.income > 0) {
                        runningBalance += monthData.income;
                        html += `<div class="text-green-700 ml-2">কালেকশন: ৳ ${monthData.income.toLocaleString()}</div>`;
                        html += `<div class="text-blue-600 ml-2 font-semibold">মোট হয়: ৳ ${runningBalance.toLocaleString()}</div>`;
                    }
                } else {
                    if (monthData.income > 0) {
                        runningBalance += monthData.income;
                        html += `<div class="text-green-700 ml-2">কালেকশন: ৳ ${monthData.income.toLocaleString()}</div>`;
                        html += `<div class="text-blue-600 ml-2 font-semibold">মোট হয়: ৳ ${runningBalance.toLocaleString()}</div>`;
                    }

                    if (monthData.expenses.length > 0) {
                        monthData.expenses.forEach(expense => {
                            runningBalance -= expense.amount;
                            html += `<div class="text-red-600 ml-2">সাদাকাহ (${expense.description}): ৳ ${expense.amount.toLocaleString()}</div>`;
                        });
                        html += `<div class="text-blue-600 ml-2 font-semibold">অবশিষ্ট থাকে: ৳ ${runningBalance.toLocaleString()}</div>`;
                    }
                }
            });
        } else {
            html += `<div class="font-bold text-gray-800 mb-3">সম্পূর্ণ তথ্য:</div>`;
            months.forEach(month => {
                const monthData = monthlyData[month];
                const date = new Date(month + '-01');
                const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });

                html += `<div class="font-bold text-gray-700 mt-3 mb-1">${monthName}:</div>`;

                if (monthData.income > 0) {
                    runningBalance += monthData.income;
                    html += `<div class="text-green-700 ml-2">কালেকশন: ৳ ${monthData.income.toLocaleString()}</div>`;
                    html += `<div class="text-blue-600 ml-2 font-semibold">মোট হয়: ৳ ${runningBalance.toLocaleString()}</div>`;
                }

                if (monthData.expenses.length > 0) {
                    monthData.expenses.forEach(expense => {
                        runningBalance -= expense.amount;
                        html += `<div class="text-red-600 ml-2">সাদাকাহ (${expense.description}): ৳ ${expense.amount.toLocaleString()}</div>`;
                    });
                    html += `<div class="text-blue-600 ml-2 font-semibold">অবশিষ্ট থাকে: ৳ ${runningBalance.toLocaleString()}</div>`;
                }
            });
        }

        content.innerHTML = html || '<div class="text-gray-400">কোনো তথ্য নেই</div>';
    }

    renderHistory(isYearlyBrief);
}


// --- COPY COMPLETE HISTORY ---
async function copyCompleteHistory() {
    const modeToggle = document.getElementById('historyModeToggle');
    const isBn = localStorage.getItem('lang') === 'bn';
    const isYearlyBrief = modeToggle.textContent === (isBn ? 'সংক্ষিপ্ত' : 'Yearly Brief');

    let data = [];

    try {
        const { data: freshData, error } = await db
            .from('fund')
            .select('*')
            .order('month', { ascending: true })
            .order('timestamp', { ascending: true });

        if (error) throw error;
        data = freshData;
    } catch (err) {
        console.log('Copying from cache:', err);
        data = state.allFundData.length > 0
            ? state.allFundData
            : JSON.parse(localStorage.getItem('allFundData') || '[]');
    }

    if (!data || data.length === 0) {
        return showNotification('No history data to copy', true);
    }

    const monthlyData = {};
    data.forEach(entry => {
        if (!monthlyData[entry.month]) {
            monthlyData[entry.month] = { income: 0, expenses: [] };
        }
        if (entry.type === 'income') {
            monthlyData[entry.month].income += entry.amount;
        } else {
            monthlyData[entry.month].expenses.push(entry);
        }
    });

    let text = '';
    let runningBalance = 0;
    const months = Object.keys(monthlyData).sort();
    const currentYear = new Date().getFullYear();

    if (isYearlyBrief) {
        const previousYearMonths = months.filter(m => parseInt(m.split('-')[0]) < currentYear);
        previousYearMonths.forEach(month => {
            const monthData = monthlyData[month];
            runningBalance += monthData.income;
            monthData.expenses.forEach(expense => {
                runningBalance -= expense.amount;
            });
        });

        if (previousYearMonths.length > 0) {
            const lastYear = currentYear - 1;
            text += `${lastYear} সালের শেষে অবশিষ্ট টাকা: ৳ ${runningBalance.toLocaleString()}\n\n`;
        }

        text += `${currentYear} সাল:\n\n`;

        const currentYearMonths = months.filter(m => parseInt(m.split('-')[0]) === currentYear);
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        currentYearMonths.forEach(month => {
            const monthData = monthlyData[month];
            const date = new Date(month + '-01');
            const monthName = date.toLocaleString('default', { month: 'long' });
            const isCurrentMonth = month === currentMonthKey;

            if (isCurrentMonth) {
                const today = now.getDate();
                const monthNameBn = date.toLocaleString('default', { month: 'long' });
                text += `${today} ${monthNameBn} পর্যন্ত:\n`;
            } else {
                text += `${monthName}:\n`;
            }

            if (isCurrentMonth) {
                if (monthData.expenses.length > 0) {
                    monthData.expenses.forEach(expense => {
                        runningBalance -= expense.amount;
                        text += `সাদাকাহ (${expense.description}): ৳ ${expense.amount.toLocaleString()}\n`;
                    });
                    text += `অবশিষ্ট থাকে: ৳ ${runningBalance.toLocaleString()}\n`;
                }

                if (monthData.income > 0) {
                    runningBalance += monthData.income;
                    text += `কালেকশন: ৳ ${monthData.income.toLocaleString()}\n`;
                    text += `মোট হয়: ৳ ${runningBalance.toLocaleString()}\n`;
                }
            } else {
                if (monthData.income > 0) {
                    runningBalance += monthData.income;
                    text += `কালেকশন: ৳ ${monthData.income.toLocaleString()}\n`;
                    text += `মোট হয়: ৳ ${runningBalance.toLocaleString()}\n`;
                }

                if (monthData.expenses.length > 0) {
                    monthData.expenses.forEach(expense => {
                        runningBalance -= expense.amount;
                        text += `সাদাকাহ (${expense.description}): ৳ ${expense.amount.toLocaleString()}\n`;
                    });
                    text += `অবশিষ্ট থাকে: ৳ ${runningBalance.toLocaleString()}\n`;
                }
            }

            text += `\n`;
        });
    } else {
        text += `সম্পূর্ণ তথ্য:\n\n`;

        months.forEach(month => {
            const monthData = monthlyData[month];
            const date = new Date(month + '-01');
            const monthName = date.toLocaleString('default', { month: 'long', year: 'numeric' });

            text += `${monthName}:\n`;

            if (monthData.income > 0) {
                runningBalance += monthData.income;
                text += `কালেকশন: ৳ ${monthData.income.toLocaleString()}\n`;
                text += `মোট হয়: ৳ ${runningBalance.toLocaleString()}\n`;
            }

            if (monthData.expenses.length > 0) {
                monthData.expenses.forEach(expense => {
                    runningBalance -= expense.amount;
                    text += `সাদাকাহ (${expense.description}): ৳ ${expense.amount.toLocaleString()}\n`;
                });
                text += `অবশিষ্ট থাকে: ৳ ${runningBalance.toLocaleString()}\n`;
            }

            text += `\n`;
        });
    }

    try {
        await navigator.clipboard.writeText(text);
        showNotification('Complete history copied to clipboard!');
    } catch (err) {
        showNotification('Failed to copy to clipboard', true);
    }
}

// --- REFRESH APP ---
async function refreshApp() {
    showNotification('Refreshing app...');

    if ('serviceWorker' in navigator && 'caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
    }

    window.location.reload(true);
}

// --- REGISTER SERVICE WORKER ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
            .register('/serviceWorker.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    }
}

// --- UPDATE MY PROFILE BUTTON TEXT ---
function updateMyProfileButtonText() {
    if (!state.isAdmin && state.currentUser) {
        const isBn = localStorage.getItem('lang') === 'bn';
        elements.myDonorBtn.textContent = isBn ? 'আমার প্রোফাইল' : 'My Profile';
    }
}

// --- SHUFFLE DONORS ---
function shuffleDonors(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// --- SETUP SCROLL BEHAVIOR ---
function setupScrollBehavior() {
    const topBar = document.querySelector('.bg-gradient-to-r');
    let lastScrollTop = 0;
    const topBarHeight = topBar.offsetHeight;
    let currentTranslate = 0;

    const bloodFilterContainer = document.getElementById('bloodFilterContainer');
    const placeholder = document.createElement('div');
    placeholder.id = 'bloodFilterPlaceholder';
    if (bloodFilterContainer) {
        bloodFilterContainer.parentNode.insertBefore(placeholder, bloodFilterContainer.nextSibling);
    }

    let bloodFilterOriginalTop = 0;

    const calculateFilterPosition = () => {
        if (bloodFilterContainer && state.activeSection === 'blood') {
            bloodFilterContainer.classList.remove('sticky');
            placeholder.classList.remove('active');
            setTimeout(() => {
                bloodFilterOriginalTop = bloodFilterContainer.getBoundingClientRect().top + window.pageYOffset;
            }, 100);
        }
    };

    setTimeout(calculateFilterPosition, 500);

    const originalShowSection = showSection;
    showSection = function (sectionId) {
        originalShowSection(sectionId);
        if (sectionId === 'blood') {
            setTimeout(calculateFilterPosition, 300);
        }
    };

    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollDelta = scrollTop - lastScrollTop;
        const isBloodSection = state.activeSection === 'blood';

        if (isBloodSection) {
            const shouldBeSticky = scrollTop >= bloodFilterOriginalTop;

            if (shouldBeSticky) {
                if (bloodFilterContainer) {
                    const filterHeight = bloodFilterContainer.offsetHeight;
                    bloodFilterContainer.classList.add('sticky');
                    placeholder.classList.add('active');
                    placeholder.style.height = `${filterHeight}px`;
                }
            } else {
                if (bloodFilterContainer) {
                    bloodFilterContainer.classList.remove('sticky');
                    placeholder.classList.remove('active');
                }
            }

            topBar.style.transform = '';
            topBar.style.position = 'relative';
        } else {
            topBar.style.position = '';
            currentTranslate -= scrollDelta;
            currentTranslate = Math.max(-topBarHeight, Math.min(0, currentTranslate));
            topBar.style.transform = `translateY(${currentTranslate}px)`;

            if (bloodFilterContainer) {
                bloodFilterContainer.classList.remove('sticky');
                placeholder.classList.remove('active');
            }
        }

        lastScrollTop = scrollTop;
    }, { passive: true });
}

// --- SETUP LANGUAGE TOGGLE ---
function setupLanguageToggle() {
    const toggle = document.getElementById('bengaliModeToggle');
    const appTitle = document.getElementById('appTitle');

    const elementsToTranslate = {
        fund: { en: 'Fund History', bn: 'ফান্ড' },
        notices: { en: 'Activities', bn: 'কার্যক্রম' },
        blood: { en: 'Blood Donors', bn: 'রক্তদান' },
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
        donorTitle: { en: 'My Donor Profile', bn: 'আমার ডোনার প্রোফাইল' },
        phoneNumber: { en: 'Phone Number', bn: 'ফোন নাম্বার' },
        bloodGroup: { en: 'Select Blood Group', bn: 'রক্তের গ্রুপ সিলেক্ট করুন' },
        location: { en: 'Location', bn: 'লোকেশন' },
        available: { en: 'Available to donate', bn: 'অ্যাভেইলেবল' },
        notAvailable: { en: 'Not Available', bn: 'অ্যাভেইলেবল নয়' },
        allGroups: { en: 'All Blood Groups', bn: 'সকল রক্তের গ্রুপ' },
        loginModal: { en: 'Login', bn: 'লগইন করুন' },
        signupModal: { en: 'Sign Up', bn: 'সাইন-আপ করুন' },
        addIncomeModal: { en: 'Add Collection', bn: 'কালেকশন যুক্ত করুন' },
        addExpenseModal: { en: 'Add Sadakah', bn: 'সাদাকাহ যুক্ত করুন' },
        donorProfileModal: { en: 'My Donor Profile', bn: 'আমার ডোনার প্রোফাইল' },
        postNoticeModal: { en: 'Post Activity', bn: 'কার্যক্রম পোস্ট করুন' },
        yearlyChartModal: { en: 'Yearly Overview', bn: 'বাৎসরিক তথ্য' },
        completeHistoryModal: { en: 'Complete Fund History', bn: 'ফান্ডের সম্পুর্ণ তথ্য' },
        optionalImage: { en: 'Optional Image:', bn: 'ছবি যুক্ত করুন (অপশনাল)' },
        incomeChart: { en: 'Collection', bn: 'কালেকশন' },
        expenseChart: { en: 'Sadakah', bn: 'সাদাকাহ' },
        totalFund: { en: 'Total Fund', bn: 'ফান্ডে মোট অর্থ' },
        noActivities: { en: 'No activities yet', bn: 'এখনো কোনো কার্যক্রম নেই' },
        postedBy: { en: 'Posted by', bn: 'পোস্টটি করেছেন' },
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
        bengaliMode: { en: 'Bengali Mode', bn: 'বাংলা করুন' },
        enable: { en: 'Enable', bn: 'চালু করুন' }
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

            // Donation info text
            const donationInfoText = document.getElementById('donationInfoText');
            if (donationInfoText) {
                donationInfoText.textContent = isBn ? 'এখানে সাদাকাহ করে আপনিও অবদান রাখতে পারেনঃ' : 'You can also contribute by donating to:';
            }
            const donationNumbers = donationInfoText?.nextElementSibling?.querySelectorAll('div');
            if (donationNumbers && donationNumbers.length >= 2) {
                donationNumbers[0].textContent = isBn ? '+880 1937-222273 - নগদ' : '+880 1937-222273 - nogod';
                donationNumbers[1].textContent = isBn ? '+880 1515-214867 - বিকাশ' : '+880 1515-214867 - bkash';
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
            document.getElementById('expenseDesc').placeholder = isBn ? 'বর্ণনা' : 'Description';
            document.getElementById('expenseAmount').placeholder = isBn ? 'পরিমাণ (৳)' : 'Amount (৳)';
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
}

// --- INIT APP ---
document.addEventListener('DOMContentLoaded', () => init());
