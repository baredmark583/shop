// Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();

// Get user platform from Telegram
const platform = tg.platform || 'unknown';
const userId = tg.initDataUnsafe?.user?.id;

// Cart management
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let products = [];
let selectedProductId = null;

// TON Connect & Settings
let tonConnectUI;
let shopSettings = {
    enable_stars: true,
    enable_ton: false,
    ton_wallet: ''
};

// Load settings from server
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();
        if (settings) shopSettings = { ...shopSettings, ...settings };
        return true;
    } catch (error) {
        console.error('Error loading settings:', error);
        return false;
    }
}

// Initialize
async function init() {
    // Setup profile
    if (tg.initDataUnsafe?.user) {
        const userName = document.getElementById('userName');
        const userIdEl = document.getElementById('userId');
        if (userName) userName.textContent = tg.initDataUnsafe.user.first_name || 'Пользователь';
        if (userIdEl) userIdEl.textContent = `ID: ${userId}`;
    }

    // Load settings
    await loadSettings();

    // Initialize TON Connect
    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
        manifestUrl: window.location.origin + '/tonconnect-manifest.json',
        buttonRootId: 'ton-connect'
    });
    const root = document.documentElement;
    root.style.setProperty('--primary', tg.themeParams.button_color || '#007AFF');
    root.style.setProperty('--primary-hover', adjustColor(tg.themeParams.button_color || '#007AFF', -20));
    root.style.setProperty('--background', tg.themeParams.bg_color || '#F5F5F7');
    root.style.setProperty('--card-bg', tg.themeParams.secondary_bg_color || '#FFFFFF');
    root.style.setProperty('--text-primary', tg.themeParams.text_color || '#1D1D1F');
    root.style.setProperty('--text-secondary', tg.themeParams.hint_color || '#86868B');

    // Load initial data
    await loadBanners();
    await loadProducts();
    updateCartCount();
}

