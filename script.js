let cart = {};
const container = document.getElementById('menu-container');

window.renderMenu = function(menuCategories) {
    container.innerHTML = ''; 
    
    menuCategories.forEach(category => {
        const card = document.createElement('div');
        card.className = 'category-card';
        
        const img = document.createElement('img');
        img.className = 'category-image';
        img.src = category.image;
        card.appendChild(img);

        const header = document.createElement('div');
        header.className = 'category-header';
        
        header.innerHTML = `
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; z-index: 0; pointer-events: none;">
                <div class="bg-shape shape-3" style="transform: scale(0.4); top: -15px; left: 10px; opacity: 0.6;"></div>
                <div class="bg-shape shape-8" style="transform: scale(0.5); bottom: -20px; right: 40px; opacity: 0.6;"></div>
            </div>
            <span style="position: relative; z-index: 2;">${category.name}</span>
        `;
        
        header.onclick = () => {
            const isCurrentlyActive = card.classList.contains('active');
            
            document.querySelectorAll('.category-card.active').forEach(c => {
                c.classList.remove('active');
            });

            if (!isCurrentlyActive) {
                card.classList.add('active');
                setTimeout(() => {
                    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 450); 
            }
        };
        
        card.appendChild(header);

        const itemList = document.createElement('div');
        itemList.className = 'item-list';
        itemList.style.position = "relative";
        itemList.style.overflow = "hidden";

        const shapeContainer = document.createElement('div');
        shapeContainer.style.cssText = "position: absolute; inset: 0; overflow: hidden; z-index: 0; pointer-events: none; border-radius: 0 0 16px 16px;";
        shapeContainer.innerHTML = `
            <div class="bg-shape shape-2" style="transform: scale(0.6); top: 10px; left: -10px; opacity: 0.5;"></div>
            <div class="bg-shape shape-5" style="transform: scale(0.5); bottom: 15%; right: -15px; opacity: 0.5;"></div>
            <div class="bg-shape shape-7" style="transform: scale(0.4); top: 40%; left: 30%; opacity: 0.5;"></div>
            <div class="bg-shape shape-1" style="transform: scale(0.5); bottom: 5px; left: 10px; opacity: 0.5;"></div>
            <div class="bg-shape shape-3" style="transform: scale(0.4); top: 20px; right: 20px; opacity: 0.5;"></div>
        `;
        itemList.appendChild(shapeContainer);

        if(category.items) {
            category.items.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'menu-item';
                itemDiv.style.position = "relative";
                itemDiv.style.zIndex = "2";

                let priceDisplay = (item.price === "Shop Visit") ? `<span class="shop-visit-tag">Price at Shop</span>` : `<span class="item-price">₹${item.price}</span>`;
                let buttonHTML = (item.price === "Shop Visit") ? '' : `<button class="add-btn" onclick="addToCart('${item.name}', ${item.price})">Add</button>`;

                itemDiv.innerHTML = `<div class="item-info"><h4 style="color: var(--text-dark); margin-bottom: 4px;">${item.name}</h4>${priceDisplay}</div>${buttonHTML}`;
                itemList.appendChild(itemDiv);
            });
        }
        card.appendChild(itemList);
        container.appendChild(card);
    });
};

const popSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3");
popSound.volume = 0.5; 

window.addToCart = function(itemName, price) {
    cart[itemName] = cart[itemName] ? { ...cart[itemName], quantity: cart[itemName].quantity + 1 } : { price, quantity: 1 };
    updateCartUI();
    
    popSound.currentTime = 0; 
    popSound.play().catch(err => console.log("Audio blocked by browser until user taps"));
};

window.removeFromCart = function(itemName) {
    if (cart[itemName]) {
        cart[itemName].quantity -= 1;
        if (cart[itemName].quantity <= 0) delete cart[itemName];
        updateCartUI();
        renderCartModalItems();
        
        if (Object.keys(cart).length === 0) {
            document.getElementById('cart-modal').classList.remove('show');
        }
    }
};

window.clearCart = function() {
    if (confirm("Are you sure you want to clear your entire order?")) {
        cart = {};
        updateCartUI();
        document.getElementById('cart-modal').classList.remove('show');
    }
};

window.updateCartUI = function() {
    let totalItems = Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
    let totalPrice = Object.values(cart).reduce((sum, item) => sum + (item.price * item.quantity), 0);
    document.getElementById('cart-count').innerText = totalItems;
    document.getElementById('cart-total').innerText = totalPrice;
    
    const cartBar = document.getElementById('floating-cart');
    if (totalItems > 0) {
        cartBar.style.display = 'flex';
        cartBar.classList.remove('animate-pop'); 
        void cartBar.offsetWidth; 
        cartBar.classList.add('animate-pop');
    } else { 
        cartBar.style.display = 'none'; 
    }
};

window.toggleCartModal = function() {
    const modal = document.getElementById('cart-modal');
    if (modal.classList.contains('show')) {
        modal.classList.remove('show');
    } else {
        renderCartModalItems();
        modal.classList.add('show');
    }
};

window.renderCartModalItems = function() {
    const list = document.getElementById('cart-items-list');
    list.innerHTML = '';
    let total = 0;
    for (let item in cart) {
        let itemTotal = cart[item].price * cart[item].quantity;
        total += itemTotal;
        list.innerHTML += `
            <div class="cart-item-row" style="position: relative; z-index: 2;">
                <div>
                    <strong style="color: var(--text-dark);">${item}</strong><br>
                    <small style="color: #64748B;">₹${cart[item].price} x ${cart[item].quantity}</small>
                </div>
                <div style="text-align: right;">
                    <strong style="display:block; margin-bottom: 5px; color: var(--text-accent);">₹${itemTotal}</strong>
                    <button class="remove-btn" onclick="removeFromCart('${item}')">Remove</button>
                </div>
            </div>`;
    }
    document.getElementById('modal-total').innerText = total;
};

window.sendWhatsAppOrder = function() {
    const customerName = document.getElementById('customer-name').value.trim();
    if (customerName.length < 2) { 
        alert("Please enter a valid name!"); 
        return; 
    }

    if (!window.currentUser) {
        document.getElementById('login-modal').classList.add('show');
        return;
    }

    let total = 0;
    for (let item in cart) {
        total += cart[item].price * cart[item].quantity;
    }

    document.getElementById('cart-modal').classList.remove('show');

    if (window.saveOrderToFirebase) {
        window.saveOrderToFirebase(customerName, cart, total);
    }

    alert("✅ Order successfully sent to the kitchen!\n\nPlease wait, your phone will notify you the exact moment it is ready for pickup.");

    cart = {};
    updateCartUI();
};

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('firebase-messaging-sw.js').catch(err => console.log("SW failed:", err));
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('install-app-btn').style.display = 'inline-flex';
});

document.getElementById('install-app-btn').addEventListener('click', () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt = null;
    }
});

document.getElementById('share-app-btn').addEventListener('click', () => {
    const shareData = {
        title: 'Devi Sri Delights',
        text: 'Check out the menu and order online from Devi Sri Delights!',
        url: window.location.href
    };
    if (navigator.share) {
        navigator.share(shareData);
    } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(shareData.text + " " + shareData.url)}`);
    }
});
