import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp, doc, setDoc, onSnapshot, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging.js";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyC7uuy0yYV3L17RJ0RvbN-mrfqrT4PquMo",
    authDomain: "devi-sri-delights.firebaseapp.com",
    projectId: "devi-sri-delights",
    storageBucket: "devi-sri-delights.firebasestorage.app",
    messagingSenderId: "73108349440",
    appId: "1:73108349440:web:8ca038c61c9a85b2b12ee5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const messaging = getMessaging(app);
const auth = getAuth(app);

window.currentUser = null;
window.activeOrderUnsubscribe = null;
const readySound = new Audio("https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3");

// --- INITIALIZATION & SMART MENU LOADING ---
async function loadCustomerMenu() {
    try {
        const menuRef = collection(db, "menu");
        const snap = await getDocs(menuRef);
        let groupedMenu = {};

        snap.forEach(doc => {
            let data = doc.data();
            
            // Handles both Capitalized and lowercase database field names
            let itemName = data.name || data.Name;
            let itemPrice = data.price || data.Price;
            let itemCategory = data.category || data.Category || "Delicious Items";
            let catImage = data.image || data.Image || "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=2070&auto=format&fit=crop";

            if (!groupedMenu[itemCategory]) {
                groupedMenu[itemCategory] = {
                    name: itemCategory,
                    order: 99, 
                    image: catImage,
                    items: []
                };
            }

            if (itemName && itemPrice) {
                groupedMenu[itemCategory].items.push({ name: itemName, price: itemPrice });
            }
        });

        let finalCategories = Object.values(groupedMenu);
        
        if(finalCategories.length > 0) {
            window.renderMenu(finalCategories);
        } else {
            document.getElementById('menu-container').innerHTML = "<p style='text-align:center; padding: 40px; color: #E11D48;'>Menu fields didn't match. Please check database structure.</p>";
        }

    } catch (error) {
        console.error("Error loading menu:", error);
        document.getElementById('menu-container').innerHTML = "<p style='text-align:center; padding: 40px; color: #E11D48;'>Could not load menu. Check connection or Firestore Rules.</p>";
    }
}
loadCustomerMenu();

// --- AUTHENTICATION (OTP FLOW) ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.currentUser = user;
        document.getElementById('login-btn').style.display = 'none'; 
        document.getElementById('my-account-btn').style.display = 'flex'; 
        document.getElementById('my-orders-btn').style.display = 'block';
        trackActiveOrder(user.uid);
        window.updateCarouselAccount(); 
        window.requestPushPermissions();
    } else {
        window.currentUser = null;
        document.getElementById('login-btn').style.display = 'block'; 
        document.getElementById('my-account-btn').style.display = 'none'; 
        document.getElementById('my-orders-btn').style.display = 'none';
        if (window.activeOrderUnsubscribe) window.activeOrderUnsubscribe();
        document.getElementById('carousel-order-content').innerHTML = `<p style="color: #64748B; text-align: center;">No active orders right now.</p>`;
    }
});

window.sendOTP = function() {
    const phoneInput = document.getElementById("phone-number").value.trim();
    if (phoneInput.length !== 10 || isNaN(phoneInput)) return alert("Please enter a valid 10-digit phone number.");
    const formattedPhone = "+91" + phoneInput;

    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
    }

    signInWithPhoneNumber(auth, formattedPhone, window.recaptchaVerifier)
        .then((confirmationResult) => {
            window.confirmationResult = confirmationResult;
            document.getElementById('phone-input-section').style.display = 'none';
            document.getElementById('otp-input-section').style.display = 'block';
        }).catch((error) => {
            console.error("SMS not sent", error);
            alert("Error sending OTP. Make sure your domain is whitelisted in Firebase Auth Settings.");
        });
};

window.verifyOTP = function() {
    const code = document.getElementById('otp-code').value.trim();
    if(code.length !== 6) return alert("Please enter the 6-digit code.");

    window.confirmationResult.confirm(code).then((result) => {
        document.getElementById('login-modal').classList.remove('show');
        document.getElementById('otp-input-section').style.display = 'none';
        document.getElementById('phone-input-section').style.display = 'block';
        document.getElementById('phone-number').value = '';
        document.getElementById('otp-code').value = '';
    }).catch((error) => {
        alert("Invalid code. Please try again.");
    });
};

