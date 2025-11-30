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
let userOrders = [];
let selectedCategory = 'all';
let categories = [];

// TON Connect & Settings
let tonConnectUI;
let shopSettings = {
    enable_stars: true,
    enable_ton: false,
    ton_wallet: '',
    icon_home: '',
    icon_cart: '',
    icon_profile: '',
    icon_pay: '',
    icon_novaposhta: '',
    icon_ukrposhta: '',
    icon_meest: ''
};
const defaultIcons = {
    home: 'https://api.iconify.design/mdi/home.svg?color=%23007aff',
    cart: 'https://api.iconify.design/mdi/cart.svg?color=%23007aff',
    profile: 'https://api.iconify.design/mdi/account-circle.svg?color=%23007aff',
    pay: 'https://api.iconify.design/mdi/credit-card-outline.svg?color=%23007aff',
    nova: 'https://api.iconify.design/mdi/truck-delivery.svg?color=%23007aff',
    ukr: 'https://api.iconify.design/mdi/mailbox.svg?color=%23007aff',
    meest: 'https://api.iconify.design/mdi/truck-fast-outline.svg?color=%23007aff',
    cod: 'https://api.iconify.design/mdi/cash.svg?color=%23007aff',
    cartAdd: 'https://api.iconify.design/mdi/cart-plus.svg?color=%23ffffff',
    trash: 'https://api.iconify.design/mdi/trash-can-outline.svg?color=%23ff3b30'
};

// ????????: ??? ????????? ??????? (?? API)
let ukrCitiesCache = [];

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
    applyIcons();
    initUkrposhtaSuggestions();

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
    await loadUserOrders();
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

function getIconUrl(key, fallback) {
    return shopSettings[key] && shopSettings[key].trim() !== '' ? shopSettings[key] : fallback;
}

function applyIcons() {
    const homeIcon = document.getElementById('iconHomeNav');
    const cartIcon = document.getElementById('iconCartNav');
    const profileIcon = document.getElementById('iconProfileNav');
    const payButtonIcon = document.getElementById('payIconButton');
    const payInlineIcon = document.getElementById('payIconInline');
    const codInlineIcon = document.getElementById('codIconInline');
    const novaIcon = document.getElementById('iconNovaShip');
    const ukrIcon = document.getElementById('iconUkrShip');
    const meestIcon = document.getElementById('iconMeestShip');

    if (homeIcon) homeIcon.src = getIconUrl('icon_home', defaultIcons.home);
    if (cartIcon) cartIcon.src = getIconUrl('icon_cart', defaultIcons.cart);
    if (profileIcon) profileIcon.src = getIconUrl('icon_profile', defaultIcons.profile);
    if (payButtonIcon) payButtonIcon.src = getIconUrl('icon_pay', defaultIcons.pay);
    if (payInlineIcon) payInlineIcon.src = getIconUrl('icon_pay', defaultIcons.pay);
    if (codInlineIcon) codInlineIcon.src = defaultIcons.cod;
    if (novaIcon) novaIcon.src = getIconUrl('icon_novaposhta', defaultIcons.nova);
    if (ukrIcon) ukrIcon.src = getIconUrl('icon_ukrposhta', defaultIcons.ukr);
    if (meestIcon) meestIcon.src = getIconUrl('icon_meest', defaultIcons.meest);
}

function initUkrposhtaSuggestions() {
    const cityList = document.getElementById('upCityList');
    const idxList = document.getElementById('upIndexList');
    if (cityList) cityList.innerHTML = '';
    if (idxList) idxList.innerHTML = '';
}

// Get platform for pricing
function getPlatform() {
    return platform || 'mobile';
}

// Stars conversion with platform-specific rates
function getStarRate() {
    const platformName = (tg.platform || 'unknown').toLowerCase();
    // Mobile (iOS/Android) - expensive packages (~0.99 UAH/Star)
    if (platformName === 'ios' || platformName === 'android' || platformName === 'weba') {
        return 0.99;
    }
    // Desktop/Web - cheaper packages (~0.84 UAH/Star)
    return 0.84;
}

function smartRoundStars(stars) {
    const integerStars = Math.round(stars);
    const remainder = integerStars % 100;

    if (remainder < 90) {
        return integerStars - remainder; // Round down to nearest 100
    } else {
        return integerStars + (100 - remainder); // Round up to nearest 100
    }
}

function convertToStars(uah) {
    const rate = getStarRate();
    const rawStars = uah / rate;
    return smartRoundStars(rawStars);
}

// Load products
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        products = await response.json();
        // Собрать категории
        categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
        renderCategoryFilter();
        renderProducts();
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

