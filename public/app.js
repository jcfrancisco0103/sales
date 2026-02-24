// API Base URL
const API_BASE = '/api';

// Debug: Log API base URL
console.log('API_BASE:', API_BASE);

// State
let currentEditingId = null;
let currentUpgradeSale = null; // Sale being upgraded
let currentMonth = '';
let currentYear = '';
let allSales = []; // Store all sales for filtering
let searchQuery = ''; // Store search query
let currentSearchQuery = ''; // Store current search query for filtering

// Plan definitions
const PLAN_DATA = {
    // Budget Dedicated Plans
    'Chicken Plan': {
        amount: 95,
        ram: '2GB',
        cpu: '1 vCore',
        disk: '10GB'
    },
    'Pig Plan': {
        amount: 199,
        ram: '4GB',
        cpu: '2 vCores',
        disk: '15GB'
    },
    'Wolf Plan': {
        amount: 299,
        ram: '6GB',
        cpu: '3 vCores',
        disk: '20GB'
    },
    // Enterprise Dedicated Plans
    'Zombie Plan': {
        amount: 499,
        ram: '8GB',
        cpu: '4 vCores',
        disk: '30GB'
    },
    'Skeleton Plan': {
        amount: 699,
        ram: '12GB',
        cpu: '5 vCores',
        disk: '40GB'
    },
    'Ender Dragon Plan': {
        amount: 999,
        ram: '16GB',
        cpu: '6 vCores',
        disk: '60GB'
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

// Check authentication status
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/session`, {
            credentials: 'include' // Include cookies in request
        });
        const data = await response.json();
        
        if (data.authenticated) {
            showApp();
        } else {
            showAuthModal();
        }
    } catch (error) {
        console.error('Error checking auth:', error);
        showAuthModal();
    }
}

// Show authentication modal
function showAuthModal() {
    document.getElementById('authModal').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
}

// Show main app
function showApp() {
    try {
        const authModal = document.getElementById('authModal');
        const app = document.getElementById('app');
        
        if (authModal) authModal.classList.add('hidden');
        if (app) app.classList.remove('hidden');
        
        // Initialize with home tab
        switchMainTab('home');
        // Load statistics for home page
        loadStatistics();
    } catch (error) {
        console.error('Error showing app:', error);
    }
}

// Switch main tabs (Home/Sales Management)
function switchMainTab(tabName) {
    try {
        // Update tab buttons
        const tabButtons = document.querySelectorAll('.main-tab-btn');
        if (tabButtons.length === 0) {
            console.warn('Main tab buttons not found');
            return;
        }
        
        tabButtons.forEach(btn => {
            if (btn.dataset.mainTab === tabName) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        if (tabName === 'home') {
            const homeTab = document.getElementById('homeTab');
            if (homeTab) {
                homeTab.classList.add('active');
            }
            // Hide header month filter when on home tab (we have one on the page)
            const monthFilterContainer = document.getElementById('monthFilterContainer');
            if (monthFilterContainer) {
                monthFilterContainer.style.display = 'none';
            }
            // Reset home month filter to "All Time" when switching to home tab
            const homeMonthFilter = document.getElementById('homeMonthFilter');
            if (homeMonthFilter) {
                homeMonthFilter.value = '';
            }
            // Reset month filter to show all time statistics
            currentMonth = '';
            currentYear = '';
            // Load months for home page filter
            loadHomeMonths();
            // Load statistics for home page (all time initially)
            loadStatistics();
        } else if (tabName === 'sales') {
            const salesTab = document.getElementById('salesTab');
            if (salesTab) {
                salesTab.classList.add('active');
            }
            // Show month filter when on sales tab
            const monthFilterContainer = document.getElementById('monthFilterContainer');
            if (monthFilterContainer) {
                monthFilterContainer.style.display = 'block';
            }
            // Reset month filter when switching to sales tab (show all sales initially)
            currentMonth = '';
            currentYear = '';
            const monthFilter = document.getElementById('monthFilter');
            if (monthFilter) {
                monthFilter.value = '';
            }
            // Reset search when switching to sales tab
            currentSearchQuery = '';
            const customerSearch = document.getElementById('customerSearch');
            if (customerSearch) {
                customerSearch.value = '';
            }
            // Reset load flag to allow fresh load when switching tabs
            hasLoadedSales = false;
            // Load sales data when switching to sales tab
            loadMonths();
            loadSales();
        }
    } catch (error) {
        console.error('Error switching main tab:', error);
    }
}


// Setup event listeners
function setupEventListeners() {
    // Auth tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            switchTab(tab);
        });
    });


    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        console.log('Login form event listener attached');
    } else {
        console.error('Login form not found!');
    }

    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
        console.log('Register form event listener attached');
    } else {
        console.error('Register form not found!');
    }

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Main tabs (Home/Sales Management)
    document.querySelectorAll('.main-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.mainTab;
            switchMainTab(tab);
        });
    });

    // Month filter
    const monthFilter = document.getElementById('monthFilter');
    if (monthFilter) {
        monthFilter.addEventListener('change', handleMonthFilter);
    }

    // Home page month filter
    const homeMonthFilter = document.getElementById('homeMonthFilter');
    if (homeMonthFilter) {
        homeMonthFilter.addEventListener('change', handleHomeMonthFilter);
    }

    // Navigation tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const page = e.currentTarget.dataset.page;
            switchPage(page);
        });
    });

    // Add sale button
    const addSaleBtn = document.getElementById('addSaleBtn');
    if (addSaleBtn) {
        addSaleBtn.addEventListener('click', () => openSaleModal());
    }

    // Export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', handleExport);
    }

    // Import file input
    const importFile = document.getElementById('importFile');
    if (importFile) {
        importFile.addEventListener('change', handleImport);
    }

    // Customer search
    document.getElementById('customerSearch').addEventListener('input', handleCustomerSearch);

    // Sale form
    const saleForm = document.getElementById('saleForm');
    if (saleForm) {
        saleForm.addEventListener('submit', handleSaleSubmit);
        // Calculate expiry date when date bought or duration changes
        saleForm.addEventListener('change', (e) => {
            if (e.target.id === 'dateBought' || e.target.id === 'duration') {
                calculateExpiryDate();
            }
        });
        saleForm.addEventListener('input', (e) => {
            if (e.target.id === 'dateBought' || e.target.id === 'duration') {
                calculateExpiryDate();
            }
        });
    }

    // Plan selection handler
    const planSelect = document.getElementById('planSelect');
    if (planSelect) {
        planSelect.addEventListener('change', handlePlanSelection);
    }

    // Promo code handler
    const promoInput = document.getElementById('promo');
    if (promoInput) {
        promoInput.addEventListener('input', handlePromoChange);
        promoInput.addEventListener('blur', handlePromoChange);
    }

    // Amount input handler for custom plans (to update originalAmount)
    const amountInput = document.getElementById('amount');
    if (amountInput) {
        amountInput.addEventListener('change', () => {
            // If amount is not readonly (custom plan), update originalAmount
            if (!amountInput.hasAttribute('readonly')) {
                const currentAmount = parseFloat(amountInput.value) || 0;
                if (currentAmount > 0) {
                    originalAmount = currentAmount;
                    // Recalculate promo if exists
                    if (promoInput && promoInput.value) {
                        handlePromoChange();
                    }
                }
            }
        });
    }

    // Auto-format CPU, RAM, and DISK fields for custom plan
    const cpuInput = document.getElementById('cpu');
    const ramInput = document.getElementById('ram');
    const diskInput = document.getElementById('disk');

    if (cpuInput) {
        cpuInput.addEventListener('input', formatCPU);
        cpuInput.addEventListener('blur', formatCPU);
    }
    if (ramInput) {
        ramInput.addEventListener('input', formatRAM);
        ramInput.addEventListener('blur', formatRAM);
    }
    if (diskInput) {
        diskInput.addEventListener('input', formatDISK);
        diskInput.addEventListener('blur', formatDISK);
    }
    
    // Event delegation should handle most cases, but we'll also ensure
    // the calculation runs when the modal opens

    // Modal close
    const closeBtn = document.querySelector('.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeSaleModal);
    }
    
    const cancelBtn = document.getElementById('cancelBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeSaleModal);
    }

    // Close modal on outside click
    const saleModal = document.getElementById('saleModal');
    if (saleModal) {
        saleModal.addEventListener('click', (e) => {
            if (e.target.id === 'saleModal') {
                closeSaleModal();
            }
        });
    }

    // Upgrade modal
    const upgradeForm = document.getElementById('upgradeForm');
    if (upgradeForm) {
        upgradeForm.addEventListener('submit', handleUpgradeSubmit);
    }
    const upgradeCancelBtn = document.getElementById('upgradeCancelBtn');
    if (upgradeCancelBtn) {
        upgradeCancelBtn.addEventListener('click', closeUpgradeModal);
    }
    document.querySelectorAll('.upgrade-close').forEach(btn => {
        btn.addEventListener('click', closeUpgradeModal);
    });
    const upgradeModal = document.getElementById('upgradeModal');
    if (upgradeModal) {
        upgradeModal.addEventListener('click', (e) => {
            if (e.target.id === 'upgradeModal') {
                closeUpgradeModal();
            }
        });
    }
}

// Switch auth tabs
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.auth-tab').forEach(t => {
        t.classList.remove('active');
    });

    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`${tab}Tab`).classList.add('active');

    // Clear errors
    document.getElementById('loginError').textContent = '';
    document.getElementById('registerError').textContent = '';
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    console.log('Login form submitted!');
    
    const errorDiv = document.getElementById('loginError');
    const submitButton = e.target.querySelector('button[type="submit"]');
    
    if (!errorDiv) {
        console.error('Error div not found!');
        alert('Error: Could not find error display element');
        return;
    }
    
    errorDiv.textContent = '';
    errorDiv.style.color = '#ef4444'; // Reset to error color

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        errorDiv.textContent = 'Please enter both username and password';
        return;
    }

    // Show loading state
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Logging in...';
    }
    errorDiv.textContent = 'Logging in...';
    errorDiv.style.color = '#3b82f6';

    console.log('Attempting login for:', username);
    console.log('Sending request to:', `${API_BASE}/login`);
    
    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            signal: controller.signal,
            body: JSON.stringify({ username, password })
        });

        clearTimeout(timeoutId);
        console.log('Login response status:', response.status, response.statusText);
        
        // Handle timeout errors
        if (response.status === 504 || response.status === 503) {
            errorDiv.textContent = 'Server timeout. This may be due to database initialization. Please try again in a few seconds.';
            errorDiv.style.color = '#ef4444';
            console.error('Server timeout - likely database initialization issue');
            return;
        }
        
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            try {
                data = await response.json();
            } catch (jsonError) {
                const text = await response.text();
                console.error('Failed to parse JSON response:', text.substring(0, 200));
                if (response.status === 504 || response.status === 503) {
                    errorDiv.textContent = 'Server timeout. The database may be initializing. Please wait a moment and try again.';
                } else {
                    errorDiv.textContent = `Server error: ${response.status} ${response.statusText}`;
                }
                return;
            }
        } else {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 200));
            if (response.status === 504 || response.status === 503) {
                errorDiv.textContent = 'Server timeout. Please try again in a few seconds.';
            } else {
                errorDiv.textContent = `Server error: ${response.status} ${response.statusText}`;
            }
            return;
        }

        console.log('Login response data:', data);

        if (response.ok && data.success) {
            // Wait a moment for session to be saved, then verify
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Verify session was created
            const sessionCheck = await fetch(`${API_BASE}/session`, {
                credentials: 'include'
            });
            const sessionData = await sessionCheck.json();
            
            console.log('Session check result:', sessionData);
            console.log('Cookies:', document.cookie);
            
            if (sessionData.authenticated) {
                console.log('Login successful, showing app');
                showApp();
                document.getElementById('loginForm').reset();
            } else {
                // Try one more time after a longer delay
                await new Promise(resolve => setTimeout(resolve, 500));
                const retryCheck = await fetch(`${API_BASE}/session`, {
                    credentials: 'include'
                });
                const retryData = await retryCheck.json();
                console.log('Retry session check:', retryData);
                
                if (retryData.authenticated) {
                    console.log('Login successful on retry, showing app');
                    showApp();
                    document.getElementById('loginForm').reset();
                } else {
                    errorDiv.textContent = 'Login failed: Session not created. Please try again.';
                    errorDiv.style.color = '#ef4444';
                    console.error('Session check failed after retry:', retryData);
                }
            }
        } else {
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.style.color = '#ef4444';
            console.error('Login error:', data);
        }
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            errorDiv.textContent = 'Request timed out. The server may be initializing the database. Please wait a moment and try again.';
            errorDiv.style.color = '#ef4444';
            console.error('Login request timed out after 15 seconds');
        } else {
            errorDiv.textContent = 'Network error. Please check console for details.';
            errorDiv.style.color = '#ef4444';
            console.error('Login network error:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }
    } finally {
        // Restore button state
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Login';
        }
    }
}

// Handle register
async function handleRegister(e) {
    e.preventDefault();
    console.log('Register form submitted!');
    
    const errorDiv = document.getElementById('registerError');
    const submitButton = e.target.querySelector('button[type="submit"]');
    
    if (!errorDiv) {
        console.error('Error div not found!');
        alert('Error: Could not find error display element');
        return;
    }
    
    errorDiv.textContent = '';
    errorDiv.style.color = '#ef4444'; // Reset to error color

    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const repeatPassword = document.getElementById('repeatPassword').value;

    if (!username || !password || !repeatPassword) {
        errorDiv.textContent = 'Please fill in all fields';
        return;
    }

    if (password !== repeatPassword) {
        errorDiv.textContent = 'Passwords do not match';
        return;
    }

    if (password.length < 6) {
        errorDiv.textContent = 'Password must be at least 6 characters';
        return;
    }

    // Show loading state
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Registering...';
    }
    errorDiv.textContent = 'Registering...';
    errorDiv.style.color = '#3b82f6';

    console.log('Attempting registration for:', username);
    console.log('Sending request to:', `${API_BASE}/register`);
    
    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            signal: controller.signal,
            body: JSON.stringify({ username, password, repeatPassword })
        });

        clearTimeout(timeoutId);
        console.log('Register response status:', response.status, response.statusText);
        
        // Handle timeout errors
        if (response.status === 504 || response.status === 503) {
            errorDiv.textContent = 'Server timeout. This may be due to database initialization. Please try again in a few seconds.';
            errorDiv.style.color = '#ef4444';
            console.error('Server timeout - likely database initialization issue');
            return;
        }
        
        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            try {
                data = await response.json();
            } catch (jsonError) {
                const text = await response.text();
                console.error('Failed to parse JSON response:', text);
                if (response.status === 504 || response.status === 503) {
                    errorDiv.textContent = 'Server timeout. The database may be initializing. Please wait a moment and try again.';
                } else {
                    errorDiv.textContent = `Server error: ${response.status} ${response.statusText}`;
                }
                return;
            }
        } else {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 200));
            if (response.status === 504 || response.status === 503) {
                errorDiv.textContent = 'Server timeout. Please try again in a few seconds.';
            } else {
                errorDiv.textContent = `Server error: ${response.status} ${response.statusText}`;
            }
            return;
        }

        console.log('Register response data:', data);

        if (response.ok && data.success) {
            errorDiv.textContent = 'Registration successful! Please login.';
            errorDiv.style.color = '#10b981';
            console.log('Registration successful');
            setTimeout(() => {
                switchTab('login');
                document.getElementById('registerForm').reset();
            }, 1500);
        } else {
            errorDiv.textContent = data.error || 'Registration failed';
            errorDiv.style.color = '#ef4444';
            console.error('Registration error:', data);
        }
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            errorDiv.textContent = 'Request timed out. The server may be initializing the database. Please wait a moment and try again.';
            errorDiv.style.color = '#ef4444';
            console.error('Registration request timed out after 15 seconds');
        } else {
            errorDiv.textContent = 'Network error. Please check console for details.';
            errorDiv.style.color = '#ef4444';
            console.error('Registration network error:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }
    } finally {
        // Restore button state
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Register';
        }
    }
}

// Handle logout
async function handleLogout() {
    try {
        await fetch(`${API_BASE}/logout`, { 
            method: 'POST',
            credentials: 'include' // Include cookies in request
        });
        showAuthModal();
        const salesTableBody = document.getElementById('salesTableBody');
        if (salesTableBody) {
            salesTableBody.innerHTML = '<tr><td colspan="11" class="empty-state">No sales records found</td></tr>';
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Load available months
async function loadMonths() {
    try {
        const response = await fetch(`${API_BASE}/sales/months`, {
            credentials: 'include'
        });
        const months = await response.json();

        const select = document.getElementById('monthFilter');
        select.innerHTML = '<option value="">All Months</option>';

        months.forEach(month => {
            const date = new Date(`${month.year_month}-01`);
            const option = document.createElement('option');
            option.value = `${month.month}-${month.year}`;
            option.textContent = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading months:', error);
    }
}

// Load available months for home page filter
async function loadHomeMonths() {
    try {
        const response = await fetch(`${API_BASE}/sales/months`, {
            credentials: 'include'
        });
        const months = await response.json();

        const select = document.getElementById('homeMonthFilter');
        if (!select) return;
        
        select.innerHTML = '<option value="">All Time</option>';

        months.forEach(month => {
            const date = new Date(`${month.year_month}-01`);
            const option = document.createElement('option');
            option.value = `${month.month}-${month.year}`;
            option.textContent = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading home months:', error);
    }
}

// Switch between pages
function switchPage(page) {
    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    const activeTab = document.querySelector(`[data-page="${page}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }

    // Update pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.add('hidden');
        p.classList.remove('active');
    });
    const activePage = document.getElementById(`${page}Page`);
    if (activePage) {
        activePage.classList.remove('hidden');
        activePage.classList.add('active');
    }

    // Load data if needed
    if (page === 'sales') {
        loadSales();
    } else if (page === 'dashboard') {
        loadStatistics();
    }
    
    // Clear search when switching pages
    if (page === 'dashboard') {
        const searchInput = document.getElementById('customerSearch');
        if (searchInput) {
            searchInput.value = '';
            searchQuery = '';
        }
    }
}