window.logoutUser = function() {
    signOut(auth).then(() => {
        document.getElementById('account-modal').classList.remove('show');
        document.getElementById('history-modal').classList.remove('show');
        window.location.reload();
    });
};

// --- PUSH NOTIFICATIONS ---
window.requestPushPermissions = async function() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted' && window.currentUser) {
            const token = await getToken(messaging, { 
                vapidKey: 'BNbdGAVX43lRrTqP0k4SisvEL806gFn5Jr_09LBaCxSR0tU1VxsRXu27uS25zn5dKeGbeCTz4jvIUEJKmHBKXHU' 
            });
            await setDoc(doc(db, "users", window.currentUser.uid), {
                phoneNumber: window.currentUser.phoneNumber,
                fcmToken: token,
                lastLogin: serverTimestamp()
            }, { merge: true });
        }
    } catch (error) {
        console.error("Error getting notification token:", error);
    }
};

onMessage(messaging, (payload) => {
    alert(`🛎️ ${payload.notification.title}\n${payload.notification.body}`);
});

// --- ORDER TRACKING & SAVING ---
function trackActiveOrder(uid) {
    const q = query(collection(db, "orders"), where("userId", "==", uid));
    let previousStatus = null; 

    window.activeOrderUnsubscribe = onSnapshot(q, (snap) => {
        let latestOrder = null;
        let latestTime = 0;
        snap.forEach(doc => {
            let data = doc.data();
            let time = data.timestamp ? data.timestamp.toMillis() : Date.now();
            if (time > latestTime) { latestTime = time; latestOrder = data; }
        });

        const carouselOrderContent = document.getElementById('carousel-order-content');
        const statusTracker = document.getElementById('active-order-status');
        const statusText = document.getElementById('status-text');
        const statusDot = document.querySelector('.status-dot');

        if (latestOrder && latestOrder.status !== "Picked up" && latestOrder.status !== "Completed") {
            let status = latestOrder.status || "Pending";
            if (status === "Ready" && previousStatus !== "Ready") readySound.play().catch(e => console.log("Blocked"));
            previousStatus = status; 
            
            statusTracker.style.display = 'flex';
            if (status === "Pending") {
                statusText.innerText = "Order Placed"; statusDot.className = "status-dot";
            } else if (status === "Ready") {
                statusText.innerText = "Ready for Pickup!"; statusDot.className = "status-dot ready";
            } else {
                statusText.innerText = status; statusDot.className = "status-dot";
            }

            let d = new Date(latestOrder.timestamp ? latestOrder.timestamp.toMillis() : Date.now());
            let timeStr = d.toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
            let dateStr = d.toLocaleString('en-IN', { day: '2-digit', month: 'short' });
            
            let waText = encodeURIComponent(`Hi Devi Sri Delights, I want to check the status of my order for Rs. ${latestOrder.totalBill}. Ordered by: ${latestOrder.customerName}`);
            
            carouselOrderContent.innerHTML = `
                <div style="width: 100%; box-sizing: border-box; text-align: left; background: var(--inner-card-bg); padding: 12px; border-radius: var(--radius-md); border: 1px solid rgba(126, 34, 206, 0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong style="font-size: 1rem; color: var(--text-dark);">${latestOrder.customerName}</strong>
                        <span class="status-badge-inline ${status === 'Ready' ? 'picked-up-bg' : 'pending-bg'}">${status}</span>
                    </div>
                    <p style="margin: 0 0 5px 0; font-size: 0.85rem; color: #64748B;">📅 ${dateStr} at ${timeStr}</p>
                    <p style="margin: 0; font-size: 0.95rem; font-weight: 800; color: var(--text-accent);">Total: ₹${latestOrder.totalBill}</p>
                </div>
                <a href="https://wa.me/${window.SHOP_WA_NUMBER}?text=${waText}" target="_blank" class="history-wa-btn" style="justify-content: center; width: 100%; box-sizing: border-box;">
                    Track on WhatsApp
                </a>
            `;
        } else {
            statusTracker.style.display = 'none';
            carouselOrderContent.innerHTML = `<p style="color: #64748B; text-align: center;">No active orders right now.</p>`;
        }
    });
}

