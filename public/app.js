// API Base URL
const API_BASE = '/api';

// State
let currentEditingId = null;
let currentMonth = '';
let currentYear = '';
let allSalesData = []; // Store all sales for client-side filtering
let currentSearchQuery = '';

// Plan definitions
const PLAN_DATA = {
    'Pig Plan': {
        amount: 85,
        ram: '2GB',
        cpu: '100%',
        disk: '5GB'
    },
    'Sheep Plan': {
        amount: 140,
        ram: '4GB',
        cpu: '100%',
        disk: '10GB'
    },
    'Cow Plan': {
        amount: 225,
        ram: '6GB',
        cpu: '150%',
        disk: '20GB'
    },
    'Creeper Plan': {
        amount: 379,
        ram: '8GB',
        cpu: '150%',
        disk: '20GB'
    },
    'Zombie Plan': {
        amount: 459,
        ram: '10GB',
        cpu: '200%',
        disk: '35GB'
    },
    'Skeleton Plan': {
        amount: 549,
        ram: '12GB',
        cpu: '250%',
        disk: '40GB'
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
        const response = await fetch(`${API_BASE}/session`);
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
            // Hide month filter when on home tab
            const monthFilterContainer = document.getElementById('monthFilterContainer');
            if (monthFilterContainer) {
                monthFilterContainer.style.display = 'none';
            }
            // Reset month filter to show all time statistics
            currentMonth = '';
            currentYear = '';
            // Load statistics for home page (all time)
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
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // Register form
    document.getElementById('registerForm').addEventListener('submit', handleRegister);

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

    // Customer search
    const customerSearch = document.getElementById('customerSearch');
    if (customerSearch) {
        customerSearch.addEventListener('input', handleCustomerSearch);
    }

    // Add sale button
    const addSaleBtn = document.getElementById('addSaleBtn');
    if (addSaleBtn) {
        addSaleBtn.addEventListener('click', () => openSaleModal());
    }

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
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = '';

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            showApp();
            document.getElementById('loginForm').reset();
        } else {
            errorDiv.textContent = data.error || 'Login failed';
        }
    } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
    }
}

// Handle register
async function handleRegister(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('registerError');
    errorDiv.textContent = '';

    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const repeatPassword = document.getElementById('repeatPassword').value;

    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, repeatPassword })
        });

        const data = await response.json();

        if (response.ok) {
            errorDiv.textContent = 'Registration successful! Please login.';
            errorDiv.style.color = '#10b981';
            setTimeout(() => {
                switchTab('login');
                document.getElementById('registerForm').reset();
            }, 1500);
        } else {
            errorDiv.textContent = data.error || 'Registration failed';
        }
    } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
    }
}

// Handle logout
async function handleLogout() {
    try {
        await fetch(`${API_BASE}/logout`, { method: 'POST' });
        showAuthModal();
        document.getElementById('salesTableBody').innerHTML = '<tr><td colspan="11" class="empty-state">No sales records found</td></tr>';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Load available months
async function loadMonths() {
    try {
        const response = await fetch(`${API_BASE}/sales/months`);
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

// Handle customer search
function handleCustomerSearch(e) {
    currentSearchQuery = e.target.value.trim().toLowerCase();
    filterAndDisplaySales();
}

// Filter and display sales based on month filter and search query
function filterAndDisplaySales() {
    let filteredSales = [...allSalesData];

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
}

// Display sales in the table
function displaySales(sales) {
    const tbody = document.getElementById('salesTableBody');
    
    if (sales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="empty-state">No sales records found</td></tr>';
        return;
    }

    tbody.innerHTML = sales.map(sale => `
        <tr>
            <td>${formatDate(sale.date_bought)}</td>
            <td>${sale.date_expiry ? formatDate(sale.date_expiry) : '-'}</td>
            <td>${escapeHtml(sale.customer_name)}</td>
            <td>${escapeHtml(sale.plan)}</td>
            <td>${escapeHtml(sale.cpu)}</td>
            <td>${escapeHtml(sale.ram)}</td>
            <td>${escapeHtml(sale.disk)}</td>
            <td>₱${formatCurrency(sale.amount)}</td>
            <td>${escapeHtml(sale.payment_method)}</td>
            <td><span class="status-badge ${sale.status.toLowerCase()}">${sale.status}</span></td>
            <td>${escapeHtml(sale.created_by_username)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-edit" onclick="editSale(${sale.id})">Edit</button>
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

        const response = await fetch(`${API_BASE}/sales?${params}`);
        const sales = await response.json();

        // Store all sales data
        allSalesData = sales;

        // Apply filters and display
        filterAndDisplaySales();
    } catch (error) {
        console.error('Error loading sales:', error);
    }
}

// Load statistics
async function loadStatistics() {
    try {
        const params = new URLSearchParams();
        if (currentMonth && currentYear) {
            params.append('month', currentMonth);
            params.append('year', currentYear);
        }

        const response = await fetch(`${API_BASE}/statistics?${params}`);
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
        document.getElementById('advertiserSalary').textContent = `₱${formatCurrency(stats.salaries.advertiser)}`;
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

// Handle plan selection
function handlePlanSelection() {
    const planSelect = document.getElementById('planSelect');
    const selectedPlan = planSelect.value;
    const cpuInput = document.getElementById('cpu');
    const ramInput = document.getElementById('ram');
    const diskInput = document.getElementById('disk');
    const amountInput = document.getElementById('amount');

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
    } else if (selectedPlan && PLAN_DATA[selectedPlan]) {
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
        amountInput.value = planData.amount;
        amountInput.setAttribute('readonly', 'readonly');
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
        
        // Handle plan selection
        const planSelect = document.getElementById('planSelect');
        const planName = sale.plan;
        
        // Check if it's a predefined plan
        if (PLAN_DATA[planName]) {
            planSelect.value = planName;
            // Apply readonly state and auto-fill for predefined plans
            handlePlanSelection();
        } else {
            // It's a custom plan or unknown plan - set to Custom Plan
            planSelect.value = 'Custom Plan';
            // Enable manual input for custom plan
            handlePlanSelection();
            // Set the actual values from the sale
            document.getElementById('cpu').value = sale.cpu;
            document.getElementById('ram').value = sale.ram;
            document.getElementById('disk').value = sale.disk;
            document.getElementById('amount').value = sale.amount;
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
        status: document.getElementById('status').value
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
                // Clear search to show all results after adding/editing
                const customerSearch = document.getElementById('customerSearch');
                if (customerSearch) {
                    customerSearch.value = '';
                    currentSearchQuery = '';
                }
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
        const response = await fetch(`${API_BASE}/sales`);
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
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok) {
            loadSales();
            loadStatistics();
            alert('Subscription renewed successfully!');
            // Keep search filter active after renewal
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
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            loadSales();
            loadStatistics();
            // Keep search filter active after deletion
        } else {
            alert(data.error || 'Error deleting sale');
        }
    } catch (error) {
        alert('Network error. Please try again.');
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