function renderCategoryFilter() {
    const select = document.getElementById('categoryFilter');
    if (!select) return;
    const options = ['<option value="all">Все категории</option>']
        .concat(categories.map(c => `<option value="${escapeHtml(c)}"${selectedCategory === c ? ' selected' : ''}>${escapeHtml(c)}</option>`));
    select.innerHTML = options.join('');
}

function onCategoryChange(event) {
    selectedCategory = event.target.value;
    renderProducts();
}

function renderProducts() {
    const productsList = document.getElementById('productsList');
    if (!productsList) return;

    const filtered = selectedCategory === 'all'
        ? products
        : products.filter(p => (p.category || '') === selectedCategory);

    if (filtered.length === 0) {
        productsList.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-secondary);">Товаров пока нет</p>';
        return;
    }

    productsList.innerHTML = filtered.map(product => {
        return `
      <div class="product-card" onclick="openProductModal(${product.id})">
        ${product.image_url ?
                `<img src="${escapeHtml(product.image_url)}" class="product-image" alt="${escapeHtml(product.name)}">` :
                `<div class="product-image" style="display: flex; align-items: center; justify-content: center;">
            <iconify-icon icon="mdi:package-variant" style="font-size: 64px; color: var(--text-secondary);"></iconify-icon>
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
                <img src="${getIconUrl('icon_cart', defaultIcons.cartAdd)}" alt="add to cart">
            </button>
          </div>
        </div>
      </div>
    `;
    }).join('');
}

// Load banners
async function loadBanners() {
    try {
        const response = await fetch('/api/banners');
        const banners = await response.json();

        const bannersContainer = document.getElementById('bannersContainer');
        if (!bannersContainer) return;

        const bannersCarousel = document.getElementById('bannersCarousel');

        if (banners.length === 0) {
            bannersContainer.style.display = 'none';
            return;
        }

        bannersContainer.style.display = 'block';
        bannersCarousel.innerHTML = banners.map(banner => `
      <div class="banner-item" ${banner.link_url ? `onclick="window.open('${escapeHtml(banner.link_url)}', '_blank')"` : ''}>
        <img src="${escapeHtml(banner.image_url)}" alt="Banner">
      </div>
    `).join('');
    } catch (error) {
        console.error('Error loading banners:', error);
    }
}

// View navigation
function showView(viewName) {
    const views = document.querySelectorAll('.view');
    views.forEach(view => view.style.display = 'none');

    const targetView = document.getElementById(`${viewName}View`);
    if (targetView) {
        targetView.style.display = 'block';

        // Display cart when switching to cart view
        if (viewName === 'cart') {
            displayCart();
            if (cart.length > 0) {
                tg.MainButton.show();
            }
        } else if (viewName === 'profile') {
            renderUserOrders();
            tg.MainButton.hide();
        } else {
            if (viewName !== 'cart') {
                tg.MainButton.hide();
            }
        }
    }

    // Update nav active state
    const navButtons = document.querySelectorAll('.nav-item');
    navButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(viewName)) {
            btn.classList.add('active');
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
          <iconify-icon icon="mdi:package-variant" style="font-size: 48px; color: var(--text-secondary);"></iconify-icon>
        </div>`
        }
      <div class="cart-item-info">
        <div class="cart-item-name">${escapeHtml(item.name)}</div>
        <div class="cart-item-price">${item.price} грн × ${item.quantity}</div>
        <div class="cart-item-controls">
          <button class="btn-quantity" onclick="updateQuantity(${item.product_id}, -1)">−</button>
          <span class="item-quantity">${item.quantity}</span>
          <button class="btn-quantity" onclick="updateQuantity(${item.product_id}, 1)">+</button>
          <button class="btn-remove" onclick="removeFromCart(${item.product_id})">
            <img src="${defaultIcons.trash}" alt="Удалить">
          </button>
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

// Checkout - now shows shipping form
async function checkout() {
    if (!userId) {
        tg.showAlert('Ошибка: не удалось получить ID пользователя');
        return;
    }

    if (cart.length === 0) {
        tg.showAlert('Корзина пуста');
        return;
    }

    // Show shipping form
    showView('shipping');
    tg.MainButton.hide();
}

// Switch between shipping methods
function switchShippingMethod() {
    const method = document.getElementById('shippingMethodSelect').value;

    document.getElementById('novaposhtaForm').style.display = method === 'novaposhta' ? 'block' : 'none';
    document.getElementById('ukrposhtaForm').style.display = method === 'ukrposhta' ? 'block' : 'none';
    document.getElementById('meestForm').style.display = method === 'meest' ? 'block' : 'none';
}

let ukrCitySearchTimeout;
async function onUpCityInput() {
    const query = document.getElementById('upCity').value.trim();
    const cityIdInput = document.getElementById('upCityId');
    if (cityIdInput) cityIdInput.value = '';

    if (query.length < 2) {
        const list = document.getElementById('upCityList');
        if (list) list.innerHTML = '';
        return;
    }

    clearTimeout(ukrCitySearchTimeout);
    ukrCitySearchTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`/api/ukrposhta/cities?query=${encodeURIComponent(query)}`);
            const data = await response.json();
            ukrCitiesCache = Array.isArray(data) ? data : [];

            const list = document.getElementById('upCityList');
            if (list) {
                list.innerHTML = ukrCitiesCache.map(c => `<option value="${c.city_ua || c.city || c.name || ''}">`).join('');
            }

            // Если точное совпадение — фиксируем id и подтягиваем индексы
            const match = ukrCitiesCache.find(c => (c.city_ua || c.city || '').toLowerCase() === query.toLowerCase());
            if (match && cityIdInput) {
                cityIdInput.value = match.city_id || match.id || '';
                await fetchUkrIndexes(cityIdInput.value);
            }
        } catch (err) {
            console.error('Ukrposhta city search error:', err);
        }
    }, 300);
}