window.saveOrderToFirebase = async function(name, cart, total) {
    if (!window.currentUser) return;
    localStorage.setItem('customerName', name);

    const docRef = await addDoc(collection(db, "orders"), {
        userId: window.currentUser.uid, 
        customerName: name, 
        customerPhone: window.currentUser.phoneNumber, 
        orderItems: cart, 
        totalBill: total, 
        timestamp: serverTimestamp(), 
        status: "Pending"
    });
    
    onSnapshot(doc(db, "orders", docRef.id), (s) => {
        if (s.exists() && s.data().status === "Ready") document.getElementById('ready-modal').classList.add('show');
    });
};

// --- ACCOUNT & HISTORY DASHBOARDS ---
window.updateCarouselAccount = async function() {
    const accContent = document.getElementById('carousel-account-content');
    if (!window.currentUser) {
        accContent.innerHTML = `
            <p style="color: #64748B; margin-bottom: 15px; text-align: center;">Login to view rewards & details</p>
            <button class="action-btn" onclick="document.getElementById('login-modal').classList.add('show')" style="margin-top: 0; padding: 10px;">Login Now</button>
        `;
        return;
    }
    accContent.innerHTML = `<p style="color: #64748B; text-align: center;">Loading...</p>`;
    try {
        let customerName = localStorage.getItem('customerName');
        const q = query(collection(db, "orders"), where("userId", "==", window.currentUser.uid));
        const snap = await getDocs(q);
        let totalOrders = snap.size;
        let totalSpent = 0;
        
        snap.forEach(doc => { totalSpent += doc.data().totalBill || 0; });
        let points = Math.floor(totalSpent / 100);
        if (!customerName) customerName = totalOrders > 0 ? snap.docs[0].data().customerName : "Guest User";
        
        accContent.innerHTML = `
            <div style="width: 100%; box-sizing: border-box; text-align: left; background: var(--inner-card-bg); padding: 15px; border-radius: var(--radius-md); border: 1px solid rgba(126, 34, 206, 0.1);">
                <p style="margin: 0 0 8px 0; font-size: 0.95rem; color: #475569;"><strong>👤</strong> <span style="color: var(--text-dark);">${customerName}</span></p>
                <p style="margin: 0 0 8px 0; font-size: 0.95rem; color: #475569;"><strong>📞</strong> <span style="color: var(--text-dark);">${window.currentUser.phoneNumber}</span></p>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed rgba(126, 34, 206, 0.2); display: flex; justify-content: space-between; align-items: center;">
                    <strong style="color: var(--text-dark); font-size: 0.9rem;">⭐ Points</strong>
                    <span class="points-badge">${points} pts</span>
                </div>
            </div>
        `;
    } catch (e) {
        accContent.innerHTML = `<p style="color: #E11D48; text-align: center;">Access Denied</p>`;
    }
};

window.saveProfileName = function() {
    const inputField = document.getElementById('profile-name-input');
    if(!inputField) return;
    const newName = inputField.value.trim();
    if (newName.length < 2) return alert("Please enter a valid name.");
    localStorage.setItem('customerName', newName);
    alert("✅ Profile name updated successfully!");
    window.updateCarouselAccount(); 
    window.openAccountModal(); 
};