// Helper to darken/lighten color
function adjustColor(color, amount) {
    return '#' + color.replace(/^#/, '').replace(/../g, color => ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}

// Load banners
async function loadBanners() {
    try {
        const response = await fetch('/api/banners');
        const banners = await response.json();

        const bannersSlider = document.getElementById('bannersSlider');
        if (!bannersSlider) return;

        if (banners.length === 0) {
            bannersSlider.style.display = 'none';
            return;
        }

        bannersSlider.innerHTML = banners.map(banner => `
            <div class="banner-slide">
                <img src="${banner.image_url}" alt="Banner" onclick="${banner.link_url ? `window.open('${banner.link_url}', '_blank')` : ''}">
            </div>
        `).join('');
        bannersSlider.style.display = 'flex';
    } catch (error) {
        console.error('Error loading banners:', error);
    }
}

// Load products
async function loadProducts() {
    try {
        showLoading(true);
        const response = await fetch('/api/products');
        products = await response.json();
        displayProducts();
    } catch (error) {
        console.error('Error loading products:', error);
        tg.showAlert('Ошибка загрузки товаров');
    } finally {
        showLoading(false);
    }
}

// Display products
function displayProducts() {
    const productsList = document.getElementById('productsList');
    if (!productsList) return;

    if (products.length === 0) {
        productsList.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--text-secondary);">
        <div style="font-size: 64px; margin-bottom: 20px;">📦</div>
        <p>Товаров пока нет</p>
      </div>
    `;
        return;
    }

    productsList.innerHTML = products.map(product => {
        const starsPrice = convertToStars(product.price_uah);
        const tonPrice = (product.price_uah / 1000).toFixed(4);

        // Determine which price to display
        let priceDisplay = `${starsPrice} ⭐`; // default Stars
        if (shopSettings.enable_ton && !shopSettings.enable_stars) {
            priceDisplay = `${tonPrice} 💎 TON`;
        } else if (shopSettings.enable_ton && shopSettings.enable_stars) {
            priceDisplay = `${tonPrice} 💎 TON`;
        }

        return `
      <div class="product-card" onclick="openProductModal(${product.id})">
        ${product.image_url ?
                `<img src="${product.image_url}" class="product-image" alt="${product.name}">` :
                `<div class="product-image" style="display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 48px;">📦</span>
          </div>`
            }
        <div class="product-info">
          <div class="product-name">${product.name}</div>
          ${product.description ? `<div class="product-description">${product.description}</div>` : ''}
          <div class="product-footer">
            <div>
              <div class="product-price">${product.price_uah} грн</div>
              <div class="product-stars">${priceDisplay}</div>
            </div>
            <button class="btn-add-cart" onclick="addToCart(${product.id}, event)">
                <iconify-icon icon="mdi:cart-plus"></iconify-icon>
            </button>
          </div>
        </div>
      </div>
    `;
    }).join('');
}

// Convert UAH to Stars based on platform
function convertToStars(amountUAH) {
    // Mobile platforms have Google Play commission
    const isMobile = platform.includes('android') || platform.includes('ios');
    const rate = isMobile ? 1.0 : 1.2;
    return Math.ceil(amountUAH * rate);
}

// Get platform type
function getPlatform() {
    if (platform.includes('android') || platform.includes('ios')) {
        return 'mobile';
    }
    return 'desktop';
}

// View Navigation
function showView(viewName) {
    // Hide all views
    document.getElementById('mainView').style.display = 'none';
    document.getElementById('cartView').style.display = 'none';
    document.getElementById('profileView').style.display = 'none';

    // Show selected view
    if (viewName === 'main') {
        document.getElementById('mainView').style.display = 'block';
    } else if (viewName === 'cart') {
        displayCart();
        document.getElementById('cartView').style.display = 'block';
    } else if (viewName === 'profile') {
        document.getElementById('profileView').style.display = 'block';
    }

    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewName) {
            item.classList.add('active');
        }
    });

    tg.HapticFeedback.impactOccurred('light');
}

// Product Modal
function openProductModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    selectedProductId = productId;

    const modalImg = document.getElementById('modalProductImage');
    if (modalImg) modalImg.src = product.image_url || '';

    document.getElementById('modalProductName').textContent = product.name;
    document.getElementById('modalProductDescription').textContent = product.description || 'Нет описания';
    document.getElementById('modalProductPrice').textContent = `${product.price_uah} грн`;

    // Display appropriate payment method
    const starsPrice = convertToStars(product.price_uah);
    const tonPrice = (product.price_uah / 1000).toFixed(4);

    if (shopSettings.enable_ton && !shopSettings.enable_stars) {
        document.getElementById('modalProductStars').textContent = `${tonPrice} 💎 TON`;
    } else if (shopSettings.enable_ton && shopSettings.enable_stars) {
        document.getElementById('modalProductStars').textContent = `${tonPrice} 💎 TON`;
    } else {
        document.getElementById('modalProductStars').textContent = `${starsPrice} ⭐`;
    }

    document.getElementById('productModal').style.display = 'block';
    tg.HapticFeedback.impactOccurred('medium');
}

function closeProductModal() {
    document.getElementById('productModal').style.display = 'none';
    selectedProductId = null;
}

function addToCartFromModal() {
    if (selectedProductId) {
        addToCart(selectedProductId);
        closeProductModal();
    }
}

// Add to cart
function addToCart(productId, event) {
    if (event) {
        event.stopPropagation();
    }

    const product = products.find(p => p.id === productId);
    if (!product) return;

    const cartItem = cart.find(item => item.product_id === productId);

    if (cartItem) {
        cartItem.quantity += 1;
    } else {
        cart.push({
            product_id: productId,
            name: product.name,
            price: product.price_uah,
            image_url: product.image_url,
            quantity: 1
        });
    }

    saveCart();
    updateCartCount();

    // Haptic feedback
    tg.HapticFeedback.impactOccurred('light');
}

// Remove from cart
function removeFromCart(productId) {
    cart = cart.filter(item => item.product_id !== productId);
    saveCart();
    updateCartCount();
    displayCart();

    tg.HapticFeedback.impactOccurred('medium');
}

// Update quantity
function updateQuantity(productId, delta) {
    const item = cart.find(item => item.product_id === productId);
    if (!item) return;

    item.quantity += delta;

    if (item.quantity <= 0) {
        removeFromCart(productId);
    } else {
        saveCart();
        displayCart();
    }

    tg.HapticFeedback.impactOccurred('light');
}

// Save cart to localStorage
function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

// Update cart count
function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Update header count if exists (legacy)
    const headerCount = document.getElementById('cartCount');
    if (headerCount) headerCount.textContent = count;

    // Update nav badge
    const badge = document.getElementById('navCartBadge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Display cart
function displayCart() {
    const cartItems = document.getElementById('cartItems');
    const cartEmpty = document.getElementById('cartEmpty');
    const cartFooter = document.getElementById('cartFooter');

    if (cart.length === 0) {
        cartItems.style.display = 'none';
        cartEmpty.style.display = 'block';
        cartFooter.style.display = 'none';
        return;
    }

    cartItems.style.display = 'flex';
    cartEmpty.style.display = 'none';
    cartFooter.style.display = 'block';

    // Display items
    cartItems.innerHTML = cart.map(item => `
    <div class="cart-item">
      ${item.image_url ?
            `<img src="${item.image_url}" class="cart-item-image" alt="${item.name}">` :
            `<div class="cart-item-image" style="display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 32px;">📦</span>
        </div>`
        }
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${item.price} грн × ${item.quantity}</div>
        <div class="cart-item-controls">
          <button class="btn-quantity" onclick="updateQuantity(${item.product_id}, -1)">−</button>
          <span class="item-quantity">${item.quantity}</span>
          <button class="btn-quantity" onclick="updateQuantity(${item.product_id}, 1)">+</button>
          <button class="btn-remove" onclick="removeFromCart(${item.product_id})">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');

    // Calculate totals
    const totalUAH = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalStars = convertToStars(totalUAH);
    const totalTON = totalUAH / 1000; // Approximate rate

    document.getElementById('totalUAH').textContent = totalUAH.toFixed(2) + ' грн';

    // Display appropriate payment method
    if (shopSettings.enable_ton && !shopSettings.enable_stars) {
        // Show TON only
        document.getElementById('totalStars').textContent = totalTON.toFixed(4) + ' 💎 TON';
    } else if (shopSettings.enable_ton && shopSettings.enable_stars) {
        // Show TON (if both enabled)
        document.getElementById('totalStars').textContent = totalTON.toFixed(4) + ' 💎 TON';
    } else {
        // Show Stars (default)
        document.getElementById('totalStars').textContent = totalStars + ' ⭐';
    }
}

// Checkout
async function checkout() {
    if (!userId) {
        tg.showAlert('Ошибка: не удалось получить ID пользователя');
        return;
    }

    if (cart.length === 0) {
        tg.showAlert('Корзина пуста');
        return;
    }

    try {
        showLoading(true);

        // Determine payment method based on settings
        let payment_method = 'stars'; // default

        if (shopSettings.enable_ton && !shopSettings.enable_stars) {
            // Only TON enabled
            payment_method = 'ton';
        } else if (shopSettings.enable_ton && shopSettings.enable_stars) {
            // Both enabled - let user choose (for now default to TON if both enabled)
            payment_method = 'ton';
        }

        const orderData = {
            telegram_user_id: userId,
            items: cart.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity
            })),
            platform: getPlatform(),
            payment_method: payment_method
        };

        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (result.success) {
            // Clear cart
            cart = [];
            saveCart();
            updateCartCount();

            // Show appropriate success message based on payment method
            let message = '';
            if (payment_method === 'ton') {
                message = `Пожалуйста, отправьте ${result.total_ton.toFixed(4)} TON на адрес:\n${shopSettings.ton_wallet}\n\nСумма: ${result.total_uah} грн`;
                tg.showAlert(message);
            } else {
                message = `Счет отправлен! Сумма: ${result.total_uah} грн (${result.total_stars} ⭐). Проверьте чат с ботом для оплаты.`;
                tg.showAlert(message);
            }

            // Return to main view
            showView('main');
        } else {
            tg.showAlert('Ошибка создания заказа: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Checkout error:', error);
        tg.showAlert('Ошибка при оформлении заказа');
    } finally {
        showLoading(false);
    }
}

// Show/hide loading
function showLoading(show) {
    const loader = document.getElementById('loading');
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

// Initialize app
init();