async function fetchUkrIndexes(cityId) {
    if (!cityId) return;
    try {
        const response = await fetch(`/api/ukrposhta/indexes?city_id=${cityId}`);
        const data = await response.json();
        const list = document.getElementById('upIndexList');
        if (list && Array.isArray(data)) {
            list.innerHTML = data.map(i => `<option value="${i.postindex || i.post_index || i.index || ''}">${i.city_ua || ''}</option>`).join('');
        }
    } catch (err) {
        console.error('Ukrposhta indexes error:', err);
    }
}

async function onUpIndexInput() {
    const idx = document.getElementById('upIndex').value.trim();
    if (idx.length < 3) return;
    try {
        const response = await fetch(`/api/ukrposhta/postoffices?pc=${encodeURIComponent(idx)}`);
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            const first = data[0];
            const cityName = first.city_ua || first.city || '';
            if (cityName) {
                document.getElementById('upCity').value = cityName;
            }
        }
    } catch (err) {
        console.error('Ukrposhta postoffices error:', err);
    }
}

// Nova Poshta city search
let npCitySearchTimeout;
async function searchNPCities() {
    const query = document.getElementById('npCity').value;

    if (query.length < 2) {
        document.getElementById('npCitiesList').style.display = 'none';
        return;
    }

    clearTimeout(npCitySearchTimeout);
    npCitySearchTimeout = setTimeout(async () => {
        try {
            const response = await fetch('/api/novaposhta/cities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            const cities = await response.json();
            displayNPCities(cities);
        } catch (error) {
            console.error('City search error:', error);
        }
    }, 300);
}

function displayNPCities(cities) {
    const list = document.getElementById('npCitiesList');

    if (!cities || cities.length === 0) {
        list.style.display = 'none';
        return;
    }

    list.innerHTML = cities.map(city => `
        <div class="autocomplete-item" onclick="selectNPCity('${city.ref}', '${city.name.replace(/'/g, "\\'")}')">
            ${city.name}
        </div>
    `).join('');

    list.style.display = 'block';
}

async function selectNPCity(ref, name) {
    document.getElementById('npCity').value = name;
    document.getElementById('npCityRef').value = ref;
    document.getElementById('npCitiesList').style.display = 'none';

    // Load warehouses for selected city
    await loadNPWarehouses(ref);
}

async function loadNPWarehouses(cityRef) {
    const warehouseSelect = document.getElementById('npWarehouse');
    warehouseSelect.disabled = true;
    warehouseSelect.innerHTML = '<option>Завантаження...</option>';

    try {
        const response = await fetch('/api/novaposhta/warehouses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cityRef })
        });

        const warehouses = await response.json();

        warehouseSelect.innerHTML = warehouses.map(w => `
            <option value="${w.ref}">${w.name}</option>
        `).join('');

        warehouseSelect.disabled = false;
    } catch (error) {
        console.error('Warehouse load error:', error);
        warehouseSelect.innerHTML = '<option>Помилка завантаження</option>';
    }
}