// Handle month filter
function handleMonthFilter(e) {
    const value = e.target.value;
    if (value) {
        const [month, year] = value.split('-');
        currentMonth = month;
        currentYear = year;
    } else {
        currentMonth = '';
        currentYear = '';
    }
    // Apply filters (month + search) and display
    filterAndDisplaySales();
}

// Handle home page month filter
function handleHomeMonthFilter(e) {
    const value = e.target.value;
    if (value) {
        const [month, year] = value.split('-');
        currentMonth = month;
        currentYear = year;
    } else {
        currentMonth = '';
        currentYear = '';
    }
    // Reload statistics with the selected month
    loadStatistics();
}

// Handle customer search
function handleCustomerSearch(e) {
    currentSearchQuery = e.target.value.trim().toLowerCase();
    filterAndDisplaySales();
}

// Filter and display sales based on month filter and search query
let isLoadingSales = false; // Prevent infinite loops
let hasLoadedSales = false; // Track if we've attempted to load sales

function filterAndDisplaySales() {
    const tbody = document.getElementById('salesTableBody');
    if (!tbody) return;
    
    // If we haven't loaded yet and not currently loading, trigger load
    if (!hasLoadedSales && !isLoadingSales) {
        isLoadingSales = true;
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Loading...</td></tr>';
        loadSales().finally(() => {
            isLoadingSales = false;
        });
        return;
    }
    
    // If we've loaded but have no sales, show empty state
    if (hasLoadedSales && (!allSales || allSales.length === 0)) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No sales records found</td></tr>';
        return;
    }
    
    // If allSales exists and has data, filter and display
    if (allSales && allSales.length > 0) {
        let filteredSales = [...allSales];

        // Apply month filter if set
        if (currentMonth && currentYear) {
            filteredSales = filteredSales.filter(sale => {
                const saleDate = new Date(sale.date_bought);
                const saleMonth = String(saleDate.getMonth() + 1).padStart(2, '0');
                const saleYear = String(saleDate.getFullYear());
                return saleMonth === currentMonth.padStart(2, '0') && saleYear === currentYear;
            });
        }

        // Apply search filter if set
        if (currentSearchQuery) {
            filteredSales = filteredSales.filter(sale => {
                return sale.customer_name.toLowerCase().includes(currentSearchQuery);
            });
        }

        // Display filtered sales
        displaySales(filteredSales);
    } else if (hasLoadedSales) {
        // If we've loaded but have no sales after filtering, show empty state
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No sales records found</td></tr>';
    }
}

