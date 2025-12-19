const API_BASE = 'http://127.0.0.1:5000';
let adminKey = null;
let cachedUsers = [];
let editingUserId = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. GLOBAL AUTH CHECK
    adminKey = localStorage.getItem('adminKey');
    if (!adminKey) {
        window.location.href = 'login.html';
        return;
    }

    // 2. CHECK: ARE WE ON THE USERS PAGE?
    const userTable = document.querySelector('#user-table');
    if (userTable) {
        initUserPage();
    }

    // 3. CHECK: ARE WE ON THE MESSAGES PAGE?
    const msgTable = document.getElementById('messages-table-body');
    if (msgTable) {
        loadMessages();
    }
});

// ==========================================
//           PAGE 1: USER MANAGEMENT
// ==========================================
function initUserPage() {
    const tbody = document.querySelector('#user-table tbody');
    const refreshBtn = document.getElementById('refresh-users');
    const userForm = document.getElementById('user-form');
    const cancelEditBtn = document.getElementById('cancel-edit');

    if (refreshBtn) refreshBtn.addEventListener('click', loadUsers);
    if (userForm) userForm.addEventListener('submit', handleUserFormSubmit);
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', resetFormState);

    // Table Button Clicks (Edit/Delete)
    if (tbody) {
        tbody.addEventListener('click', (event) => {
            const btn = event.target.closest('button');
            if (!btn) return;
            const userId = btn.dataset.id;
            if (btn.classList.contains('edit-btn')) {
                startEdit(userId);
            } else if (btn.classList.contains('delete-btn')) {
                deleteUser(userId);
            }
        });
    }

    loadUsers(); // Start loading users
}

async function loadUsers() {
    try {
        const res = await fetch(`${API_BASE}/admin/users`, {
            headers: { 'x-admin-key': adminKey }
        });

        if (!res.ok) throw new Error('Failed to fetch users');

        cachedUsers = await res.json();
        const tbody = document.querySelector('#user-table tbody');
        const count = document.getElementById('user-count');

        if (!tbody) return;

        tbody.innerHTML = cachedUsers.map(user => `
            <tr>
                <td data-label="ID">#${user.user_id}</td>
                <td data-label="Name">${user.first_name ?? '-'} ${user.last_name ?? ''}</td>
                <td data-label="Username"><strong>${user.username}</strong></td>
                <td data-label="Email" style="color:#2980b9">${user.email || '-'}</td>
                <td data-label="Phone">${user.phone || '-'}</td>
                <td data-label="Age">${user.age ?? '-'}</td>
                <td data-label="Allergy">${user.allergy_trigger ?? '-'}</td>
                <td data-label="Joined">${new Date(user.created_at).toLocaleDateString()}</td>
                <td data-label="Actions">
                    <button class="ghost-btn edit-btn" data-id="${user.user_id}">Edit</button>
                    <button class="danger-btn delete-btn" data-id="${user.user_id}" style="color:red">Delete</button>
                </td>
            </tr>
        `).join('');

        if (count) count.innerText = cachedUsers.length;
    } catch (err) {
        console.error(err);
    }
}

function startEdit(userId) {
    const user = cachedUsers.find(u => String(u.user_id) === String(userId));
    if (!user) return;

    editingUserId = user.user_id;
    const title = document.getElementById('form-title');
    const cancelBtn = document.getElementById('cancel-edit');
    
    if (title) title.innerText = `Edit User #${user.user_id}`;
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';

    document.getElementById('f-first').value = user.first_name ?? '';
    document.getElementById('f-last').value = user.last_name ?? '';
    document.getElementById('f-username').value = user.username ?? '';
    document.getElementById('f-email').value = user.email ?? '';
    document.getElementById('f-phone').value = user.phone ?? '';
    document.getElementById('f-age').value = user.age ?? '';
    document.getElementById('f-allergy').value = user.allergy_trigger ?? '';

    const passwordInput = document.getElementById('f-password');
    passwordInput.value = '';
    passwordInput.placeholder = 'Leave blank to keep password';
    passwordInput.required = false;
}

function resetFormState() {
    editingUserId = null;
    document.getElementById('form-title').innerText = 'Add New User';
    document.getElementById('cancel-edit').style.display = 'none';
    
    document.getElementById('user-form').reset();
    
    const passwordInput = document.getElementById('f-password');
    passwordInput.placeholder = 'Password';
    passwordInput.required = true;
}

async function handleUserFormSubmit(event) {
    event.preventDefault();
    
    const payload = {
        first_name: document.getElementById('f-first').value.trim(),
        last_name: document.getElementById('f-last').value.trim(),
        username: document.getElementById('f-username').value.trim(),
        password: document.getElementById('f-password').value,
        email: document.getElementById('f-email').value.trim() || null,
        phone: document.getElementById('f-phone').value.trim() || null,
        age: document.getElementById('f-age').value ? Number(document.getElementById('f-age').value) : null,
        allergy_trigger: document.getElementById('f-allergy').value.trim() || null
    };

    try {
        const isEdit = Boolean(editingUserId);
        const url = isEdit ? `${API_BASE}/admin/users/${editingUserId}` : `${API_BASE}/admin/users`;
        const method = isEdit ? 'PUT' : 'POST';

        if (isEdit && !payload.password) delete payload.password;

        const res = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'x-admin-key': adminKey
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || 'Request failed');
        }

        resetFormState();
        await loadUsers();
    } catch (err) {
        alert(err.message);
    }
}

async function deleteUser(userId) {
    if (!confirm('Delete this user?')) return;

    try {
        const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
            method: 'DELETE',
            headers: { 'x-admin-key': adminKey }
        });

        if (!res.ok) throw new Error('Failed to delete user');

        if (String(editingUserId) === String(userId)) resetFormState();
        await loadUsers();
    } catch (err) {
        alert(err.message);
    }
}

// ==========================================
//           PAGE 2: MESSAGES
// ==========================================
async function loadMessages() {
    const tableBody = document.getElementById('messages-table-body');
    if (!tableBody) return; // Stop if table doesn't exist

    try {
        const res = await fetch(`${API_BASE}/admin/messages`, {
            headers: { 'x-admin-key': adminKey }
        });

        if (res.ok) {
            const messages = await res.json();
            tableBody.innerHTML = ''; 

            if (messages.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">No messages yet.</td></tr>';
                return;
            }

            messages.forEach(msg => {
                const date = new Date(msg.created_at).toLocaleString();
                const row = `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 12px; color: #7f8c8d; font-size: 0.9em;">${date}</td>
                        <td style="padding: 12px; font-weight: bold;">${msg.name}</td>
                        <td style="padding: 12px;">
                            <a href="mailto:${msg.email}" style="color: #2980b9;">${msg.email}</a>
                        </td>
                        <td style="padding: 12px;">${msg.message}</td>
                    </tr>
                `;
                tableBody.innerHTML += row;
            });
        }
    } catch (err) {
        console.error("Error loading messages", err);
    }
}

// ==========================================
//           GLOBAL: LOGOUT
// ==========================================
function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}