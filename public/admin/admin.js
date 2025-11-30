// Check auth
if (!localStorage.getItem('admin_logged_in')) {
    window.location.href = '/admin';
}

// Display username
document.getElementById('adminUsername').textContent =
    localStorage.getItem('admin_username') || 'Admin';

// Logout function
function logout() {
    localStorage.removeItem('admin_logged_in');
    localStorage.removeItem('admin_username');
    localStorage.removeItem('admin_password');
    window.location.href = '/admin';
}

// Helper to create authorized headers
function getAuthHeaders() {
    const username = localStorage.getItem('admin_username');
    const password = localStorage.getItem('admin_password');

    if (!username || !password) {
        throw new Error('Not authenticated');
    }

    const credentials = btoa(`${username}:${password}`);
    return {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
    };
}

// Tab switching
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName + 'Tab').classList.add('active');
    event.target.classList.add('active');

    // Load data
    if (tabName === 'products') {
        loadProducts();
    } else if (tabName === 'banners') {
        loadBanners();
    } else if (tabName === 'orders') {
        loadOrders();
    } else if (tabName === 'settings') {
        loadSettings();
    }
}

// ... (existing code) ...

// Settings
async function loadSettings() {
    try {
        const response = await fetch('/api/settings', {
            headers: getAuthHeaders()
        });
        if (response.status === 401) { logout(); return; }
        const settings = await response.json();

    document.getElementById('enableStars').checked = settings.enable_stars;
    document.getElementById('enableTon').checked = settings.enable_ton;
    document.getElementById('tonWallet').value = settings.ton_wallet || '';
    document.getElementById('novaPoshtaKey').value = settings.nova_poshta_api_key || '';
    document.getElementById('iconHome').value = settings.icon_home || '';
    document.getElementById('iconCart').value = settings.icon_cart || '';
    document.getElementById('iconProfile').value = settings.icon_profile || '';
    document.getElementById('iconPay').value = settings.icon_pay || '';
    document.getElementById('iconNova').value = settings.icon_novaposhta || '';
    document.getElementById('iconUkr').value = settings.icon_ukrposhta || '';
    document.getElementById('iconMeest').value = settings.icon_meest || '';
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const settings = {
        enable_stars: document.getElementById('enableStars').checked,
        enable_ton: document.getElementById('enableTon').checked,
        ton_wallet: document.getElementById('tonWallet').value,
        nova_poshta_api_key: document.getElementById('novaPoshtaKey').value,
        icon_home: document.getElementById('iconHome').value,
        icon_cart: document.getElementById('iconCart').value,
        icon_profile: document.getElementById('iconProfile').value,
        icon_pay: document.getElementById('iconPay').value,
        icon_novaposhta: document.getElementById('iconNova').value,
        icon_ukrposhta: document.getElementById('iconUkr').value,
        icon_meest: document.getElementById('iconMeest').value
    };

    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify(settings)
        });

        if (response.ok) {
            alert('Настройки сохранены!');
        } else {
            if (response.status === 401) { logout(); return; }
            alert('Ошибка сохранения настроек');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Ошибка сохранения настроек');
    }
});

// ==================== Products ====================

async function loadProducts() {
    try {
        const response = await fetch('/api/products', {
            headers: getAuthHeaders() // Even GET might need auth if we protected it, but usually safe to send
        });
        const products = await response.json();

        const productsList = document.getElementById('productsList');

        if (products.length === 0) {
            productsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">Товаров пока нет</p>';
            return;
        }

        productsList.innerHTML = products.map(product => `
      <div class="product-card">
        ${product.image_url ?
                `<img src="${product.image_url}" class="product-image" alt="${product.name}">` :
                `<div class="product-image" style="display: flex; align-items: center; justify-content: center; background: var(--background);">
            <span style="font-size: 48px;">📦</span>
          </div>`
            }
        <h3>${product.name}</h3>
        <p>${product.description || 'Без описания'}</p>
        <div class="product-price">${product.price_uah} грн</div>
        <div class="product-actions">
            <button class="btn-edit" onclick="editProduct(${product.id})">✏️ Изменить</button>
            <button class="btn-delete" onclick="deleteProduct(${product.id})">🗑️ Удалить</button>
        </div>
      </div>
    `).join('');
    } catch (error) {
        console.error('Error loading products:', error);
    }
}

function showAddProduct() {
    document.getElementById('formTitle').textContent = 'Добавить товар';
    document.getElementById('productId').value = '';
    document.getElementById('productDataForm').reset();
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('productForm').style.display = 'flex';
}

function hideProductForm() {
    document.getElementById('productForm').style.display = 'none';
}