// Proceed to payment with shipping data
async function proceedToPayment() {
    const method = document.getElementById('shippingMethodSelect').value;
    let shippingData = {};

    // Validate and collect data based on method
    if (method === 'novaposhta') {
        const city = document.getElementById('npCity').value;
        const cityRef = document.getElementById('npCityRef').value;
        const warehouse = document.getElementById('npWarehouse').value;
        const firstName = document.getElementById('npFirstName').value;
        const lastName = document.getElementById('npLastName').value;
        const phone = document.getElementById('npPhone').value;

        if (!city || !cityRef || !warehouse || !firstName || !lastName || !phone) {
            tg.showAlert('Заповніть всі поля');
            return;
        }

        const warehouseName = document.getElementById('npWarehouse').options[document.getElementById('npWarehouse').selectedIndex].text;

        shippingData = {
            method: 'novaposhta',
            address: `${city}, ${warehouseName}`,
            recipient: `${firstName} ${lastName}`,
            phone: phone,
            cityRef: cityRef,
            warehouseRef: warehouse
        };
    } else if (method === 'ukrposhta') {
        const city = document.getElementById('upCity').value;
        const index = document.getElementById('upIndex').value;
        const address = document.getElementById('upAddress').value;
        const firstName = document.getElementById('upFirstName').value;
        const lastName = document.getElementById('upLastName').value;
        const phone = document.getElementById('upPhone').value;

        if (!city || !index || !address || !firstName || !lastName || !phone) {
            tg.showAlert('Заповніть всі поля');
            return;
        }

        shippingData = {
            method: 'ukrposhta',
            address: `${index}, ${city}, ${address}`,
            recipient: `${firstName} ${lastName}`,
            phone: phone
        };
    } else if (method === 'meest') {
        const city = document.getElementById('meestCity').value;
        const index = document.getElementById('meestIndex').value;
        const address = document.getElementById('meestAddress').value;
        const firstName = document.getElementById('meestFirstName').value;
        const lastName = document.getElementById('meestLastName').value;
        const phone = document.getElementById('meestPhone').value;

        if (!city || !index || !address || !firstName || !lastName || !phone) {
            tg.showAlert('Заповніть всі поля');
            return;
        }

        shippingData = {
            method: 'meest',
            address: `${index}, ${city}, ${address}`,
            recipient: `${firstName} ${lastName}`,
            phone: phone
        };
    }

    // Now proceed with payment
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'online';
    await processPayment(shippingData, paymentMethod);
}

async function processPayment(shippingData, paymentMethod) {
    try {
        showLoading(true);

        // Determine payment method based on settings
        let payment_method = paymentMethod === 'cod' ? 'cod' : 'stars'; // default online

        if (payment_method !== 'cod') {
            if (shopSettings.enable_ton && !shopSettings.enable_stars) {
                payment_method = 'ton';
            } else if (shopSettings.enable_ton && shopSettings.enable_stars) {
                payment_method = 'ton';
            }
        }

        // For TON - use TON Connect
        if (payment_method === 'ton') {
            await checkoutWithTON(shippingData.method, JSON.stringify(shippingData));
            return;
        }

        // Для наложенного платежа: создаём заказ и завершаем без инвойса
        if (payment_method === 'cod') {
            const orderData = {
                telegram_user_id: userId,
                items: cart.map(item => ({
                    product_id: item.product_id,
                    quantity: item.quantity
                })),
                platform: getPlatform(),
                payment_method: 'cod',
                shipping_method: shippingData.method,
                shipping_address: JSON.stringify(shippingData)
            };

            const response = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(orderData)
            });
            const result = await response.json();

            if (result.success) {
                cart = [];
                saveCart();
                updateCartCount();
                tg.showAlert(`Заказ оформлен. Оплата при получении. Номер заказа: ${result.order_id}`);
                showView('main');
            } else {
                tg.showAlert('Ошибка оформления заказа: ' + (result.error || 'неизвестная ошибка'));
            }
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
            payment_method: 'stars',
            shipping_method: shippingData.method,
            shipping_address: JSON.stringify(shippingData)
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
async function checkoutWithTON(shippingMethod, shippingAddress) {
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
            payment_method: 'ton',
            shipping_method: shippingMethod,
            shipping_address: shippingAddress
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


async function loadUserOrders() {
    if (!userId) return;
    try {
        const response = await fetch(`/api/user/orders?telegram_user_id=${userId}`);
        userOrders = await response.json();
        renderUserOrders();
    } catch (error) {
        console.error('Error loading user orders:', error);
    }
}

function renderUserOrders() {
    const container = document.getElementById('userOrdersList');
    if (!container) return;

    if (!userOrders || userOrders.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary);">Заказов пока нет</div>';
        return;
    }

    container.innerHTML = userOrders.map(order => {
        const items = (order.items || []).map(i => `${escapeHtml(i.product_name)} x${i.quantity}`).join(', ');
        const statusText = order.status || 'pending';
        return `
        <div class="user-order-card">
            <div class="meta">
                <span>#${order.id}</span>
                <span>${new Date(order.created_at).toLocaleString('ru-RU')}</span>
            </div>
            <div class="items">${items || 'Без позиций'}</div>
            <div style="margin-top:6px; font-weight:600;">${order.total_uah} грн</div>
            <div style="color: var(--text-secondary); font-size: 14px; margin-top:4px;">Статус: ${statusText}</div>
        </div>
        `;
    }).join('');
}
