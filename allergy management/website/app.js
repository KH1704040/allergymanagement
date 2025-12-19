// --- 1. GLOBAL NAVIGATION & PAGE ROUTING ---
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    const userId = localStorage.getItem('loggedUserId');
    const token = localStorage.getItem('authToken'); // Check for Token
    const isAdmin = localStorage.getItem('isAdmin') === 'true';

    // Admin Protection
    if (path.includes('admin.html')) {
        if (!isAdmin) window.location.href = 'login.html';
        return;
    }

    if (isAdmin && !path.includes('login.html')) {
        window.location.href = 'admin.html';
        return;
    }

    // User Protection: 
    const protectedPages = ['index.html', 'profile.html', 'forme.html'];
    if (protectedPages.some(page => path.includes(page)) && (!userId || !token)) {
        alert("Session expired. Please log in again.");
        window.location.href = 'login.html';
        return;
    }

    // Page Loader
    if (userId && token) {
        if (path.includes('index.html')) loadDashboard(userId);
        if (path.includes('profile.html')) loadProfile(userId);
        if (path.includes('forme.html')) loadJournal(userId);
    }
    
    // Public Pages
    if (path.includes('about.html')) loadAboutStats();
    if (path.includes('login.html')) initRecaptcha();
});

// TOKEN
function getAuthHeaders() {
    const token = localStorage.getItem('authToken');
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
    };
}

// ReCAPTCHA 
window.onRecaptchaLoad = function() {
    initRecaptcha();
};

function initRecaptcha() {
    const recaptchaSiteKey = typeof RECAPTCHA_SITE_KEY !== 'undefined' ? RECAPTCHA_SITE_KEY : '';
    const recaptchaVersion = typeof RECAPTCHA_VERSION !== 'undefined' ? RECAPTCHA_VERSION : 'v2';
    
    if (!recaptchaSiteKey) return;
    
    const container = document.getElementById('recaptcha-container');
    if (!container || container.children.length > 0) return; 
    
    if (typeof grecaptcha !== 'undefined') {
        grecaptcha.ready(function() {
            try {
                if (recaptchaVersion === 'v3') {
                    grecaptcha.execute(recaptchaSiteKey, {action: 'login'}).then(function(token) {
                        container.setAttribute('data-token', token);
                    });
                } else {
                    grecaptcha.render(container, { 'sitekey': recaptchaSiteKey });
                }
            } catch (err) { console.error('reCAPTCHA error:', err); }
        });
    }
}

function logout() {
    localStorage.clear(); 
    window.location.href = 'login.html';
}

// --- 2. AUTHENTICATION ---

async function handleSignup() {
  
    const username = document.getElementById('su-username').value;
    const password = document.getElementById('su-password').value;
    const fname = document.getElementById('su-fname').value;
    const lname = document.getElementById('su-lname').value;
    const age = document.getElementById('su-age').value;
    
    const email = document.getElementById('su-email').value;
    const phone = document.getElementById('su-phone').value;
    
    const allergy = document.getElementById('su-allergy').value;

    if (!username || !password || !fname || !lname || !age) return alert("Please fill all fields");

    try {
        //  PORT T5000
        const res = await fetch('http://127.0.0.1:5000/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username, 
                password, 
                first_name: fname, 
                last_name: lname, 
                age: parseInt(age), 
                allergy: allergy,
                email: email, 
                phone: phone
            })
        });

        if (res.ok) {
            alert("Account created! Please log in.");
            window.location.href = "login.html";
        } else {
            const data = await res.json();
            alert("Error: " + data.detail);
        }
    } catch (err) { console.error(err); }
}

