const TelegramBot = require('node-telegram-bot-api');
const { db } = require('./database');
const { convertToStars, formatPrice } = require('./utils/currency');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name || 'друг';

    const welcomeMessage = `
👋 Привет, ${userName}!

Добро пожаловать в наш магазин! 

Нажмите кнопку ниже, чтобы открыть каталог товаров 👇
  `;

    const keyboard = {
        inline_keyboard: [
            [
                {
                    text: '🛍️ Открыть магазин',
                    web_app: { url: `${process.env.WEBAPP_URL}/app` }
                }
            ]
        ]
    };

    bot.sendMessage(chatId, welcomeMessage, { reply_markup: keyboard });
});

// Shop command
bot.onText(/\/shop/, async (msg) => {
    const chatId = msg.chat.id;

    const keyboard = {
        inline_keyboard: [
            [
                {
                    text: '🛍️ Открыть магазин',
                    web_app: { url: `${process.env.WEBAPP_URL}/app` }
                }
            ]
        ]
    };

    bot.sendMessage(chatId, '🛒 Нажмите кнопку для открытия магазина:', { reply_markup: keyboard });
});

/**
 * Create invoice for Telegram Stars payment
 * @param {number} chatId - Telegram chat ID
 * @param {object} orderData - Order data with items and total
 * @param {string} platform - User platform
 */
async function createInvoice(chatId, orderData, platform) {
    const totalStars = convertToStars(orderData.total_uah, platform);

    // Create invoice description
    const itemsList = orderData.items.map(item =>
        `• ${item.name} x${item.quantity} - ${item.price} грн`
    ).join('\n');

    const description = `Заказ:\n${itemsList}\n\nИтого: ${orderData.total_uah} грн`;

    // Telegram Stars invoice
    const invoice = {
        chat_id: chatId,
        title: '🛍️ Оплата заказа',
        description: description,
        payload: JSON.stringify({
            order_data: orderData,
            platform: platform
        }),
        provider_token: '', // Empty for Stars
        currency: 'XTR', // Telegram Stars currency code
        prices: [
            {
                label: `Товары (${orderData.total_uah} грн)`,
                amount: totalStars
            }
        ]
    };

    return bot.sendInvoice(
        invoice.chat_id,
        invoice.title,
        invoice.description,
        invoice.payload,
        invoice.provider_token,
        invoice.currency,
        invoice.prices
    );
}

/**
 * Handle successful payment
 */
bot.on('pre_checkout_query', async (query) => {
    // Always approve pre-checkout
    bot.answerPreCheckoutQuery(query.id, true);
});

/**
 * Handle successful payment and send receipt
 */
bot.on('successful_payment', async (msg) => {
    const chatId = msg.chat.id;
    const payment = msg.successful_payment;

    try {
        // Parse order data from payload
        const payload = JSON.parse(payment.invoice_payload);
        const { order_data, platform } = payload;

        // Save order to database
        const order = await db.createOrder(
            msg.from.id,
            msg.from.username,
            order_data.total_uah,
            payment.total_amount, // total_stars
            0, // total_ton (not used for stars payment)
            platform,
            'stars', // payment_method
            null, // transaction_hash
            order_data.items
        );

        // Update order status with payment ID
        await db.updateOrderStatus(order.id, 'paid', payment.telegram_payment_charge_id);

        // Send receipt
        const receiptMessage = `
✅ <b>Оплата успешно выполнена!</b>

🧾 <b>Чек #${order.id}</b>

📦 <b>Товары:</b>
${order_data.items.map(item =>
            `  • ${item.name} x${item.quantity} - ${item.price} грн`
        ).join('\n')}

💰 <b>Итого:</b>
  • ${order_data.total_uah.toFixed(2)} грн
  • ${payment.total_amount} ⭐ Stars

📅 <b>Дата:</b> ${new Date().toLocaleString('uk-UA')}
🆔 <b>ID платежа:</b> ${payment.telegram_payment_charge_id}

Спасибо за покупку! 🎉
    `;

        bot.sendMessage(chatId, receiptMessage, { parse_mode: 'HTML' });

    } catch (error) {
        console.error('Error processing payment:', error);
        bot.sendMessage(chatId, '❌ Произошла ошибка при обработке платежа. Пожалуйста, свяжитесь с поддержкой.');
    }
});

// Handle errors
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

module.exports = { bot, createInvoice };
