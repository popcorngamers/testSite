let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let assignedCustomers = [];
let chemicalChart;
let allCustomers = [];
let allEmployees = [];

document.addEventListener('DOMContentLoaded', () => {
    updateLogoutButton();
    const path = window.location.pathname.split('/').pop();

    if (path === 'pay-bill.html') {
        if (!currentUser || currentUser.type !== 'user' || currentUser.is_admin) {
            window.location.href = 'account.html';
        } else {
            loadPaymentPage();
        }
    }
    else if (path === 'account.html') {
        if (currentUser) {
            document.getElementById('auth-forms').style.display = 'none';
            if (currentUser.type === 'user') {
                if (currentUser.is_admin) {
                    window.location.href = 'admin.html';
                } else {
                    loadCustomerDetails();
                }
            } else if (currentUser.type === 'employee') {
                window.location.href = 'employee.html';
            }
        } else {
            document.getElementById('auth-forms').style.display = 'block';
            document.getElementById('customer-details').style.display = 'none';
        }
    } else if (path === 'employee.html') {
        if (!currentUser || currentUser.type !== 'employee') {
            window.location.href = 'account.html';
        } else {
            loadEmployeeData();
        }
    } else if (path === 'admin.html') {
        if (!currentUser || !currentUser.is_admin) {
            window.location.href = 'account.html';
        } else {
            loadAdminTab('home');
            document.getElementById('logged-in-user').textContent = `Logged in as: ${currentUser.name}`;
        }
    } else if (path === 'start-service.html') {
        if (!currentUser || currentUser.type !== 'employee') {
            window.location.href = 'account.html';
        } else {
            loadCustomerOptions();
        }
    } else if (path === 'edit-service-log.html') {
        if (!currentUser || currentUser.type !== 'employee') {
            window.location.href = 'account.html';
        } else {
            loadServiceLogForEdit();
        }
    } else if (path === 'set-password.html') {
        // No specific initialization needed
    }
});

async function loadPaymentPage() {
    try {
        const response = await fetch(`/customer-owed/${currentUser.id}`);
        const data = await response.json();
        document.getElementById('amount-owed').textContent = data.total_owed.toFixed(2);
        document.getElementById('payment-amount').value = data.total_owed.toFixed(2);
    } catch (error) {
        console.error('Error loading payment page:', error);
        document.getElementById('amount-owed').textContent = 'Error';
    }
}

async function processPayment() {
    const amount = parseFloat(document.getElementById('payment-amount')?.value);
    if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid payment amount.');
        return;
    }

    try {
        const response = await fetch('/process-customer-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, amount })
        });
        const result = await response.json();

        if (result.error) {
            alert(result.error);
        } else {
            alert(`Payment of $${amount.toFixed(2)} processed successfully! ${result.remaining > 0 ? `Remaining: $${result.remaining.toFixed(2)}` : ''}`);
            window.location.href = 'account.html'; // Redirect back to account page
        }
    } catch (error) {
        console.error('Error processing payment:', error);
        alert('Failed to process payment. Check console for details.');
    }
}

// Debounce function to limit filter calls (optional)
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function attachFilterListeners() {
    const searchInput = document.getElementById('customer-search');
    const employeeFilter = document.getElementById('employee-filter');

    if (searchInput && employeeFilter) {
        searchInput.removeEventListener('input', filterCustomers);
        employeeFilter.removeEventListener('change', filterCustomers);

        searchInput.addEventListener('input', debounce(() => {
           //console.log('Search input changed');
            filterCustomers();
        }, 300));
        employeeFilter.addEventListener('change', () => {
           //console.log('Employee filter changed');
            filterCustomers();
        });
       //console.log('Event listeners attached successfully');
    } else {
        console.warn('Filter elements not found');
    }
}