async function handleLogin() {
    const username = document.getElementById('li-username').value;
    const password = document.getElementById('li-password').value;

    if (!username || !password) return alert("Please enter username and password");

    let recaptchaToken = null;
    if (typeof grecaptcha !== 'undefined') {
        try {
            recaptchaToken = grecaptcha.getResponse(); 
        } catch (e) {
            const container = document.getElementById('recaptcha-container');
            if (container) recaptchaToken = container.getAttribute('data-token');
        }
    }

    try {
        
        const res = await fetch('http://127.0.0.1:5000/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, recaptcha_token: recaptchaToken })
        });

        if (res.ok) {
            const data = await res.json();

            if (data.is_admin) {
                localStorage.setItem('isAdmin', 'true');
                if (data.admin_key) localStorage.setItem('adminKey', data.admin_key);
                localStorage.removeItem('loggedUserId');
                window.location.href = "admin.html";
                return;
            }
            
            localStorage.setItem('loggedUserId', data.user_id);
            localStorage.setItem('authToken', data.token); 
            localStorage.removeItem('isAdmin');

            window.location.href = "index.html";
        } else {
            alert("Wrong password or username.");
        }
    } catch (err) { console.error(err); }
}

// --- 3. DASHBOARD LOGIC ---

async function loadDashboard(userId) {
    try {
        
        const userRes = await fetch(`http://127.0.0.1:5000/user/${userId}`, {
            headers: getAuthHeaders() 
        });
        
        if (userRes.ok) {
            const userData = await userRes.json();
            const welcomeMsg = document.getElementById('welcome-msg');
            if (welcomeMsg) welcomeMsg.innerText = `Welcome, ${userData.first_name}`;
        }

        const recipeRes = await fetch(`http://127.0.0.1:5000/recipes/${userId}`, {
            headers: getAuthHeaders() 
        });
        const recipes = await recipeRes.json();
        const recList = document.getElementById('recipe-list');
        if (recList) {
            recList.innerHTML = recipes.map(r => `
                <div class="card">
                    <div class="icon">${r.icon}</div>
                    <h3>${r.title}</h3>
                    <small style="color:green">✅ ${r.tags}</small>
                </div>
            `).join('');
        }

    
        const prodRes = await fetch(`http://127.0.0.1:5000/products/${userId}`, {
            headers: getAuthHeaders() 
        });
        const products = await prodRes.json();
        const prodList = document.getElementById('product-list');
        if (prodList) {
            prodList.innerHTML = products.map(p => `
                <div class="card-row">
                    <strong>${p.name}</strong>
                    <span>${p.shop}</span>
                    <span class="price">£${p.price}</span>
                </div>
            `).join('');
        }
    } catch (err) { console.error("Dashboard Load Error", err); }
}

// --- 4. AI FEATURES ---

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const window = document.getElementById('chat-window');
    const msg = input.value.trim();
    const userId = localStorage.getItem('loggedUserId');

    if (!msg) return;

    // Add User Message
    window.innerHTML += `<div class="message-bubble user-msg">${msg}</div>`;
    input.value = "";
    window.scrollTop = window.scrollHeight;

    // Add Loading Indicator
    const loadingId = "loading-" + Date.now();
    window.innerHTML += `<div id="${loadingId}" class="typing-indicator">Thinking...</div>`;
    window.scrollTop = window.scrollHeight;

    try {
      
        const res = await fetch('http://127.0.0.1:5000/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({ user_id: userId, message: msg })
        });

        document.getElementById(loadingId).remove();

        if (res.ok) {
            const data = await res.json();
           
            const reply = data.reply.replace(/\n/g, '<br>');
            window.innerHTML += `<div class="message-bubble ai-msg">${reply}</div>`;
        } else {
            const err = await res.json();
            window.innerHTML += `<div class="message-bubble ai-msg" style="color:red">Error: ${err.detail || "Server Error"}</div>`;
        }
    } catch (err) {
        if (document.getElementById(loadingId)) document.getElementById(loadingId).remove();
        console.error(err);
        window.innerHTML += `<div class="message-bubble ai-msg" style="color:red">Connection Failed</div>`;
    }
    window.scrollTop = window.scrollHeight;
}

// Function for "Enter" key press
function handleEnter(event) {
    if (event.key === "Enter") sendMessage(); 
}