// Display sales in the table
function displaySales(sales) {
    const tbody = document.getElementById('salesTableBody');
    
    if (sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No sales records found</td></tr>';
        return;
    }

    tbody.innerHTML = sales.map(sale => `
        <tr>
            <td>${formatDate(sale.date_bought)}</td>
            <td>${sale.date_expiry ? formatDate(sale.date_expiry) : '-'}</td>
            <td>${escapeHtml(sale.customer_name)}</td>
            <td>${escapeHtml(sale.plan)}</td>
            <td>₱${formatCurrency(sale.amount)}</td>
            <td>${sale.promo ? escapeHtml(sale.promo) : '-'}</td>
            <td>${escapeHtml(sale.payment_method)}</td>
            <td><span class="status-badge ${sale.status.toLowerCase()}">${sale.status}</span></td>
            <td>${escapeHtml(sale.created_by_username)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-edit" onclick="editSale(${sale.id})">Edit</button>
                    <button class="btn btn-upgrade" onclick="openUpgradeModal(${sale.id})" title="Upgrade server resources">Upgrade</button>
                    <button class="btn btn-renew" onclick="renewSale(${sale.id})" title="Renew subscription">Renew</button>
                    <button class="btn btn-danger" onclick="deleteSale(${sale.id})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Load sales
async function loadSales() {
    try {
        const params = new URLSearchParams();
        // Always fetch all sales for client-side filtering
        // Month filter will be applied client-side along with search

        const response = await fetch(`${API_BASE}/sales?${params}`, {
            credentials: 'include'
        });
        const sales = await response.json();

        // Store all sales for filtering
        allSales = sales || [];
        hasLoadedSales = true; // Mark as loaded

        // Apply both month and search filters
        filterAndDisplaySales();

    } catch (error) {
        console.error('Error loading sales:', error);
        allSales = [];
        hasLoadedSales = true; // Mark as loaded even on error
        // Show error state
        const tbody = document.getElementById('salesTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Error loading sales</td></tr>';
        }
    }
}

// Filter sales based on search query
function filterSales(sales) {
    if (!searchQuery.trim()) {
        return sales;
    }
    
    const query = searchQuery.toLowerCase().trim();
    return sales.filter(sale => 
        sale.customer_name.toLowerCase().includes(query)
    );
}

// Display sales in table
function displaySales(sales) {
    const tbody = document.getElementById('salesTableBody');
    
    if (sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No sales records found</td></tr>';
        return;
    }

    tbody.innerHTML = sales.map(sale => `
            <tr>
                <td>${formatDate(sale.date_bought)}</td>
                <td>${sale.date_expiry ? formatDate(sale.date_expiry) : '-'}</td>
                <td>${escapeHtml(sale.customer_name)}</td>
                <td>${escapeHtml(sale.plan)}</td>
                <td>₱${formatCurrency(sale.amount)}</td>
                <td>${sale.promo ? escapeHtml(sale.promo) : '-'}</td>
                <td>${escapeHtml(sale.payment_method)}</td>
                <td><span class="status-badge ${sale.status.toLowerCase()}">${sale.status}</span></td>
                <td>${escapeHtml(sale.created_by_username)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-edit" onclick="editSale(${sale.id})">Edit</button>
                        <button class="btn btn-upgrade" onclick="openUpgradeModal(${sale.id})" title="Upgrade server resources">Upgrade</button>
                        <button class="btn btn-renew" onclick="renewSale(${sale.id})" title="Renew subscription">Renew</button>
                        <button class="btn btn-danger" onclick="deleteSale(${sale.id})">Delete</button>
                    </div>
                </td>
            </tr>
        `).join('');
}

// Handle customer search
function handleCustomerSearch(e) {
    searchQuery = e.target.value;
    // Filter the already loaded sales
    displaySales(filterSales(allSales));
}

// Load statistics
async function loadStatistics() {
    try {
        const params = new URLSearchParams();
        if (currentMonth && currentYear) {
            params.append('month', currentMonth);
            params.append('year', currentYear);
        }

        const response = await fetch(`${API_BASE}/statistics?${params}`, {
            credentials: 'include'
        });
        const stats = await response.json();

        // Update month display
        const monthDisplay = document.getElementById('totalSalesMonth');
        if (currentMonth && currentYear) {
            const date = new Date(`${currentYear}-${currentMonth.padStart(2, '0')}-01`);
            monthDisplay.textContent = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            monthDisplay.style.display = 'block';
        } else {
            monthDisplay.textContent = 'All Time';
            monthDisplay.style.display = 'block';
        }

        document.getElementById('totalSales').textContent = stats.totalSales;
        document.getElementById('totalAmount').textContent = `₱${formatCurrency(stats.totalAmount)}`;
        document.getElementById('paidSales').textContent = stats.paidSales;
        document.getElementById('paidAmount').textContent = `₱${formatCurrency(stats.paidAmount)}`;
        document.getElementById('pendingAmount').textContent = `₱${formatCurrency(stats.pendingAmount)}`;
        document.getElementById('ownerSalary').textContent = `₱${formatCurrency(stats.salaries.owner)}`;
        document.getElementById('developerSalary').textContent = `₱${formatCurrency(stats.salaries.developer)}`;
        document.getElementById('staffSalary').textContent = `₱${formatCurrency(stats.salaries.staff)}`;
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Format CPU field - auto-add % if not present
function formatCPU(e) {
    const input = e.target;
    const planSelect = document.getElementById('planSelect');
    
    // Only format if Custom Plan is selected
    if (planSelect.value === 'Custom Plan' && !input.hasAttribute('readonly')) {
        let value = input.value.trim();
        // Remove existing % if present
        value = value.replace(/%/g, '');
        // Add % if there's a value
        if (value && !value.endsWith('%')) {
            input.value = value + '%';
        } else if (value) {
            input.value = value;
        }
    }
}

// Format RAM field - auto-add GB if not present
function formatRAM(e) {
    const input = e.target;
    const planSelect = document.getElementById('planSelect');
    
    // Only format if Custom Plan is selected
    if (planSelect.value === 'Custom Plan' && !input.hasAttribute('readonly')) {
        let value = input.value.trim();
        // Remove existing GB if present
        value = value.replace(/GB/gi, '');
        // Add GB if there's a value
        if (value && !value.endsWith('GB') && !value.endsWith('gb')) {
            input.value = value + 'GB';
        } else if (value) {
            input.value = value;
        }
    }
}

// Format DISK field - auto-add GB if not present
function formatDISK(e) {
    const input = e.target;
    const planSelect = document.getElementById('planSelect');
    
    // Only format if Custom Plan is selected
    if (planSelect.value === 'Custom Plan' && !input.hasAttribute('readonly')) {
        let value = input.value.trim();
        // Remove existing GB if present
        value = value.replace(/GB/gi, '');
        // Add GB if there's a value
        if (value && !value.endsWith('GB') && !value.endsWith('gb')) {
            input.value = value + 'GB';
        } else if (value) {
            input.value = value;
        }
    }
}

// Store original amount for promo calculation
let originalAmount = 0;

// Handle plan selection
function handlePlanSelection() {
    const planSelect = document.getElementById('planSelect');
    const selectedPlan = planSelect.value;
    const cpuInput = document.getElementById('cpu');
    const ramInput = document.getElementById('ram');
    const diskInput = document.getElementById('disk');
    const amountInput = document.getElementById('amount');
    const promoInput = document.getElementById('promo');

    if (selectedPlan === 'Custom Plan') {
        // Enable manual input for custom plan specs
        cpuInput.removeAttribute('readonly');
        cpuInput.placeholder = '150%';
        ramInput.removeAttribute('readonly');
        ramInput.placeholder = '6GB';
        diskInput.removeAttribute('readonly');
        diskInput.placeholder = '10GB';
        amountInput.removeAttribute('readonly');
        // Clear fields
        cpuInput.value = '';
        ramInput.value = '';
        diskInput.value = '';
        amountInput.value = '';
        originalAmount = 0;
        // Recalculate promo if exists
        if (promoInput && promoInput.value) {
            handlePromoChange();
        }
    } else if (selectedPlan && PLAN_DATA[selectedPlan] && PLAN_DATA[selectedPlan].amount !== 0) {
        // Auto-fill fields for predefined plans
        const planData = PLAN_DATA[selectedPlan];
        cpuInput.value = planData.cpu;
        cpuInput.setAttribute('readonly', 'readonly');
        cpuInput.placeholder = '';
        ramInput.value = planData.ram;
        ramInput.setAttribute('readonly', 'readonly');
        ramInput.placeholder = '';
        diskInput.value = planData.disk;
        diskInput.setAttribute('readonly', 'readonly');
        diskInput.placeholder = '';
        originalAmount = planData.amount;
        amountInput.value = originalAmount;
        amountInput.setAttribute('readonly', 'readonly');
        // Recalculate promo if exists
        if (promoInput && promoInput.value) {
            handlePromoChange();
        }
    } else {
        // No plan selected - clear all fields
        cpuInput.value = '';
        cpuInput.removeAttribute('readonly');
        cpuInput.placeholder = '';
        ramInput.value = '';
        ramInput.removeAttribute('readonly');
        ramInput.placeholder = '';
        diskInput.value = '';
        diskInput.removeAttribute('readonly');
        diskInput.placeholder = '';
        amountInput.value = '';
        amountInput.removeAttribute('readonly');
        originalAmount = 0;
        // Clear promo calculation
        if (promoInput && promoInput.value) {
            handlePromoChange();
        }
    }
}

// Handle promo code change
function handlePromoChange() {
    const promoInput = document.getElementById('promo');
    const amountInput = document.getElementById('amount');
    
    if (!promoInput || !amountInput) return;
    
    const promoValue = promoInput.value.trim();
    
    // If no promo, restore original amount
    if (!promoValue) {
        if (originalAmount > 0) {
            amountInput.value = originalAmount;
        }
        return;
    }
    
    // Get current base amount (either from originalAmount or from amountInput if it's not readonly)
    let baseAmount = originalAmount;
    if (baseAmount === 0 && !amountInput.hasAttribute('readonly')) {
        baseAmount = parseFloat(amountInput.value) || 0;
    }
    
    if (baseAmount === 0) {
        return; // Can't apply discount if no base amount
    }
    
    let discount = 0;
    
    // Check if promo is a percentage (ends with %)
    if (promoValue.endsWith('%')) {
        const percentage = parseFloat(promoValue.replace('%', ''));
        if (!isNaN(percentage) && percentage >= 0 && percentage <= 100) {
            discount = (baseAmount * percentage) / 100;
        }
    } else {
        // Treat as fixed discount amount
        const fixedDiscount = parseFloat(promoValue);
        if (!isNaN(fixedDiscount) && fixedDiscount >= 0) {
            discount = Math.min(fixedDiscount, baseAmount); // Don't allow negative amounts
        }
    }
    
    // Calculate final amount
    const finalAmount = Math.max(0, baseAmount - discount);
    
    // Update amount field (temporarily remove readonly if needed)
    const wasReadonly = amountInput.hasAttribute('readonly');
    if (wasReadonly) {
        amountInput.removeAttribute('readonly');
    }
    amountInput.value = finalAmount.toFixed(2);
    if (wasReadonly) {
        amountInput.setAttribute('readonly', 'readonly');
    }
}

// Calculate expiry date based on date bought and duration
function calculateExpiryDate() {
    const dateBoughtInput = document.getElementById('dateBought');
    const durationInput = document.getElementById('duration');
    const dateExpiryInput = document.getElementById('dateExpiry');

    if (!dateBoughtInput || !durationInput || !dateExpiryInput) {
        return;
    }

    const dateBought = dateBoughtInput.value.trim();
    const duration = durationInput.value.trim();

    if (!dateBought || !duration) {
        if (dateExpiryInput) {
            dateExpiryInput.value = '';
        }
        return;
    }

    try {
        // Parse the date bought - ensure it's in YYYY-MM-DD format
        const dateParts = dateBought.split('-');
        if (dateParts.length !== 3) {
            dateExpiryInput.value = '';
            return;
        }

        const year = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
        const day = parseInt(dateParts[2]);
        
        const startDate = new Date(year, month, day);
        if (isNaN(startDate.getTime())) {
            dateExpiryInput.value = '';
            return;
        }

        const expiryDate = new Date(startDate);

        // Calculate expiry based on duration
        switch (duration) {
            case '1 month':
                expiryDate.setMonth(expiryDate.getMonth() + 1);
                break;
            case '6 Months':
                expiryDate.setMonth(expiryDate.getMonth() + 6);
                break;
            case '1 Year':
                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
                break;
            default:
                dateExpiryInput.value = '';
                return;
        }

        // Format as YYYY-MM-DD for date input
        const expiryYear = expiryDate.getFullYear();
        const expiryMonth = String(expiryDate.getMonth() + 1).padStart(2, '0');
        const expiryDay = String(expiryDate.getDate()).padStart(2, '0');
        const formattedDate = `${expiryYear}-${expiryMonth}-${expiryDay}`;
        
        // Remove readonly temporarily to set value
        dateExpiryInput.removeAttribute('readonly');
        
        // Set the value using multiple methods to ensure it works
        dateExpiryInput.value = formattedDate;
        dateExpiryInput.setAttribute('value', formattedDate);
        
        // Force a change event to ensure the value is recognized
        const event = new Event('input', { bubbles: true });
        dateExpiryInput.dispatchEvent(event);
        
        // Restore readonly
        dateExpiryInput.setAttribute('readonly', 'readonly');
        
        // Verify it was set correctly
        if (dateExpiryInput.value !== formattedDate) {
            // Try one more time without readonly
            dateExpiryInput.removeAttribute('readonly');
            dateExpiryInput.value = formattedDate;
            dateExpiryInput.setAttribute('value', formattedDate);
            dateExpiryInput.setAttribute('readonly', 'readonly');
        }
        
        console.log('Expiry date calculated:', {
            dateBought,
            duration,
            calculatedExpiry: formattedDate,
            actualValue: dateExpiryInput.value
        });
    } catch (error) {
        console.error('Error calculating expiry date:', error);
        if (dateExpiryInput) {
            dateExpiryInput.value = '';
        }
    }
}

// Open sale modal
function openSaleModal(sale = null) {
    currentEditingId = sale ? sale.id : null;
    const modal = document.getElementById('saleModal');
    const form = document.getElementById('saleForm');
    const title = document.getElementById('modalTitle');

    if (sale) {
        title.textContent = 'Edit Sale';
        document.getElementById('dateBought').value = sale.date_bought;
        document.getElementById('duration').value = sale.duration || '';
        document.getElementById('dateExpiry').value = sale.date_expiry || '';
        document.getElementById('customerName').value = sale.customer_name;
        document.getElementById('paymentMethod').value = sale.payment_method;
        document.getElementById('status').value = sale.status;
        
        // Set promo if exists
        const promoInput = document.getElementById('promo');
        if (promoInput && sale.promo) {
            promoInput.value = sale.promo;
        }
        
        // Handle plan selection
        const planSelect = document.getElementById('planSelect');
        const planName = sale.plan;
        
        // Check if it's a predefined plan
        if (PLAN_DATA[planName]) {
            planSelect.value = planName;
            // Apply readonly state and auto-fill for predefined plans
            handlePlanSelection();
            // For editing, we need to set originalAmount to the plan's base amount
            // and then apply promo if it exists
            if (sale.promo) {
                setTimeout(() => {
                    handlePromoChange();
                }, 100);
            }
        } else {
            // It's a custom plan or unknown plan - set to Custom Plan
            planSelect.value = 'Custom Plan';
            // Enable manual input for custom plan
            handlePlanSelection();
            // Set the actual values from the sale
            document.getElementById('cpu').value = sale.cpu;
            document.getElementById('ram').value = sale.ram;
            document.getElementById('disk').value = sale.disk;
            // For custom plans, we need to figure out the original amount
            // If there's a promo, we'll need to reverse calculate, but for now just set the amount
            originalAmount = parseFloat(sale.amount) || 0;
            document.getElementById('amount').value = sale.amount;
            if (sale.promo) {
                setTimeout(() => {
                    handlePromoChange();
                }, 100);
            }
        }
        
        // Always recalculate expiry date when editing to ensure it's up to date
        // If expiry is missing but we have date_bought and duration, calculate it
        if ((!sale.date_expiry || sale.date_expiry === '') && sale.date_bought && sale.duration) {
            setTimeout(() => {
                calculateExpiryDate();
            }, 100);
        } else if (sale.date_bought && sale.duration) {
            // Even if expiry exists, recalculate to ensure it's correct
            setTimeout(() => {
                calculateExpiryDate();
            }, 100);
        }
    } else {
        title.textContent = 'Add New Sale';
        form.reset();
        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('dateBought').value = today;
        document.getElementById('dateExpiry').value = '';
        // Reset plan selection
        document.getElementById('planSelect').value = '';
        handlePlanSelection();
    }

    modal.classList.remove('hidden');
    
    // Trigger calculation multiple times to ensure it works
    // The event delegation should handle field changes, but we also
    // trigger it when modal opens in case fields already have values
    setTimeout(() => {
        calculateExpiryDate();
    }, 50);
    
    setTimeout(() => {
        calculateExpiryDate();
    }, 200);
    
    setTimeout(() => {
        calculateExpiryDate();
    }, 500);
}

// Close sale modal
function closeSaleModal() {
    document.getElementById('saleModal').classList.add('hidden');
    document.getElementById('saleForm').reset();
    document.getElementById('planSelect').value = '';
    handlePlanSelection(); // Reset readonly states
    currentEditingId = null;
}

// Parse current RAM string to number (e.g. "6GB" -> 6)
function parseRamValue(str) {
    if (!str || typeof str !== 'string') return 0;
    const num = parseFloat(String(str).replace(/GB/gi, '').trim());
    return isNaN(num) ? 0 : num;
}

// Parse current CPU string to number (e.g. "3 vCores" -> 3, "150%" -> 150)
function parseCpuValue(str) {
    if (!str || typeof str !== 'string') return 0;
    const s = str.trim();
    const vCoreMatch = s.match(/(\d+(?:\.\d+)?)\s*vcores?/i);
    if (vCoreMatch) return parseFloat(vCoreMatch[1]);
    const pctMatch = s.match(/(\d+(?:\.\d+)?)\s*%?/);
    if (pctMatch) return parseFloat(pctMatch[1]);
    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
}

// Parse current disk/storage string to number (e.g. "20GB" -> 20)
function parseDiskValue(str) {
    if (!str || typeof str !== 'string') return 0;
    const num = parseFloat(String(str).replace(/GB/gi, '').trim());
    return isNaN(num) ? 0 : num;
}

// Format number back to RAM string (e.g. 7 -> "7GB")
function formatRamDisplay(num) {
    const n = parseFloat(num);
    return isNaN(n) ? '0GB' : (n % 1 === 0 ? n + 'GB' : n.toFixed(1) + 'GB');
}

// Format number back to CPU string - prefer vCores if it looks like whole number, else %
function formatCpuDisplay(num, originalStr) {
    const n = parseFloat(num);
    if (isNaN(n)) return originalStr || '0';
    if (originalStr && /%/.test(originalStr)) return n + '%';
    return n === 1 ? '1 vCore' : n + ' vCores';
}

// Format number back to disk string (e.g. 25 -> "25GB")
function formatDiskDisplay(num) {
    const n = parseFloat(num);
    return isNaN(n) ? '0GB' : (n % 1 === 0 ? n + 'GB' : n.toFixed(1) + 'GB');
}

// Open upgrade modal
function openUpgradeModal(id) {
    const sale = allSales.find(s => s.id === id);
    if (!sale) {
        console.error('Sale not found for upgrade:', id);
        return;
    }
    const modal = document.getElementById('upgradeModal');
    if (!modal) {
        console.error('Upgrade modal not found. Ensure you are on the sales page.');
        return;
    }
    currentUpgradeSale = sale;
    const infoEl = document.getElementById('upgradeCurrentInfo');
    if (infoEl) {
        infoEl.textContent = `Current: ${sale.ram} RAM, ${sale.cpu} CPU, ${sale.disk} Storage — ₱${formatCurrency(sale.amount)}. Enter amounts to add (leave blank to keep same).`;
    }
    const ramEl = document.getElementById('upgradeRam');
    const cpuEl = document.getElementById('upgradeCpu');
    const storageEl = document.getElementById('upgradeStorage');
    const amountEl = document.getElementById('upgradeAmount');
    if (ramEl) ramEl.value = '';
    if (cpuEl) cpuEl.value = '';
    if (storageEl) storageEl.value = '';
    if (amountEl) amountEl.value = '';
    modal.classList.remove('hidden');
}

// Close upgrade modal
function closeUpgradeModal() {
    document.getElementById('upgradeModal').classList.add('hidden');
    document.getElementById('upgradeForm').reset();
    currentUpgradeSale = null;
}

// Handle upgrade form submit — add values to current and PUT
async function handleUpgradeSubmit(e) {
    e.preventDefault();
    if (!currentUpgradeSale) return;

    const addRam = document.getElementById('upgradeRam').value.trim();
    const addCpu = document.getElementById('upgradeCpu').value.trim();
    const addStorage = document.getElementById('upgradeStorage').value.trim();
    const addAmount = document.getElementById('upgradeAmount').value.trim();

    const currentRam = parseRamValue(currentUpgradeSale.ram);
    const currentCpu = parseCpuValue(currentUpgradeSale.cpu);
    const currentDisk = parseDiskValue(currentUpgradeSale.disk);
    const currentAmount = parseFloat(currentUpgradeSale.amount) || 0;

    let newRam = currentRam;
    let newCpu = currentCpu;
    let newDisk = currentDisk;
    let newAmount = currentAmount;

    if (addRam) {
        const add = parseFloat(addRam.replace(/GB/gi, '').trim()) || 0;
        newRam = currentRam + add;
    }
    if (addCpu) {
        const add = parseFloat(addCpu.replace(/vcores?/gi, '').replace(/%/g, '').trim()) || 0;
        newCpu = currentCpu + add;
    }
    if (addStorage) {
        const add = parseFloat(addStorage.replace(/GB/gi, '').trim()) || 0;
        newDisk = currentDisk + add;
    }
    if (addAmount) {
        const add = parseFloat(addAmount) || 0;
        newAmount = currentAmount + add;
    }

    const saleData = {
        date_bought: currentUpgradeSale.date_bought,
        duration: currentUpgradeSale.duration || null,
        date_expiry: currentUpgradeSale.date_expiry || null,
        customer_name: currentUpgradeSale.customer_name,
        plan: currentUpgradeSale.plan,
        cpu: formatCpuDisplay(newCpu, currentUpgradeSale.cpu),
        ram: formatRamDisplay(newRam),
        disk: formatDiskDisplay(newDisk),
        amount: newAmount,
        promo: currentUpgradeSale.promo || null,
        payment_method: currentUpgradeSale.payment_method,
        status: currentUpgradeSale.status
    };

    try {
        const response = await fetch(`${API_BASE}/sales/${currentUpgradeSale.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(saleData)
        });

        const data = await response.json();

        if (response.ok) {
            closeUpgradeModal();
            setTimeout(() => {
                loadSales();
                loadStatistics();
            }, 100);
        } else {
            alert(data.error || 'Error saving upgrade');
        }
    } catch (err) {
        alert('Network error. Please try again.');
    }
}