function loadAdminTab(tab) {
    const buttons = document.querySelectorAll('.admin-header .tab-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.admin-header .tab-btn[onclick="loadAdminTab('${tab}')"]`).classList.add('active');
    const dynamicContent = document.getElementById('dynamic-content');
    if (tab !== 'customers' || !document.getElementById('customer-table')) {
        dynamicContent.innerHTML = `<h3>${tab.charAt(0).toUpperCase() + tab.slice(1)}</h3>`;
    }
    if (tab === 'home') {
        dynamicContent.innerHTML += '<p>Welcome to the Admin Dashboard.</p>';
    } else if (tab === 'my-account') {
        dynamicContent.innerHTML += `
            <p>Name: ${currentUser.name}</p>
            <p>Email: ${currentUser.email}</p>
        `;
    } else if (tab === 'customers') {
        loadAdminContent('manage-customers');
    }
}

async function loadAdminContent(task) {
    const dynamicContent = document.getElementById('dynamic-content');
    if (task !== 'manage-customers' || !document.getElementById('customer-table')) {
       //console.log(`Overwriting dynamic-content for task: ${task}`);
        dynamicContent.innerHTML = `<h3>${task.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</h3>`;
    }

    try {
        switch (task) {
            case 'analytics':
                await loadAnalytics(dynamicContent);
                break;
            case 'manage-customers':
                await loadManageCustomers(dynamicContent);
                break;
            case 'customer-logs':
                dynamicContent.innerHTML += '<p>Select a customer to view logs.</p>';
                break;
            case 'manage-receivables':
                dynamicContent.innerHTML += '<p>Receivables management coming soon.</p>';
                break;
            case 'assign-customers':
                dynamicContent.innerHTML += `
                    <select id="employee-select"></select>
                    <select id="customer-select"></select>
                    <button onclick="assignPool()">Assign Pool</button>
                `;
                await loadAdminData();
                break;
            case 'employee-records':
                await loadEmployeeRecords(dynamicContent);
                break;
            case 'create-employee':
                dynamicContent.innerHTML += `
                    <form onsubmit="event.preventDefault(); createEmployee();">
                        <input type="text" id="employee-name" placeholder="Name" required>
                        <input type="email" id="employee-email" placeholder="Email" required>
                        <input type="password" id="employee-password" placeholder="Password" required>
                        <button type="submit">Create Employee</button>
                    </form>
                `;
                break;
                case 'create-customer':
                    dynamicContent.innerHTML += `
                        <form onsubmit="event.preventDefault(); createCustomer();">
                            <input type="text" id="customer-name" placeholder="Name" required>
                            <input type="email" id="customer-email" placeholder="Email" required>
                            <input type="tel" id="customer-phone" placeholder="Phone" required>
                            <input type="text" id="customer-address" placeholder="Address" required>
                            <input type="number" id="pool-size" placeholder="Pool Size (gallons)" required>
                            <input type="text" id="access-code" placeholder="Access Code (e.g., gate code)">
                            <input type="text" id="lock-combo" placeholder="Lock/Combo">
                            <input type="text" id="dogs" placeholder="Dogs (e.g., Yes - 2, No)">
                            <input type="text" id="access-side" placeholder="Access Side (e.g., Left, Right)">
                            <select id="service-frequency" required>
                                <option value="">Select Service Frequency</option>
                                <option value="weekly">Weekly ($125)</option>
                                <option value="bi-weekly">Bi-weekly ($100)</option>
                                <option value="monthly">Monthly ($75)</option>
                            </select>
                            <textarea id="additional-info" placeholder="Additional Info"></textarea>
                            <button type="submit">Create Customer</button>
                        </form>
                        <p id="customer-link" style="display: none;"></p>
                    `;
                    break;
            case 'analytics':
                dynamicContent.innerHTML += '<p>Analytics dashboard coming soon.</p>';
                break;
            case 'manage-employees':
                await loadManageEmployees(dynamicContent);
                break;
        }
    } catch (error) {
        console.error(`Error loading ${task}:`, error);
        dynamicContent.innerHTML += '<p>Error loading content.</p>';
    }
}

async function loadAnalytics(container) {
    try {
        const response = await fetch('/analytics');
        const data = await response.json();

        container.innerHTML += `
            <div class="analytics-summary">
                <h4>Total Revenue: $${data.total_revenue.toFixed(2)}</h4>
                <h4>Total Owed Balances: $${data.total_owed.toFixed(2)}</h4>
                <h4>Total Chemicals Used:</h4>
                <ul>
                    ${Object.entries(data.chemicals_used).map(([chemical, amount]) => `<li>${chemical}: ${amount.toFixed(2)} lbs</li>`).join('')}
                </ul>
            </div>
            <h4>Invoices</h4>
            <table>
                <thead>
                    <tr>
                        <th>Invoice Number</th>
                        <th>Customer</th>
                        <th>Amount Due</th>
                        <th>Amount Paid</th>
                        <th>Issue Date</th>
                        <th>Due Date</th>
                        <th>Last Payment</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="invoice-list"></tbody>
            </table>
        `;

        const tbody = document.getElementById('invoice-list');
        tbody.innerHTML = data.invoices.length === 0
            ? '<tr><td colspan="9">No invoices found.</td></tr>'
            : data.invoices.map(i => `
                <tr>
                    <td data-label="Invoice Number">${i.invoice_number}</td>
                    <td data-label="Customer">${i.customer_name}</td>
                    <td data-label="Amount Due">$${i.amount_due.toFixed(2)}</td>
                    <td data-label="Amount Paid">$${i.amount_paid.toFixed(2)}</td>
                    <td data-label="Issue Date">${i.issue_date}</td>
                    <td data-label="Due Date">${i.due_date}</td>
                    <td data-label="Last Payment">${i.last_payment_date || 'N/A'}</td>
                    <td data-label="Status">${i.status}</td>
                    <td data-label="Action">
                        ${i.status !== 'paid' ? `<button onclick="recordPayment(${i.id}, ${i.amount_due - i.amount_paid})">Pay Remaining</button>` : ''}
                    </td>
                </tr>
            `).join('');
    } catch (error) {
        console.error('Error loading analytics:', error);
        container.innerHTML += '<p>Failed to load analytics data.</p>';
    }
}

async function recordPayment(invoiceId, remainingAmount) {
    const amount = prompt(`Enter payment amount (remaining: $${remainingAmount.toFixed(2)}):`, remainingAmount);
    if (!amount || isNaN(amount) || amount <= 0) {
        alert('Invalid amount entered.');
        return;
    }

    try {
        const response = await fetch('/record-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invoice_id: invoiceId, amount_paid: parseFloat(amount) })
        });
        const result = await response.json();

        if (result.error) {
            alert(result.error);
        } else {
            alert('Payment recorded successfully!');
            loadAdminContent('analytics');
        }
    } catch (error) {
        console.error('Error recording payment:', error);
        alert('Failed to record payment.');
    }
}

async function loadManageCustomers(container) {
    try {
        const customerResponse = await fetch('/customers');
        allCustomers = await customerResponse.json();
        const employeeResponse = await fetch('/employees');
        allEmployees = await employeeResponse.json();

        if (!Array.isArray(allCustomers) || !Array.isArray(allEmployees)) {
            throw new Error('Invalid data format from server');
        }

        if (!document.getElementById('customer-table')) {
            container.innerHTML = `
                <div class="customer-filters">
                    <input type="text" id="customer-search" placeholder="Search by Name, Address, or Phone">
                    <select id="employee-filter">
                        <option value="">All Employees</option>
                        ${allEmployees.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
                    </select>
                </div>
                <table id="customer-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Phone</th>
                            <th>Address</th>
                            <th>Pool Size</th>
                            <th>Access Code</th>
                            <th>Lock/Combo</th>
                            <th>Dogs</th>
                            <th>Access Side</th>
                            <th>Active</th>
                            <th>Assigned Employee</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="customer-list"></tbody>
                </table>
            `;
        }

        renderCustomerList(allCustomers);
        attachFilterListeners();
    } catch (error) {
        console.error('Error in loadManageCustomers:', error);
        container.innerHTML += '<p>Failed to load customers. Check console for details.</p>';
    }
}