// --- 5. PROFILE PAGE LOGIC ---

async function loadProfile(userId) {
    try {

        const res = await fetch(`http://127.0.0.1:5000/user/${userId}`, {
            headers: getAuthHeaders() 
        });
        const data = await res.json();
        
        document.getElementById('p-fullname').innerText = `${data.first_name} ${data.last_name}`;
        
        if (document.getElementById('p-email')) {
            document.getElementById('p-email').innerText = data.email || "Not provided";
        }
        if (document.getElementById('p-phone')) {
            document.getElementById('p-phone').innerText = data.phone || "Not provided";
        }
        
        document.getElementById('p-age').innerText = data.age;
        document.getElementById('p-allergy').innerText = data.allergy;
        document.getElementById('p-joined').innerText = data.joined_date;
    } catch (err) { console.error(err); }
}

// --- 6. JOURNAL LOGIC ---

async function loadJournal(userId) {
    try {
     
        const recRes = await fetch(`http://127.0.0.1:5000/my-recipes/${userId}`, {
            headers: getAuthHeaders() 
        });
        const recipes = await recRes.json();
        const recList = document.getElementById('personal-recipe-list');
        if(recList) {
            recList.innerHTML = recipes.map(r => `
                <div class="journal-entry">
                    <h3>${r.title}</h3>
                    <p><strong>Ing:</strong> ${r.ingredients}</p>
                    <p><strong>Instr:</strong> ${r.instructions}</p>
                    <small style="color:grey">Added: ${r.date}</small>
                </div>
            `).join('');
        }

     
        const prodRes = await fetch(`http://127.0.0.1:5000/my-products/${userId}`, {
            headers: getAuthHeaders() 
        });
        const products = await prodRes.json();
        const prodList = document.getElementById('personal-product-list');
        if(prodList) {
            prodList.innerHTML = products.map(p => `
                <div class="journal-entry">
                    <div style="display:flex; justify-content:space-between;">
                        <strong>${p.name}</strong>
                        <span style="color:${p.status === 'Safe' ? 'green' : 'red'}">${p.status}</span>
                    </div>
                    <p>${p.shop} - <em>${p.notes}</em></p>
                </div>
            `).join('');
        }
    } catch (err) { console.error(err); }
}

async function addRecipe() {
    const userId = localStorage.getItem('loggedUserId');
    const title = document.getElementById('rec-title').value;
    const ing = document.getElementById('rec-ingredients').value;
    const ins = document.getElementById('rec-instructions').value;

    if(!title) return alert("Title required");


    await fetch('http://127.0.0.1:5000/my-recipes/add', {
        method: 'POST', 
        headers: getAuthHeaders(),
        body: JSON.stringify({ user_id: userId, title, ingredients: ing, instructions: ins })
    });
    alert("Recipe Saved!"); 
    location.reload();
}

async function addProduct() {
    const userId = localStorage.getItem('loggedUserId');
    const name = document.getElementById('prod-name').value;
    const shop = document.getElementById('prod-shop').value;
    const status = document.getElementById('prod-status').value;
    const notes = document.getElementById('prod-notes').value;

    if(!name) return alert("Product Name required");


    await fetch('http://127.0.0.1:5000/my-products/add', {
        method: 'POST', 
        headers: getAuthHeaders(),
        body: JSON.stringify({ user_id: userId, product_name: name, shop, safety_status: status, notes })
    });
    alert("Product Logged!"); 
    location.reload();
}

// --- 7. ABOUT PAGE ---
async function loadAboutStats() {
    try {
     
        const res = await fetch('http://127.0.0.1:5000/stats/summary');
        if (!res.ok) return;
        const stats = await res.json();

        const totalUsersEl = document.getElementById('metric-total-users');
        if (totalUsersEl) {
            totalUsersEl.innerText = stats.total_users ?? '0';
        }
    } catch (err) { console.error('About stats error', err); }
}