// Handle sale form submit
async function handleSaleSubmit(e) {
    e.preventDefault();

    // Get form values
    const dateBought = document.getElementById('dateBought').value;
    const duration = document.getElementById('duration').value;
    const dateExpiryInput = document.getElementById('dateExpiry');
    
    // Force calculate expiry date synchronously before submit
    if (dateBought && duration) {
        // Calculate immediately
        calculateExpiryDate();
        
        // If expiry is still empty, calculate it manually here
        if (!dateExpiryInput.value) {
            try {
                const dateParts = dateBought.split('-');
                if (dateParts.length === 3) {
                    const startDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
                    const expiryDate = new Date(startDate);
                    
                    switch (duration) {
                        case '1 month':
                            expiryDate.setMonth(expiryDate.getMonth() + 1);
                            break;
                        case '6 Months':
                            expiryDate.setMonth(expiryDate.getMonth() + 6);
                            break;
                        case '1 Year':
                            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
                            break;
                    }
                    
                    const year = expiryDate.getFullYear();
                    const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
                    const day = String(expiryDate.getDate()).padStart(2, '0');
                    const formattedDate = `${year}-${month}-${day}`;
                    
                    // Force set the value
                    dateExpiryInput.removeAttribute('readonly');
                    dateExpiryInput.value = formattedDate;
                    dateExpiryInput.setAttribute('value', formattedDate);
                    dateExpiryInput.setAttribute('readonly', 'readonly');
                }
            } catch (error) {
                console.error('Error calculating expiry in submit:', error);
            }
        }
    }

    // Get plan name directly from dropdown
    const planName = document.getElementById('planSelect').value;

    const promoInput = document.getElementById('promo');
    const promoValue = promoInput ? promoInput.value.trim() : '';

    const saleData = {
        date_bought: dateBought,
        duration: duration,
        date_expiry: dateExpiryInput.value || null,
        customer_name: document.getElementById('customerName').value,
        plan: planName,
        cpu: document.getElementById('cpu').value,
        ram: document.getElementById('ram').value,
        disk: document.getElementById('disk').value,
        amount: parseFloat(document.getElementById('amount').value),
        payment_method: document.getElementById('paymentMethod').value,
        status: document.getElementById('status').value,
        promo: promoValue || null
    };
    
    // Debug: log the data being sent (can remove this later)
    if (!saleData.date_expiry) {
        console.warn('Warning: date_expiry is empty before submit!', {
            dateBought: saleData.date_bought,
            duration: saleData.duration,
            dateExpiryValue: dateExpiryInput.value
        });
    } else {
        console.log('Sale data ready to submit:', saleData);
    }

    try {
        const url = currentEditingId 
            ? `${API_BASE}/sales/${currentEditingId}`
            : `${API_BASE}/sales`;
        
        const method = currentEditingId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(saleData)
        });

        const data = await response.json();

        if (response.ok) {
            console.log('Sale saved successfully, reloading sales...');
            closeSaleModal();
            // Small delay to ensure database write is complete
            setTimeout(() => {
                loadSales();
                loadStatistics();
                // Switch to sales page to see the new/updated sale
                switchPage('sales');
            }, 100);
        } else {
            console.error('Error saving sale:', data);
            alert(data.error || 'Error saving sale');
        }
    } catch (error) {
        alert('Network error. Please try again.');
    }
}