function renderCustomerList(customers) {
    const tbody = document.getElementById('customer-list');
    if (!tbody) {
        console.error('customer-list tbody not found');
        return;
    }

    tbody.innerHTML = customers.length === 0
        ? '<tr><td colspan="12">No customers found.</td></tr>'
        : customers.map(c => {
            const assignedEmployee = allEmployees.find(e => e.id === c.assigned_employee_id) || { name: 'Unassigned' };
            return `
                <tr>
                    <td data-label="Name">${c.name || 'N/A'}</td>
                    <td data-label="Email">${c.email || 'N/A'}</td>
                    <td data-label="Phone">${formatPhoneNumber(c.phone || '')}</td>
                    <td data-label="Address">${c.address || 'N/A'}</td>
                    <td data-label="Pool Size">${c.pool_size || 'N/A'}</td>
                    <td data-label="Access Code">${c.access_code || 'N/A'}</td>
                    <td data-label="Lock/Combo">${c.lock_combo || 'N/A'}</td>
                    <td data-label="Dogs">${c.dogs || 'N/A'}</td>
                    <td data-label="Access Side">${c.access_side || 'N/A'}</td>
                    <td data-label="Active">${c.is_active ? 'Yes' : 'No'}</td>
                    <td data-label="Assigned Employee">${assignedEmployee.name}</td>
                    <td data-label="Actions"><button onclick="viewCustomerLogs(${c.id})">View Logs</button></td>
                </tr>
            `;
        }).join('');
}

async function filterCustomers() {
   //console.log('filterCustomers triggered');

    const container = document.getElementById('dynamic-content');
    if (!container) {
        console.error('dynamic-content not found');
        return;
    }

    // Ensure table exists before proceeding
    if (!document.getElementById('customer-table') || !document.getElementById('customer-list')) {
        console.warn('Customer table missing, re-loading manage-customers');
        await loadManageCustomers(container);
    }

    const searchInput = document.getElementById('customer-search');
    const employeeFilter = document.getElementById('employee-filter');

    if (!searchInput || !employeeFilter) {
        console.error('Filter elements not found after re-render');
        return;
    }

    // Fetch fresh data
    try {
        const customerResponse = await fetch('/customers');
        allCustomers = await customerResponse.json();
        const employeeResponse = await fetch('/employees');
        allEmployees = await employeeResponse.json();

       //console.log('Fresh customers fetched:', JSON.stringify(allCustomers, null, 2));
       //console.log('Fresh employees fetched:', JSON.stringify(allEmployees, null, 2));
    } catch (error) {
        console.error('Error fetching fresh data:', error);
        return;
    }

    const searchTerm = searchInput.value.toLowerCase().trim();
    const employeeId = employeeFilter.value;

   //console.log('Search term:', searchTerm);
   //console.log('Selected employee ID:', employeeId);

    let filteredCustomers = [...allCustomers];

    if (searchTerm) {
        filteredCustomers = filteredCustomers.filter(c => {
            const name = (c.name || '').toLowerCase();
            const address = (c.address || '').toLowerCase();
            const phone = (c.phone || '').toLowerCase();
            const matches = name.includes(searchTerm) || address.includes(searchTerm) || phone.includes(searchTerm);
           //console.log(`Customer ${c.name}: Search match = ${matches}`);
            return matches;
        });
    }

    if (employeeId) {
        filteredCustomers = filteredCustomers.filter(c => {
            const assignedId = c.assigned_employee_id;
            const match = assignedId && assignedId.toString() === employeeId;
           //console.log(`Customer ${c.name}: Employee filter ${assignedId} vs ${employeeId} = ${match}`);
            return match;
        });
    }

   //console.log('Filtered customers:', filteredCustomers);
    renderCustomerList(filteredCustomers);
}