async function editProduct(id) {
    try {
        const response = await fetch(`/api/products/${id}`, {
            headers: getAuthHeaders()
        });
        if (response.status === 401) { logout(); return; }
        const product = await response.json();

        document.getElementById('formTitle').textContent = 'Изменить товар';
        document.getElementById('productId').value = product.id;
        document.getElementById('productName').value = product.name;
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productPrice').value = product.price_uah;

        if (product.image_url) {
            const preview = document.getElementById('imagePreview');
            preview.src = product.image_url;
            preview.style.display = 'block';
        }

        document.getElementById('productForm').style.display = 'flex';
    } catch (error) {
        console.error('Error loading product:', error);
    }
}

async function deleteProduct(id) {
    if (!confirm('Удалить этот товар?')) return;

    try {
        const response = await fetch(`/api/products/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.status === 401) { logout(); return; }

        loadProducts();
    } catch (error) {
        console.error('Error deleting product:', error);
        alert('Ошибка при удалении товара');
    }
}

// Handle product form submission
document.getElementById('productDataForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('productId').value;
    const formData = new FormData();

    formData.append('name', document.getElementById('productName').value);
    formData.append('description', document.getElementById('productDescription').value);
    formData.append('price_uah', document.getElementById('productPrice').value);

    const imageFile = document.getElementById('productImage').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const url = id ? `/api/products/${id}` : '/api/products';
        const method = id ? 'PUT' : 'POST';

        // For FormData, we need Auth header but NOT Content-Type (browser sets it)
        const headers = getAuthHeaders();
        delete headers['Content-Type'];

        const response = await fetch(url, {
            method,
            headers,
            body: formData
        });

        if (response.status === 401) { logout(); return; }

        hideProductForm();
        loadProducts();
    } catch (error) {
        console.error('Error saving product:', error);
        alert('Ошибка при сохранении товара');
    }
});

// Image preview
document.getElementById('productImage').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('imagePreview');
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

// ==================== Banners ====================

async function loadBanners() {
    try {
        const response = await fetch('/api/banners', {
            headers: getAuthHeaders()
        });
        const banners = await response.json();

        const bannersList = document.getElementById('bannersList');

        if (banners.length === 0) {
            bannersList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">Баннеров пока нет</p>';
            return;
        }

        bannersList.innerHTML = banners.map(banner => `
      <div class="banner-card" style="background: var(--card-bg); padding: 15px; border-radius: 12px; margin-bottom: 15px; box-shadow: var(--shadow);">
        <img src="${banner.image_url}" style="width: 100%; height: 200px; object-fit: cover; border-radius: 8px; margin-bottom: 10px;" alt="Banner">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 600;">Порядок: ${banner.sort_order}</div>
            ${banner.link_url ? `<div style="font-size: 14px; color: var(--text-secondary);">${banner.link_url}</div>` : ''}
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn-edit" onclick="editBanner(${banner.id})">✏️</button>
            <button class="btn-delete" onclick="deleteBanner(${banner.id})">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
    } catch (error) {
        console.error('Error loading banners:', error);
    }
}

function showAddBanner() {
    document.getElementById('bannerFormTitle').textContent = 'Добавить баннер';
    document.getElementById('bannerId').value = '';
    document.getElementById('bannerDataForm').reset();
    document.getElementById('bannerImagePreview').style.display = 'none';
    document.getElementById('bannerForm').style.display = 'flex';
}

function hideBannerForm() {
    document.getElementById('bannerForm').style.display = 'none';
}

async function editBanner(id) {
    try {
        const response = await fetch('/api/banners', {
            headers: getAuthHeaders()
        });
        const banners = await response.json();
        const banner = banners.find(b => b.id === id);

        if (!banner) return;

        document.getElementById('bannerFormTitle').textContent = 'Изменить баннер';
        document.getElementById('bannerId').value = banner.id;
        document.getElementById('bannerLink').value = banner.link_url || '';
        document.getElementById('bannerSort').value = banner.sort_order;

        const preview = document.getElementById('bannerImagePreview');
        preview.src = banner.image_url;
        preview.style.display = 'block';

        document.getElementById('bannerForm').style.display = 'flex';
    } catch (error) {
        console.error('Error loading banner:', error);
    }
}

async function deleteBanner(id) {
    if (!confirm('Удалить этот баннер?')) return;

    try {
        const response = await fetch(`/api/banners/${id}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.status === 401) { logout(); return; }

        loadBanners();
    } catch (error) {
        console.error('Error deleting banner:', error);
        alert('Ошибка при удалении баннера');
    }
}

// Handle banner form submission
document.getElementById('bannerDataForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('bannerId').value;
    const formData = new FormData();

    formData.append('link_url', document.getElementById('bannerLink').value);
    formData.append('sort_order', document.getElementById('bannerSort').value);

    const imageFile = document.getElementById('bannerImage').files[0];
    if (imageFile || !id) {
        if (imageFile) {
            formData.append('image', imageFile);
        } else if (!id) {
            alert('Изображение обязательно для нового баннера');
            return;
        }
    }

    try {
        const url = id ? `/api/banners/${id}` : '/api/banners';
        const method = id ? 'PUT' : 'POST';

        // For FormData, we need Auth header but NOT Content-Type
        const headers = getAuthHeaders();
        delete headers['Content-Type'];

        const response = await fetch(url, {
            method,
            headers,
            body: formData
        });

        if (response.status === 401) { logout(); return; }

        hideBannerForm();
        loadBanners();
    } catch (error) {
        console.error('Error saving banner:', error);
        alert('Ошибка при сохранении баннера');
    }
});

// Banner image preview
document.getElementById('bannerImage').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('bannerImagePreview');
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

// ==================== Orders ====================

async function loadOrders() {
    try {
        const response = await fetch('/api/orders', { headers: getAuthHeaders() });
        const orders = await response.json();

        const ordersList = document.getElementById('ordersList');

        if (orders.length === 0) {
            ordersList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">Заказов пока нет</p>';
            return;
        }

        ordersList.innerHTML = orders.map(order => {
            let shipping = '';
            try {
                const addr = order.shipping_address ? JSON.parse(order.shipping_address) : {};
                shipping = `
                <div style="margin-top:8px; font-size:14px; color: var(--text-secondary);">
                  ${addr.method ? `Доставка: ${addr.method}` : ''}${addr.address ? `<br>Адрес: ${addr.address}` : ''}${addr.recipient ? `<br>Получатель: ${addr.recipient}` : ''}${addr.phone ? `<br>Тел: ${addr.phone}` : ''}
                </div>`;
            } catch (e) { shipping = ''; }

            const itemsHtml = Array.isArray(order.items) && order.items.length
                ? `<div style="margin-top:8px; font-size:14px; color: var(--text-secondary);">
                    Товары: ${order.items.map(i => `${i.product_name} x${i.quantity}`).join(', ')}
                   </div>`
                : '';

            const payInfo = order.payment_method === 'ton'
                ? `<br>💎 ${order.total_ton} TON`
                : order.payment_method === 'cod'
                    ? '<br>💵 Оплата при получении'
                    : `<br>⭐ ${order.total_stars} Stars`;

            return `
      <div class="order-card">
        <div class="order-header">
          <div>
            <div class="order-id">Заказ #${order.id}</div>
            <div style="color: var(--text-secondary); font-size: 14px;">
              ${new Date(order.created_at).toLocaleString('ru-RU')}
            </div>
            <div style="color: var(--text-secondary); font-size: 14px;">
              @${order.telegram_username || 'unknown'}
            </div>
            ${itemsHtml}
            ${shipping}
          </div>
          <div style="text-align:right;">
            <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
              <div class="order-status ${order.status}">${order.status === 'paid' ? '✅ Оплачено' : order.status === 'pending_cod' ? '🚚 Наложенный' : '⏳ Ожидание'}</div>
              <div style="font-size: 14px; color: var(--text-secondary);">
                ${order.platform || 'unknown'}
              </div>
              <div>
                <select id="status-${order.id}" style="padding:6px 8px; border-radius:8px; border:1px solid var(--border);">
                  <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>pending</option>
                  <option value="paid" ${order.status === 'paid' ? 'selected' : ''}>paid</option>
                  <option value="pending_cod" ${order.status === 'pending_cod' ? 'selected' : ''}>pending_cod</option>
                  <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>shipped</option>
                  <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>delivered</option>
                  <option value="canceled" ${order.status === 'canceled' ? 'selected' : ''}>canceled</option>
                </select>
                <button class="btn-secondary" style="padding:6px 10px; margin-top:6px;" onclick="updateOrderStatus(${order.id})">Обновить</button>
              </div>
              <button class="btn-primary" style="padding:6px 10px;" onclick="messageUser(${order.telegram_user_id || 0})">Написать</button>
            </div>
          </div>
        </div>
        <div class="order-total">
          💰 ${order.total_uah} грн
          ${payInfo}
        </div>
      </div>
    `;
        }).join('');
    } catch (error) {
        console.error('Error loading orders:', error);
    }
}

async function updateOrderStatus(id) {
    try {
        const status = document.getElementById(`status-${id}`).value;
        await fetch(`/api/orders/${id}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ status })
        });
        loadOrders();
    } catch (error) {
        console.error('Error updating status:', error);
        alert('Не удалось обновить статус');
    }
}

async function messageUser(telegramId) {
    if (!telegramId) {
        alert('Нет telegram_user_id');
        return;
    }
    const text = prompt('Введите сообщение покупателю:');
    if (!text) return;
    try {
        await fetch('/api/admin/message', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ telegram_user_id: telegramId, message: text })
        });
        alert('Сообщение отправлено');
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Не удалось отправить сообщение');
    }
}

// Initial load
loadProducts();