// Edit sale
async function editSale(id) {
    try {
        const response = await fetch(`${API_BASE}/sales`, {
            credentials: 'include'
        });
        const sales = await response.json();
        const sale = sales.find(s => s.id === id);
        
        if (sale) {
            openSaleModal(sale);
        }
    } catch (error) {
        console.error('Error loading sale:', error);
    }
}

// Renew sale
async function renewSale(id) {
    if (!confirm('Are you sure you want to renew this subscription? The expiry date will be extended based on the duration.')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/sales/${id}/renew`, {
            method: 'POST',
            credentials: 'include'
        });

        const data = await response.json();

        if (response.ok) {
            loadSales();
            loadStatistics();
            alert('Subscription renewed successfully!');
            // Switch to sales page to see the updated expiry
            switchPage('sales');
        } else {
            alert(data.error || 'Error renewing subscription');
        }
    } catch (error) {
        alert('Network error. Please try again.');
    }
}

// Delete sale
async function deleteSale(id) {
    if (!confirm('Are you sure you want to delete this sale?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/sales/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        const data = await response.json();

        if (response.ok) {
            // Remove from local array immediately for instant UI update
            allSales = allSales.filter(sale => sale.id !== id);
            
            // Update display immediately without calling loadSales (which would spam)
            // Just filter and display what we have
            let filteredSales = [...allSales];

            // Apply month filter if set
            if (currentMonth && currentYear) {
                filteredSales = filteredSales.filter(sale => {
                    const saleDate = new Date(sale.date_bought);
                    const saleMonth = String(saleDate.getMonth() + 1).padStart(2, '0');
                    const saleYear = String(saleDate.getFullYear());
                    return saleMonth === currentMonth.padStart(2, '0') && saleYear === currentYear;
                });
            }

            // Apply search filter if set
            if (currentSearchQuery) {
                filteredSales = filteredSales.filter(sale => {
                    return sale.customer_name.toLowerCase().includes(currentSearchQuery);
                });
            }

            // Display filtered sales immediately
            displaySales(filteredSales);
            
            // Reload statistics and refresh from server in background (but only once)
            loadStatistics();
            
            // Reload from server after a short delay to ensure consistency
            setTimeout(async () => {
                await loadSales();
            }, 500);
        } else {
            alert(data.error || 'Error deleting sale');
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('Network error. Please try again.');
    }
}

// Export sales to Excel
async function handleExport() {
    try {
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.textContent = 'Exporting...';
        }

        const response = await fetch(`${API_BASE}/sales/export`, {
            credentials: 'include'
        });

        if (!response.ok) {
            // Check if response is JSON or HTML/text
            const contentType = response.headers.get('content-type');
            let errorMessage = 'Export failed';
            
            if (contentType && contentType.includes('application/json')) {
                try {
                    const error = await response.json();
                    errorMessage = error.error || errorMessage;
                } catch (e) {
                    errorMessage = `Server error: ${response.status} ${response.statusText}`;
                }
            } else {
                // If it's HTML or text, read as text
                const text = await response.text();
                if (text.includes('Unauthorized') || response.status === 401) {
                    errorMessage = 'Unauthorized. Please login again.';
                } else {
                    errorMessage = `Server error: ${response.status} ${response.statusText}`;
                }
            }
            throw new Error(errorMessage);
        }

        // Check if response is actually an Excel file
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('spreadsheet') && !contentType.includes('excel')) {
            const text = await response.text();
            console.error('Unexpected response:', text.substring(0, 200));
            throw new Error('Server returned an unexpected response. Please check console for details.');
        }

        // Get the blob
        const blob = await response.blob();
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sales_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        // Show success message
        alert('Sales data exported successfully!');
    } catch (error) {
        console.error('Export error:', error);
        alert('Error exporting sales: ' + error.message);
    } finally {
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = '📥 Export';
        }
    }
}

// Import sales from Excel
async function handleImport(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    // Validate file type
    const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv'
    ];
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();

    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
        alert('Invalid file type. Please upload an Excel file (.xlsx, .xls) or CSV file.');
        event.target.value = '';
        return;
    }

    if (!confirm(`Are you sure you want to import ${file.name}? This will add new sales records to the database.`)) {
        event.target.value = '';
        return;
    }

    try {
        const formData = new FormData();
        formData.append('file', file);

        // Show loading
        const importLabel = document.querySelector('label[for="importFile"]');
        if (importLabel) {
            importLabel.style.opacity = '0.6';
            importLabel.style.pointerEvents = 'none';
        }

        const response = await fetch(`${API_BASE}/sales/import`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Import failed');
        }

        // Show results
        let message = `Import completed!\n\n`;
        message += `✅ Successful: ${data.successCount}\n`;
        message += `❌ Errors: ${data.errorCount}\n\n`;
        
        if (data.errors && data.errors.length > 0) {
            message += `First few errors:\n${data.errors.slice(0, 5).join('\n')}`;
            if (data.errors.length > 5) {
                message += `\n... and ${data.errors.length - 5} more errors`;
            }
        }

        alert(message);

        // Reload sales and statistics
        if (data.successCount > 0) {
            loadSales();
            loadStatistics();
        }
    } catch (error) {
        console.error('Import error:', error);
        alert('Error importing sales: ' + error.message);
    } finally {
        // Reset file input
        event.target.value = '';
        
        // Reset loading state
        const importLabel = document.querySelector('label[for="importFile"]');
        if (importLabel) {
            importLabel.style.opacity = '1';
            importLabel.style.pointerEvents = 'auto';
        }
    }
}

// Utility functions
function formatCurrency(amount) {
    return parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