async function loadCustomers(container) {
    const response = await fetch('/customers');
    const customers = await response.json();
    container.innerHTML += `
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Address</th>
                    <th>Pool Size</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${customers.map(c => `
                    <tr>
                        <td data-label="Name">${c.name}</td>
                        <td data-label="Email">${c.email}</td>
                        <td data-label="Phone">${formatPhoneNumber(c.phone)}</td>
                        <td data-label="Address">${c.address}</td>
                        <td data-label="Pool Size">${c.pool_size || 'N/A'}</td>
                        <td data-label="Actions"><button onclick="viewCustomerLogs(${c.id})">View Logs</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function loadEmployeeRecords(container) {
    const response = await fetch('/employees');
    const employees = await response.json();
    container.innerHTML += `
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Completed Jobs</th>
                </tr>
            </thead>
            <tbody>
                ${employees.map(e => `
                    <tr>
                        <td data-label="Name">${e.name}</td>
                        <td data-label="Email">${e.email}</td>
                        <td data-label="Completed Jobs">-</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function loadManageEmployees(container) {
    const response = await fetch('/employees');
    const employees = await response.json();
    container.innerHTML += `
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${employees.map(e => `
                    <tr>
                        <td data-label="Name">${e.name}</td>
                        <td data-label="Email">${e.email}</td>
                        <td data-label="Actions"><button onclick="alert('Delete ${e.name}?')">Delete</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function formatPhoneNumber(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return phone;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function updateLogoutButton() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.style.display = currentUser ? 'inline-block' : 'none';
    }
}

async function login() {
    const email = document.getElementById('login-email')?.value;
    const password = document.getElementById('login-password')?.value;
    if (!email || !password) {
        alert('Please enter both email and password.');
        return;
    }

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const result = await response.json();

        if (result.error) {
            alert(result.error);
        } else {
            currentUser = result;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateLogoutButton();
            document.getElementById('auth-forms').style.display = 'none';
            if (result.type === 'user') {
                if (result.is_admin) {
                    window.location.href = 'admin.html';
                } else {
                    loadCustomerDetails();
                }
            } else if (result.type === 'employee') {
                window.location.href = 'employee.html';
            }
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Check console for details.');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    updateLogoutButton();
    window.location.href = 'account.html';
    // Ensure login form is shown on redirect
    setTimeout(() => {
        document.getElementById('auth-forms').style.display = 'block';
        document.getElementById('customer-details').style.display = 'none';
    }, 0);
}

async function loadCustomerDetails() {
    document.getElementById('customer-details').style.display = 'block';
    document.getElementById('user-name').textContent = currentUser.name;
    document.getElementById('user-email').textContent = currentUser.email;
    document.getElementById('user-phone-display').textContent = currentUser.phone || 'N/A';
    document.getElementById('user-address').textContent = currentUser.address || 'N/A';
    document.getElementById('pool-size').textContent = currentUser.pool_size || 'N/A';
    document.getElementById('access-code-display').textContent = currentUser.access_code || 'N/A';
    document.getElementById('lock-combo-display').textContent = currentUser.lock_combo || 'N/A';
    document.getElementById('dogs-display').textContent = currentUser.dogs || 'N/A';
    document.getElementById('access-side-display').textContent = currentUser.access_side || 'N/A';
    document.getElementById('additional-info-display').textContent = currentUser.additional_info || 'None';

    // Pre-fill form fields (hidden initially)
    document.getElementById('user-phone').value = currentUser.phone || '';
    document.getElementById('access-code').value = currentUser.access_code || '';
    document.getElementById('lock-combo').value = currentUser.lock_combo || '';
    document.getElementById('dogs').value = currentUser.dogs || '';
    document.getElementById('access-side').value = currentUser.access_side || '';
    document.getElementById('additional-info').value = currentUser.additional_info || '';

    // Fetch and display amount owed
    try {
        const response = await fetch(`/customer-owed/${currentUser.id}`);
        const data = await response.json();
        document.getElementById('amount-owed').textContent = data.total_owed.toFixed(2);
    } catch (error) {
        console.error('Error fetching amount owed:', error);
        document.getElementById('amount-owed').textContent = 'Error';
    }

    await loadServiceLogs(currentUser.id);
}

function toggleSettings() {
    const settingsForm = document.getElementById('settings-form');
    settingsForm.style.display = settingsForm.style.display === 'none' ? 'block' : 'none';
}

async function updateCustomerInfo() {
    const phone = document.getElementById('user-phone')?.value;
    const access_code = document.getElementById('access-code')?.value;
    const lock_combo = document.getElementById('lock-combo')?.value;
    const dogs = document.getElementById('dogs')?.value;
    const access_side = document.getElementById('access-side')?.value;
    const additional_info = document.getElementById('additional-info')?.value;

    try {
        const response = await fetch('/update-customer-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                phone,
                access_code,
                lock_combo,
                dogs,
                access_side,
                additional_info
            })
        });
        const result = await response.json();

        if (result.error) {
            alert(result.error);
        } else {
            alert('Customer info updated successfully!');
            currentUser = { ...currentUser, phone, access_code, lock_combo, dogs, access_side, additional_info };
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            loadCustomerDetails(); // Refresh display
        }
    } catch (error) {
        console.error('Error updating customer info:', error);
        alert('Failed to update customer info.');
    }
}

async function saveCustomerNotes() {
    const additionalInfo = document.getElementById('additional-info')?.value;
    try {
        const response = await fetch('/update-customer-notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUser.id, additional_info: additionalInfo })
        });
        const result = await response.json();

        if (result.error) {
            alert(result.error);
        } else {
            alert('Notes updated successfully!');
            currentUser.additional_info = additionalInfo;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
        }
    } catch (error) {
        console.error('Error saving notes:', error);
        alert('Failed to save notes.');
    }
}