window.openAccountModal = async function() {
    if (!window.currentUser) return;
    document.getElementById('account-modal').classList.add('show');
    const detailsDiv = document.getElementById('account-details');
    detailsDiv.innerHTML = "<p style='text-align:center; color: var(--text-dark); position: relative; z-index: 2;'>Gathering your details...</p>";
    try {
        let customerName = localStorage.getItem('customerName');
        const q = query(collection(db, "orders"), where("userId", "==", window.currentUser.uid));
        const snap = await getDocs(q);
        let totalOrders = snap.size; 
        let totalSpent = 0;
        
        snap.forEach(doc => { totalSpent += doc.data().totalBill || 0; });
        let points = Math.floor(totalSpent / 100);
        let dessertsEarned = Math.floor(points / 10);
        if (!customerName) customerName = totalOrders > 0 ? snap.docs[0].data().customerName : "Guest User";
        
        let rewardsHTML = `<div class="rewards-banner" style="margin-bottom: 15px;">
            <p style="margin: 0; font-size: 0.85rem;">Earn 1 point per ₹100 spent.<br><strong>10 Points = 1 Free Dessert!</strong></p>
            <h3 style="margin: 5px 0 0 0; color: #7E22CE;">Your Points: ${points}</h3>
        </div>`;
        
        if (dessertsEarned > 0) {
            rewardsHTML += `<div style="background: #D1FAE5; color: #059669; padding: 12px; border-radius: 8px; text-align: center; font-weight: 800; border: 1px solid #10B981; margin-bottom: 15px;">
                🎉 You have earned ${dessertsEarned} Free Dessert(s)!<br><span style="font-size: 0.8rem; font-weight: 600;">Show this screen at the counter to claim.</span>
            </div>`;
        }

        if (Notification.permission !== 'granted') {
            rewardsHTML += `<button onclick="window.requestPushPermissions()" class="action-btn" style="background: #10B981; margin-bottom: 15px; padding: 10px;">🔔 Turn On Order Alerts</button>`;
        }
        
        detailsDiv.innerHTML = `
        <div style="position: relative; z-index: 2;">
            ${rewardsHTML}
            <div style="background: var(--inner-card-bg); padding: 15px; border-radius: var(--radius-md); border: 1px solid rgba(126, 34, 206, 0.1); margin-bottom: 15px;">
                <label style="font-size: 0.85rem; font-weight: 700; color: #64748B;">Edit Your Name:</label>
                <div style="display: flex; gap: 10px; margin-top: 5px;">
                    <input type="text" id="profile-name-input" class="styled-input" value="${customerName}" placeholder="Your Name" style="padding: 10px;">
                    <button onclick="window.saveProfileName()" class="action-btn" style="margin-top: 0; width: auto; padding: 0 20px;">Save</button>
                </div>
            </div>
            <p style="margin-bottom: 10px;"><strong>📞 Phone:</strong> <span style="color: var(--text-dark);">${window.currentUser.phoneNumber}</span></p>
            <p style="margin-bottom: 10px;"><strong>🛍️ Total Orders:</strong> <span style="color: var(--text-dark);">${totalOrders}</span></p>
        </div>`;
    } catch (error) {
        detailsDiv.innerHTML = `<p style='text-align:center; color:#E11D48; position: relative; z-index: 2;'><strong>Access Denied.</strong></p>`;
    }
};


window.allUserOrders = [];
window.currentHistoryIndex = 0;

window.openOrderHistory = async function() {
    if (!window.currentUser) return;
    document.getElementById('history-modal').classList.add('show');
    const list = document.getElementById('history-list');
    list.innerHTML = "<p style='color: var(--text-dark); text-align: center; position: relative; z-index: 2;'>Searching your orders...</p>";
    document.getElementById('load-more-orders-btn').style.display = 'none';
    
    const q = query(collection(db, "orders"), where("userId", "==", window.currentUser.uid));
    const snap = await getDocs(q);
    
    window.allUserOrders = [];
    snap.forEach(d => { window.allUserOrders.push(d.data()); });
    window.allUserOrders.sort((a, b) => {
        let timeA = a.timestamp ? a.timestamp.toMillis() : 0;
        let timeB = b.timestamp ? b.timestamp.toMillis() : 0;
        return timeB - timeA;
    });
    window.currentHistoryIndex = 4; 
    window.renderHistoryChunks();
};

