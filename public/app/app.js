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

    // Setup Main Button listener
    tg.MainButton.onClick(checkout);
}

// Helper to darken/lighten color
function adjustColor(color, amount) {
    return '#' + color.replace(/^#/, '').replace(/../g, color => ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
}

// Helper to escape HTML (prevent XSS)
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
        return `
      <div class="product-card" onclick="openProductModal(${product.id})">
        ${product.image_url ?
                `<img src="${escapeHtml(product.image_url)}" class="product-image" alt="${escapeHtml(product.name)}">` :
                `<div class="product-image" style="display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 48px;">📦</span>
          </div>`
            }
        <div class="product-info">
          <div class="product-name">${escapeHtml(product.name)}</div>
          ${product.description ? `<div class="product-description">${escapeHtml(product.description)}</div>` : ''}
          <div class="product-footer">
            <div>
              <div class="product-price">${product.price_uah} грн</div>
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

// Helper: Get platform-specific Star rate (UAH per 1 Star)
function getStarRate() {
    const platformName = (tg.platform || 'unknown').toLowerCase();
    // Mobile (iOS/Android) - expensive packages (~0.99 UAH/Star)
    if (platformName === 'ios' || platformName === 'android' || platformName === 'weba') {
        return 0.99;
    }
    // Desktop/Web - cheaper packages (~0.84 UAH/Star)
    return 0.84;
}

// Helper: Smart round stars amount
// User logic: 2510->2500, 2580->2500, 2590->2600
// Interpretation: Round to nearest 100. If remainder < 90, round down. If >= 90, round up.
function smartRoundStars(stars) {
    const integerStars = Math.round(stars);
    const remainder = integerStars % 100;

    if (remainder < 90) {
        return integerStars - remainder; // Round down to nearest 100
    } else {
        return integerStars + (100 - remainder); // Round up to nearest 100
    }
}

function convertToStars(uahAmount) {
    if (!shopSettings.enable_stars) return 0;
    const rate = getStarRate();
    const rawStars = uahAmount / rate;
    return smartRoundStars(rawStars);
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
    if (modalImg) modalImg.src = escapeHtml(product.image_url) || '';

    document.getElementById('modalProductName').textContent = product.name;
    document.getElementById('modalProductDescription').textContent = product.description || 'Нет описания';
    document.getElementById('modalProductPrice').textContent = `${product.price_uah} грн`;

    // Hide Stars display in modal
    const modalStars = document.getElementById('modalProductStars');
    if (modalStars) modalStars.style.display = 'none';

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

    // Update Main Button
    const totalUAH = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    if (count > 0) {
        tg.MainButton.setText(`Оформить заказ (${totalUAH} грн)`);
        if (document.getElementById('cartView').style.display === 'block') {
            tg.MainButton.show();
        } else {
            tg.MainButton.hide();
        }
    } else {
        tg.MainButton.hide();
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
        document.getElementById('totalUAH').textContent = '0.00 грн';
        document.getElementById('totalStars').textContent = '0 ⭐';
        return;
    }

    cartItems.style.display = 'flex';
    cartEmpty.style.display = 'none';
    cartFooter.style.display = 'block';

    // Display items
    cartItems.innerHTML = cart.map(item => `
    <div class="cart-item">
      ${item.image_url ?
            `<img src="${escapeHtml(item.image_url)}" class="cart-item-image" alt="${escapeHtml(item.name)}">` :
            `<div class="cart-item-image" style="display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 32px;">📦</span>
        </div>`
        }
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(item.name)}</div>
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

    document.getElementById('totalUAH').textContent = totalUAH.toFixed(2) + ' грн';

    // Hide Stars total
    const totalStarsEl = document.getElementById('totalStars');
    if (totalStarsEl) totalStarsEl.style.display = 'none';

    tg.MainButton.setText(`Оформить заказ (${totalUAH} грн)`);
    tg.MainButton.show();
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
            payment_method = 'ton';
        } else if (shopSettings.enable_ton && shopSettings.enable_stars) {
            payment_method = 'ton';
        }

        // For TON - use TON Connect
        if (payment_method === 'ton') {
            await checkoutWithTON();
            return;
        }

        // For Stars - existing logic
        const orderData = {
            telegram_user_id: userId,
            items: cart.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity
            })),
            platform: getPlatform(),
            payment_method: 'stars'
        };

        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (result.success) {
            // Direct Invoice Payment
            if (result.invoice_link) {
                tg.openInvoice(result.invoice_link, (status) => {
                    if (status === 'paid') {
                        cart = [];
                        saveCart();
                        updateCartCount();
                        tg.showAlert('✅ Оплата прошла успешно!');
                        tg.close();
                    } else if (status === 'cancelled') {
                        tg.showAlert('Оплата отменена');
                    } else if (status === 'failed') {
                        tg.showAlert('Ошибка оплаты');
                    } else {
                        tg.showAlert('Статус оплаты: ' + status);
                    }
                });
            } else {
                // Fallback for old behavior or other methods
                cart = [];
                saveCart();
                updateCartCount();
                tg.showAlert(`Заказ создан! Сумма: ${result.total_uah} грн. Проверьте чат.`);
                showView('main');
            }
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

// TON Connect payment flow
async function checkoutWithTON() {
    let totalTonAmount = null; // Store for error handling

    try {
        // 1. Check wallet connection
        if (!tonConnectUI.connected) {
            tg.showAlert('Пожалуйста, подключите TON кошелек в разделе "Профиль"');
            showLoading(false);
            showView('profile');
            return;
        }

        const walletAddress = tonConnectUI.account.address;
        console.log('Wallet connected:', walletAddress);

        // 2. Create order on server
        const orderData = {
            telegram_user_id: userId,
            items: cart.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity
            })),
            platform: getPlatform(),
            payment_method: 'ton'
        };

        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error || 'Ошибка создания заказа');
        }

        console.log('Order created:', result.order_id);
        totalTonAmount = result.total_ton; // Save for error message

        // 3. Create TON transaction
        const amount = Math.floor(result.total_ton * 1000000000); // Convert to nanoTON

        const transaction = {
            validUntil: Math.floor(Date.now() / 1000) + 300, // 5 minutes (TON Connect max)
            messages: [
                {
                    address: shopSettings.ton_wallet,
                    amount: amount.toString()
                }
            ]
        };

        console.log('Sending transaction:', transaction);

        // 4. Send transaction via TON Connect
        const txResult = await tonConnectUI.sendTransaction(transaction);

        console.log('Transaction sent:', txResult);

        // 5. Update order with transaction hash
        await fetch(`/api/orders/${result.order_id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transaction_hash: txResult.boc,
                status: 'pending_confirmation'
            })
        });

        // 6. Clear cart and show success
        cart = [];
        saveCart();
        updateCartCount();

        tg.showAlert(`✅ Транзакция отправлена!\n\nСумма: ${result.total_ton.toFixed(4)} TON\nЗаказ #${result.order_id}\n\nЗаказ будет обработан после подтверждения в сети.`);
        showView('main');

    } catch (error) {
        console.error('TON payment error:', error);

        // Check for specific error types
        const errorMessage = error.message || '';

        if (errorMessage.includes('reject') || errorMessage.includes('cancel')) {
            // User cancelled the transaction
            tg.showAlert('Оплата отменена');
        } else if (errorMessage.includes('No enough funds') || errorMessage.includes('insufficient')) {
            // Insufficient funds - show friendly message
            const amountText = totalTonAmount ? totalTonAmount.toFixed(4) : '...';

            tg.showPopup({
                title: '💰 Недостаточно средств',
                message: `Для оплаты нужно ${amountText} TON.\n\nПополните кошелек или купите TON.`,
                buttons: [
                    { id: 'buy', type: 'default', text: 'Пополнить кошелек' },
                    { id: 'cancel', type: 'cancel', text: 'Отмена' }
                ]
            }, (buttonId) => {
                if (buttonId === 'buy') {
                    // Open Telegram Wallet
                    // Note: Direct link to "Buy" screen is not currently supported by @wallet
                    tg.openTelegramLink('https://t.me/wallet');
                }
            });
        } else {
            // Other errors
            tg.showAlert('Ошибка при оплате TON: ' + errorMessage);
        }
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
