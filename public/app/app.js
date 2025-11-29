// Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();

// Get user platform from Telegram
const platform = tg.platform || 'unknown';
const userId = tg.initDataUnsafe?.user?.id;

// Cart management
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let products = [];

// Initialize
async function init() {
    await loadProducts();
    updateCartCount();

    // Apply Telegram theme
    applyTelegramTheme();
}

// Apply Telegram theme colors
function applyTelegramTheme() {
    if (tg.themeParams) {
        document.documentElement.style.setProperty('--primary', tg.themeParams.button_color || '#007AFF');
        document.documentElement.style.setProperty('--background', tg.themeParams.bg_color || '#F5F5F7');
        document.documentElement.style.setProperty('--card-bg', tg.themeParams.secondary_bg_color || '#FFFFFF');
        document.documentElement.style.setProperty('--text-primary', tg.themeParams.text_color || '#1D1D1F');
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
        return `
      <div class="product-card" onclick="addToCart(${product.id})">
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
              <div class="product-stars">${starsPrice} ⭐</div>
            </div>
            <button class="btn-add-cart" onclick="addToCart(${product.id}, event)">+</button>
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
    document.getElementById('cartCount').textContent = count;
}

// Show cart
function showCart() {
    displayCart();
    document.getElementById('mainView').style.display = 'none';
    document.getElementById('cartView').style.display = 'block';

    tg.HapticFeedback.impactOccurred('light');
}

// Show main view
function showMain() {
    document.getElementById('mainView').style.display = 'block';
    document.getElementById('cartView').style.display = 'none';

    tg.HapticFeedback.impactOccurred('light');
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

    document.getElementById('totalUAH').textContent = totalUAH.toFixed(2) + ' грн';
    document.getElementById('totalStars').textContent = totalStars + ' ⭐';
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

        const orderData = {
            telegram_user_id: userId,
            items: cart.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity
            })),
            platform: getPlatform()
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

            // Show success message
            tg.showAlert(`Счет отправлен! Сумма: ${result.total_uah} грн (${result.total_stars} ⭐). Проверьте чат с ботом для оплаты.`);

            // Return to main view
            showMain();
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
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

// Initialize app
init();