window.renderHistoryChunks = function() {
    const list = document.getElementById('history-list');
    const btn = document.getElementById('load-more-orders-btn');
    if (window.allUserOrders.length === 0) {
        list.innerHTML = "<p style='color: #64748B; text-align:center; position: relative; z-index: 2;'>No orders found.</p>";
        return;
    }
    let html = "";
    let ordersToShow = window.allUserOrders.slice(0, window.currentHistoryIndex);
    
    ordersToShow.forEach((data, index) => {
        let dateStr = "Recently";
        if (data.timestamp) {
            let d = new Date(data.timestamp.toMillis());
            dateStr = d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
        }
        
        let isPickedUp = data.status === "Picked up" || data.status === "Completed";
        let waButtonHtml = "";
        if (!isPickedUp) {
            let waText = encodeURIComponent(`Hi Devi Sri Delights, I want to check the status of my order for Rs. ${data.totalBill}. Ordered by: ${data.customerName}`);
            waButtonHtml = `
            <a href="https://wa.me/${window.SHOP_WA_NUMBER}?text=${waText}" target="_blank" class="history-wa-btn" onclick="event.stopPropagation()">
                Track Order
            </a>`;
        }

        let badgeClass = isPickedUp ? "picked-up-bg" : "pending-bg";

        html += `
        <div class="history-card" onclick="window.viewSpecificOrder(${index})">
            <div class="bg-shape shape-circle" style="opacity:0.4; transform:scale(0.6); top:-20px; left:-20px;"></div>
            <div class="bg-shape shape-pill" style="opacity:0.4; transform:scale(0.5); bottom:0px; right:-20px;"></div>
            
            <div style="display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 2;">
                <div>
                    <p class="order-date">📅 ${dateStr}</p>
                    <strong style="font-size: 1.1rem; color: var(--text-dark);">Total: ₹${data.totalBill}</strong>
                </div>
                <span class="status-badge-inline ${badgeClass}">${data.status || "Pending"}</span>
            </div>
            <div style="position: relative; z-index: 2;">${waButtonHtml}</div>
        </div>`;
    });
    list.innerHTML = html;
    if (window.currentHistoryIndex < window.allUserOrders.length) btn.style.display = 'block';
    else btn.style.display = 'none';
};

window.loadMoreOrders = function() {
    window.currentHistoryIndex += 5;
    window.renderHistoryChunks();
};

window.viewSpecificOrder = function(index) {
    let data = window.allUserOrders[index];
    if(!data) return;
    
    let dateStr = "Recently";
    if (data.timestamp) {
        let d = new Date(data.timestamp.toMillis());
        dateStr = d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    }

    let itemsHtml = "";
    if (data.orderItems) {
        for (let itemName in data.orderItems) {
            let item = data.orderItems[itemName];
            itemsHtml += `
            <div class="item-row-detail">
                <span style="font-weight: 600; color: var(--text-dark);">${item.quantity}x ${itemName}</span>
                <span style="color: #64748B;">₹${item.price * item.quantity}</span>
            </div>`;
        }
    }

    document.getElementById('specific-order-content').innerHTML = `
        <p style="color: #64748B; font-size: 0.85rem; margin-top: 0; margin-bottom: 20px; text-align: center;">📅 Ordered on ${dateStr}</p>
        <div style="background: var(--inner-card-bg); padding: 15px; border-radius: var(--radius-md); margin-bottom: 20px; border: 1px solid rgba(126, 34, 206, 0.1);">
            ${itemsHtml}
            <div style="display: flex; justify-content: space-between; margin-top: 15px; padding-top: 15px; border-top: 2px dashed rgba(126, 34, 206, 0.2); font-weight: 800; font-size: 1.1rem; color: var(--text-dark);">
                <span>Total Paid</span>
                <span style="color: var(--text-accent);">₹${data.totalBill}</span>
            </div>
        </div>
        <div style="font-size: 0.95rem; line-height: 1.6; color: #475569;">
            <p style="margin: 5px 0;"><strong>Customer Name:</strong> <span style="color: var(--text-dark);">${data.customerName || "N/A"}</span></p>
            <p style="margin: 5px 0;"><strong>Phone Used:</strong> <span style="color: var(--text-dark);">${data.customerPhone}</span></p>
            <p style="margin: 5px 0;"><strong>Order Status:</strong> <span style="color: var(--text-accent); font-weight: 800;">${data.status || "Pending"}</span></p>
        </div>
    `;
    document.getElementById('order-details-modal').classList.add('show');
};