async function loadServiceLogs(userId) {
    try {
        const response = await fetch(`/service-logs/${userId}`);
        const logs = await response.json();
        const tbody = document.getElementById('service-entries');
        tbody.innerHTML = '';
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10">No service logs found.</td></tr>';
        } else {
            logs.forEach(log => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td data-label="Date">${log.date}</td>
                    <td data-label="Before Photo"><img src="${log.before_photo}" alt="Before" class="clickable" onclick="expandImage('${log.before_photo}')"></td>
                    <td data-label="After Photo"><img src="${log.after_photo}" alt="After" class="clickable" onclick="expandImage('${log.after_photo}')"></td>
                    <td data-label="Free Chlorine">${log.free_chlorine || ''}</td>
                    <td data-label="pH">${log.ph || ''}</td>
                    <td data-label="Total Alkalinity">${log.total_alkalinity || ''}</td>
                    <td data-label="Stabilizer">${log.stabilizer || ''}</td>
                    <td data-label="Calcium Hardness">${log.calcium_hardness || ''}</td>
                    <td data-label="Water Temp">${log.water_temp || ''}</td>
                    <td data-label="Chemicals Added">${log.chemicals_added || ''}</td>
                `;
                tbody.appendChild(tr);
            });
            renderChemicalChart(logs);
        }
    } catch (error) {
        console.error('Error loading service logs:', error);
        document.getElementById('service-entries').innerHTML = '<tr><td colspan="10">Error loading logs.</td></tr>';
    }
}

function renderChemicalChart(logs) {
    const ctx = document.getElementById('chemicalChart')?.getContext('2d');
    if (!ctx) return;

    const dates = logs.map(log => log.date);
    const datasets = [
        { label: 'Free Chlorine (ppm)', data: logs.map(log => log.free_chlorine || null), borderColor: 'rgba(75, 192, 192, 1)', fill: false },
        { label: 'pH', data: logs.map(log => log.ph || null), borderColor: 'rgba(255, 99, 132, 1)', fill: false },
        { label: 'Total Alkalinity (ppm)', data: logs.map(log => log.total_alkalinity || null), borderColor: 'rgba(54, 162, 235, 1)', fill: false },
        { label: 'Stabilizer (ppm)', data: logs.map(log => log.stabilizer || null), borderColor: 'rgba(255, 206, 86, 1)', fill: false },
        { label: 'Calcium Hardness (ppm)', data: logs.map(log => log.calcium_hardness || null), borderColor: 'rgba(153, 102, 255, 1)', fill: false }
    ];

    if (chemicalChart) chemicalChart.destroy();

    const isMobile = window.innerWidth <= 768; // Detect mobile screen size

    chemicalChart = new Chart(ctx, {
        type: 'line',
        data: { labels: dates, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Allow chart to fill container height
            scales: {
                x: { 
                    title: { display: true, text: 'Service Date' },
                    ticks: { 
                        maxRotation: isMobile ? 45 : 0, // Rotate labels on mobile for space
                        minRotation: isMobile ? 45 : 0,
                        font: { size: isMobile ? 10 : 12 } // Smaller font on mobile
                    }
                },
                y: { 
                    title: { display: true, text: 'Value' }, 
                    beginAtZero: true,
                    ticks: { font: { size: isMobile ? 10 : 12 } }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: { size: isMobile ? 10 : 12 }, // Adjust legend size
                        boxWidth: isMobile ? 20 : 40 // Smaller boxes on mobile
                    },
                    onClick: (e, legendItem) => {
                        const index = legendItem.datasetIndex;
                        const meta = chemicalChart.getDatasetMeta(index);
                        meta.hidden = meta.hidden === null ? !chemicalChart.data.datasets[index].hidden : null;
                        chemicalChart.update();
                    }
                }
            }
        }
    });
}

function expandImage(src) {
    const modal = document.getElementById('image-modal');
    const img = document.getElementById('expanded-image');
    if (modal && img) {
        img.src = src;
        modal.style.display = 'flex';
    }
}

function closeModal() {
    const modal = document.getElementById('image-modal');
    if (modal) modal.style.display = 'none';
}

async function loadEmployeeData() {
    try {
        document.getElementById('employee-name').textContent = currentUser.name;
        const todayResponse = await fetch(`/today-pools/${currentUser.id}`);
        const todayPools = await todayResponse.json();
        document.getElementById('today-pools').textContent = todayPools.length;

        const completedResponse = await fetch(`/employee-completed-jobs/${currentUser.id}`);
        const completedJobs = await completedResponse.json();
        const tbody = document.getElementById('completed-jobs');
        tbody.innerHTML = '';
        if (completedJobs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10">No completed jobs yet.</td></tr>';
        } else {
            completedJobs.forEach(job => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td data-label="Date">${job.date}</td>
                    <td data-label="Customer">${job.customer_name}</td>
                    <td data-label="Before Photo"><img src="${job.before_photo}" alt="Before" class="clickable" onclick="expandImage('${job.before_photo}')"></td>
                    <td data-label="After Photo"><img src="${job.after_photo}" alt="After" class="clickable" onclick="expandImage('${job.after_photo}')"></td>
                    <td data-label="Free Chlorine">${job.free_chlorine || ''}</td>
                    <td data-label="pH">${job.ph || ''}</td>
                    <td data-label="Total Alkalinity">${job.total_alkalinity || ''}</td>
                    <td data-label="Stabilizer">${job.stabilizer || ''}</td>
                    <td data-label="Calcium Hardness">${job.calcium_hardness || ''}</td>
                    <td data-label="Actions"><button onclick="editServiceLog(${job.id})">Edit</button></td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error loading employee data:', error);
        document.getElementById('completed-jobs').innerHTML = '<tr><td colspan="10">Error loading jobs.</td></tr>';
    }
}

async function loadAdminData() {
    try {
        const customers = await (await fetch('/customers')).json();
        const employees = await (await fetch('/employees')).json();

        const customerSelect = document.getElementById('customer-select');
        const employeeSelect = document.getElementById('employee-select');
        if (customerSelect) {
            customerSelect.innerHTML = '<option value="">Select Customer</option>' + 
                customers.map(c => `<option value="${c.id}">${c.name} - ${c.address}</option>`).join('');
        }
        if (employeeSelect) {
            employeeSelect.innerHTML = '<option value="">Select Employee</option>' + 
                employees.map(e => `<option value="${e.id}">${e.name} (${e.email})</option>`).join('');
        }
    } catch (error) {
        console.error('Error loading admin data:', error);
    }
}

async function createEmployee() {
    const email = document.getElementById('employee-email')?.value;
    const password = document.getElementById('employee-password')?.value;
    const name = document.getElementById('employee-name')?.value;

    if (!email || !password || !name) {
        alert('Please fill out all employee fields');
        return;
    }

    try {
        const response = await fetch('/create-employee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, name })
        });
        const result = await response.json();

        if (result.error) {
            alert(result.error);
        } else {
            alert('Employee created successfully!');
            loadAdminData();
        }
    } catch (error) {
        console.error('Error creating employee:', error);
        alert('Failed to create employee.');
    }
}

async function createCustomer() {
    const name = document.getElementById('customer-name')?.value;
    const email = document.getElementById('customer-email')?.value;
    const phone = document.getElementById('customer-phone')?.value;
    const address = document.getElementById('customer-address')?.value;
    const pool_size = document.getElementById('pool-size')?.value;
    const access_code = document.getElementById('access-code')?.value;
    const lock_combo = document.getElementById('lock-combo')?.value;
    const dogs = document.getElementById('dogs')?.value;
    const access_side = document.getElementById('access-side')?.value;
    const service_frequency = document.getElementById('service-frequency')?.value;
    const additional_info = document.getElementById('additional-info')?.value;

    if (!name || !email || !phone || !address || !pool_size || !service_frequency) {
        alert('Please fill out all required customer fields');
        return;
    }

    try {
        const response = await fetch('/create-customer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name, 
                email, 
                phone, 
                address, 
                pool_size, 
                additional_info, 
                access_code, 
                lock_combo, 
                dogs, 
                access_side, 
                service_frequency 
            })
        });
        const result = await response.json();

        if (result.error) {
            alert(result.error);
        } else {
            const linkP = document.getElementById('customer-link');
            linkP.style.display = 'block';
            linkP.innerHTML = `Send this link to the customer: <a href="${result.link}">${result.link}</a>`;
            alert('Customer created! Send them the link to set their password.');
            loadAdminData();
            if (document.getElementById('customers')?.style.display === 'block') {
                loadCustomers();
            }
        }
    } catch (error) {
        console.error('Error creating customer:', error);
        alert('Failed to create customer.');
    }
}

async function assignPool() {
    const employeeId = document.getElementById('employee-select')?.value;
    const userId = document.getElementById('customer-select')?.value;

    if (!employeeId || !userId) {
        alert('Please select an employee and customer');
        return;
    }

    try {
        const response = await fetch('/assign-pool', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employee_id: employeeId, user_id: userId })
        });
        const result = await response.json();

        if (result.error) {
            alert(`Failed to assign pool: ${result.error}`);
        } else {
            alert('Pool assigned successfully!');
            loadAdminData();
        }
    } catch (error) {
        console.error('Error assigning pool:', error);
        alert('Failed to assign pool.');
    }
}

async function loadCustomerOptions() {
    const select = document.getElementById('customer-select');
    if (!currentUser || !currentUser.id) {
        select.innerHTML = '<option value="">Error: Login required</option>';
        return;
    }
    try {
        const response = await fetch(`/today-pools/${currentUser.id}`);
        assignedCustomers = await response.json();
        select.innerHTML = assignedCustomers.length === 0
            ? '<option value="">No customers to service today</option>'
            : '<option value="">Select Customer</option>' + 
              assignedCustomers.map(c => `<option value="${c.id}">${c.name} - ${c.address}</option>`).join('');
    } catch (error) {
        console.error('Error loading customer options:', error);
        select.innerHTML = '<option value="">Error loading customers</option>';
    }
}

async function loadCustomerNotes() {
    const userId = document.getElementById('customer-select')?.value;
    if (!userId) {
        document.getElementById('customer-notes').style.display = 'none';
        document.getElementById('service-form').style.display = 'none';
        document.getElementById('chemical-stability').style.display = 'none';
        if (chemicalChart) {
            chemicalChart.destroy();
            chemicalChart = null;
        }
        return;
    }

    const customer = assignedCustomers.find(c => c.id == userId);
    document.getElementById('customer-notes').style.display = 'block';
    document.getElementById('customer-notes').textContent = `Notes: ${customer.additional_info || 'None'}`;
    document.getElementById('service-form').style.display = 'block';
    document.getElementById('selected-customer').textContent = customer.name;

    document.getElementById('before-photo').value = '';
    document.getElementById('after-photo').value = '';
    document.getElementById('before-photo-preview').style.display = 'none';
    document.getElementById('after-photo-preview').style.display = 'none';
    document.getElementById('free-chlorine').value = '';
    document.getElementById('ph').value = '';
    document.getElementById('total-alkalinity').value = '';
    document.getElementById('stabilizer').value = '';
    document.getElementById('calcium-hardness').value = '';
    document.getElementById('water-temp').value = '';
    document.getElementById('netted').checked = false;
    document.getElementById('brushed').checked = false;
    document.getElementById('cleaned-filter').checked = false;
    document.getElementById('chemicals-added').value = '';

    try {
        const response = await fetch(`/service-logs/${userId}`);
        const logs = await response.json();
        if (logs.length > 0) {
            document.getElementById('chemical-stability').style.display = 'block';
            renderChemicalChart(logs);
        } else {
            document.getElementById('chemical-stability').style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading customer logs for chart:', error);
    }
}

function previewImage(inputId, previewId) {
    const file = document.getElementById(inputId)?.files[0];
    const preview = document.getElementById(previewId);
    if (file && preview) {
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
    }
}

function calculateChemicals() {
    const customer = assignedCustomers.find(c => c.id == document.getElementById('customer-select')?.value);
    if (!customer) return;

    const poolSize = parseFloat(customer.pool_size) || 0;
    const freeChlorine = parseFloat(document.getElementById('free-chlorine')?.value) || 0;
    const ph = parseFloat(document.getElementById('ph')?.value) || 0;
    const totalAlkalinity = parseFloat(document.getElementById('total-alkalinity')?.value) || 0;
    const stabilizer = parseFloat(document.getElementById('stabilizer')?.value) || 0;
    const calciumHardness = parseFloat(document.getElementById('calcium-hardness')?.value) || 0;

    let chemicals = '';
    if (freeChlorine < 2) chemicals += `Add ${(2 - freeChlorine) * poolSize / 10000} lbs chlorine\n`;
    if (ph < 7.2) chemicals += `Add ${(7.2 - ph) * poolSize / 10000} lbs soda ash\n`;
    if (ph > 7.8) chemicals += `Add ${(ph - 7.8) * poolSize / 10000} lbs muriatic acid\n`;
    if (totalAlkalinity < 80) chemicals += `Add ${(80 - totalAlkalinity) * poolSize / 10000} lbs baking soda\n`;
    if (stabilizer < 30) chemicals += `Add ${(30 - stabilizer) * poolSize / 10000} lbs CYA\n`;
    if (calciumHardness < 200) chemicals += `Add ${(200 - calciumHardness) * poolSize / 10000} lbs calcium chloride\n`;

    document.getElementById('chemicals-added').value = chemicals || 'No adjustments needed';
}

async function submitServiceLog() {
    if (!currentUser || !currentUser.id) {
        alert('Please log in as an employee first.');
        window.location.href = 'account.html';
        return;
    }

    const userId = document.getElementById('customer-select')?.value;
    if (!userId) {
        alert('Please select a customer.');
        return;
    }

    const formData = new FormData();
    formData.append('user_id', userId);
    formData.append('employee_id', currentUser.id);

    const beforePhoto = document.getElementById('before-photo')?.files[0];
    const afterPhoto = document.getElementById('after-photo')?.files[0];
    if (beforePhoto) formData.append('before_photo', beforePhoto);
    if (afterPhoto) formData.append('after_photo', afterPhoto);

    formData.append('free_chlorine', document.getElementById('free-chlorine')?.value || '');
    formData.append('ph', document.getElementById('ph')?.value || '');
    formData.append('total_alkalinity', document.getElementById('total-alkalinity')?.value || '');
    formData.append('stabilizer', document.getElementById('stabilizer')?.value || '');
    formData.append('calcium_hardness', document.getElementById('calcium-hardness')?.value || '');
    formData.append('water_temp', document.getElementById('water-temp')?.value || '');
    formData.append('netted', document.getElementById('netted')?.checked ? 1 : 0);
    formData.append('brushed', document.getElementById('brushed')?.checked ? 1 : 0);
    formData.append('cleaned_filter', document.getElementById('cleaned-filter')?.checked ? 1 : 0);
    formData.append('chemicals_added', document.getElementById('chemicals-added')?.value || '');

    try {
        const response = await fetch('/service-log', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();

        if (result.error) {
            alert(result.error);
        } else {
            const unassignResponse = await fetch('/unassign-pool', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employee_id: currentUser.id, user_id: userId })
            });
            const unassignResult = await unassignResponse.json();

            if (unassignResult.error) {
                alert('Service log submitted, but failed to unassign pool: ' + unassignResult.error);
            } else {
                alert('Service log submitted and pool unassigned!');
            }
            document.getElementById('service-form')?.reset();
            window.location.href = 'employee.html';
        }
    } catch (error) {
        console.error('Error submitting service log:', error);
        alert('Failed to submit service log. Check console for details.');
    }
}

function editServiceLog(logId) {
    window.location.href = `edit-service-log.html?logId=${logId}`;
}

async function loadServiceLogForEdit() {
    const urlParams = new URLSearchParams(window.location.search);
    const logId = urlParams.get('logId');
    if (!logId) {
        alert('No log ID provided!');
        window.location.href = 'employee.html';
        return;
    }

    try {
        const response = await fetch(`/service-log/${logId}`);
        const log = await response.json();
        if (log.error) {
            alert(log.error);
            window.location.href = 'employee.html';
            return;
        }

        document.getElementById('customer-name').textContent = log.customer_name || 'Unknown';
        document.getElementById('log-date').textContent = log.date;
        document.getElementById('before-photo-preview').src = log.before_photo || '';
        document.getElementById('before-photo-preview').style.display = log.before_photo ? 'block' : 'none';
        document.getElementById('after-photo-preview').src = log.after_photo || '';
        document.getElementById('after-photo-preview').style.display = log.after_photo ? 'block' : 'none';
        document.getElementById('free-chlorine').value = log.free_chlorine || '';
        document.getElementById('ph').value = log.ph || '';
        document.getElementById('total-alkalinity').value = log.total_alkalinity || '';
        document.getElementById('stabilizer').value = log.stabilizer || '';
        document.getElementById('calcium-hardness').value = log.calcium_hardness || '';
        document.getElementById('water-temp').value = log.water_temp || '';
        document.getElementById('netted').checked = log.netted == 1;
        document.getElementById('brushed').checked = log.brushed == 1;
        document.getElementById('cleaned-filter').checked = log.cleaned_filter == 1;
        document.getElementById('chemicals-added').value = log.chemicals_added || '';
    } catch (error) {
        console.error('Error loading service log:', error);
        alert('Failed to load service log.');
        window.location.href = 'employee.html';
    }
}

async function updateServiceLog() {
    const urlParams = new URLSearchParams(window.location.search);
    const logId = urlParams.get('logId');
    if (!logId) {
        alert('No log ID provided!');
        return;
    }

    const formData = new FormData();
    formData.append('log_id', logId);
    formData.append('free_chlorine', document.getElementById('free-chlorine')?.value || '');
    formData.append('ph', document.getElementById('ph')?.value || '');
    formData.append('total_alkalinity', document.getElementById('total-alkalinity')?.value || '');
    formData.append('stabilizer', document.getElementById('stabilizer')?.value || '');
    formData.append('calcium_hardness', document.getElementById('calcium-hardness')?.value || '');
    formData.append('water_temp', document.getElementById('water-temp')?.value || '');
    formData.append('netted', document.getElementById('netted')?.checked ? 1 : 0);
    formData.append('brushed', document.getElementById('brushed')?.checked ? 1 : 0);
    formData.append('cleaned_filter', document.getElementById('cleaned-filter')?.checked ? 1 : 0);
    formData.append('chemicals_added', document.getElementById('chemicals-added')?.value || '');

    const beforePhoto = document.getElementById('before-photo')?.files[0];
    const afterPhoto = document.getElementById('after-photo')?.files[0];
    if (beforePhoto) formData.append('before_photo', beforePhoto);
    if (afterPhoto) formData.append('after_photo', afterPhoto);

    try {
        const response = await fetch('/update-service-log', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (result.error) {
            alert(result.error);
        } else {
            alert('Service log updated!');
            window.location.href = 'employee.html';
        }
    } catch (error) {
        console.error('Error updating service log:', error);
        alert('Failed to update service log.');
    }
}

async function setPassword() {
    const password = document.getElementById('new-password')?.value;
    const confirmPassword = document.getElementById('confirm-password')?.value;
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!password || !confirmPassword) {
        document.getElementById('message').textContent = 'Please enter and confirm your password.';
        return;
    }
    if (password !== confirmPassword) {
        document.getElementById('message').textContent = 'Passwords do not match!';
        return;
    }
    if (!token) {
        document.getElementById('message').textContent = 'Invalid or missing token!';
        return;
    }

    try {
        const response = await fetch('/set-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password })
        });
        const result = await response.json();

        if (result.error) {
            document.getElementById('message').textContent = result.error;
        } else {
            document.getElementById('message').textContent = 'Password set successfully! Redirecting to login...';
            setTimeout(() => window.location.href = 'account.html', 2000);
        }
    } catch (error) {
        console.error('Error setting password:', error);
        document.getElementById('message').textContent = 'Failed to set password. Check console for details.';
    }
}

function openTab(tabName) {
    const tabs = document.getElementsByClassName('tab-content');
    for (let tab of tabs) {
        tab.style.display = 'none';
    }
    const buttons = document.getElementsByClassName('tab-btn');
    for (let btn of buttons) {
        btn.classList.remove('active');
    }
    const tabElement = document.getElementById(tabName);
    if (tabElement) {
        tabElement.style.display = 'block';
        document.querySelector(`button[onclick="openTab('${tabName}')"]`)?.classList.add('active');
    }

    if (tabName === 'job-review') {
        loadCompletedJobs();
    } else if (tabName === 'customers') {
        loadCustomers();
    }
}

async function loadCompletedJobs() {
    try {
        const response = await fetch('/completed-jobs');
        const jobs = await response.json();
        const tbody = document.getElementById('completed-jobs');
        tbody.innerHTML = '';
        if (jobs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12">No completed jobs found.</td></tr>';
        } else {
            jobs.forEach(job => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td data-label="Date">${job.date}</td>
                    <td data-label="Employee">${job.employee_name}</td>
                    <td data-label="Customer">${job.customer_name}</td>
                    <td data-label="Before Photo"><img src="${job.before_photo}" alt="Before" class="clickable" onclick="expandImage('${job.before_photo}')"></td>
                    <td data-label="After Photo"><img src="${job.after_photo}" alt="After" class="clickable" onclick="expandImage('${job.after_photo}')"></td>
                    <td data-label="Free Chlorine">${job.free_chlorine || ''}</td>
                    <td data-label="pH">${job.ph || ''}</td>
                    <td data-label="Total Alkalinity">${job.total_alkalinity || ''}</td>
                    <td data-label="Stabilizer">${job.stabilizer || ''}</td>
                    <td data-label="Calcium Hardness">${job.calcium_hardness || ''}</td>
                    <td data-label="Water Temp">${job.water_temp || ''}</td>
                    <td data-label="Chemicals Added">${job.chemicals_added || ''}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error loading completed jobs:', error);
        document.getElementById('completed-jobs').innerHTML = '<tr><td colspan="12">Error loading jobs.</td></tr>';
    }
}

async function loadCustomers() {
    try {
        const response = await fetch('/customers');
        const customers = await response.json();
        const tbody = document.getElementById('customer-list');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (customers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No customers found.</td></tr>';
        } else {
            customers.forEach(customer => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td data-label="Name">${customer.name}</td>
                    <td data-label="Email">${customer.email}</td>
                    <td data-label="Phone">${formatPhoneNumber(customer.phone)}</td>
                    <td data-label="Address">${customer.address}</td>
                    <td data-label="Pool Size">${customer.pool_size || 'N/A'}</td>
                    <td data-label="Additional Info">${customer.additional_info || ''}</td>
                    <td data-label="Actions"><button onclick="viewCustomerLogs(${customer.id})">View Logs</button></td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (error) {
        console.error('Error loading customers:', error);
        document.getElementById('customer-list').innerHTML = '<tr><td colspan="7">Error loading customers.</td></tr>';
    }
}

async function viewCustomerLogs(userId, page = 1) {
    try {
        const response = await fetch(`/customer-service-logs/${userId}?page=${page}`);
        const data = await response.json();
        const { logs, currentPage, totalPages, totalEntries } = data;

        const dynamicContent = document.getElementById('dynamic-content');
       //console.log(`Rendering logs for customer ${userId}`);
        dynamicContent.innerHTML = `
            <h3>Service Logs for Customer ID: ${userId}</h3>
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Employee</th>
                        <th>Before Photo</th>
                        <th>After Photo</th>
                        <th>Free Chlorine</th>
                        <th>pH</th>
                        <th>Total Alkalinity</th>
                        <th>Stabilizer</th>
                        <th>Calcium Hardness</th>
                        <th>Water Temp</th>
                        <th>Chemicals Added</th>
                    </tr>
                </thead>
                <tbody id="customer-logs-list"></tbody>
            </table>
            <div id="pagination-controls">
                <button id="prev-page" ${currentPage === 1 ? 'disabled' : ''}>Previous Page</button>
                <span>Page ${currentPage} of ${totalPages} (Total Entries: ${totalEntries})</span>
                <button id="next-page" ${currentPage === totalPages ? 'disabled' : ''}>Next Page</button>
                <button id="back-to-customers">Back to Customers</button>
            </div>
        `;

        const tbody = document.getElementById('customer-logs-list');
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11">No service logs found.</td></tr>';
        } else {
            logs.forEach(log => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td data-label="Date">${log.date}</td>
                    <td data-label="Employee">${log.employee_name}</td>
                    <td data-label="Before Photo"><img src="${log.before_photo}" alt="Before" class="clickable" onclick="expandImage('${log.before_photo}')"></td>
                    <td data-label="After Photo"><img src="${log.after_photo}" alt="After" class="clickable" onclick="expandImage('${log.after_photo}')"></td>
                    <td data-label="Free Chlorine">${log.free_chlorine || ''}</td>
                    <td data-label="pH">${log.ph || ''}</td>
                    <td data-label="Total Alkalinity">${log.total_alkalinity || ''}</td>
                    <td data-label="Stabilizer">${log.stabilizer || ''}</td>
                    <td data-label="Calcium Hardness">${log.calcium_hardness || ''}</td>
                    <td data-label="Water Temp">${log.water_temp || ''}</td>
                    <td data-label="Chemicals Added">${log.chemicals_added || ''}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        document.getElementById('prev-page').addEventListener('click', () => viewCustomerLogs(userId, currentPage - 1));
        document.getElementById('next-page').addEventListener('click', () => viewCustomerLogs(userId, currentPage + 1));
        document.getElementById('back-to-customers').addEventListener('click', () => loadAdminContent('manage-customers'));
    } catch (error) {
        console.error('Error loading customer logs:', error);
        document.getElementById('dynamic-content').innerHTML = '<p>Error loading service logs.</p>';
    }
}