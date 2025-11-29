/**
 * Currency conversion utilities for UAH to Telegram Stars
 * Takes into account platform commissions
 */

const MOBILE_RATE = parseFloat(process.env.MOBILE_STARS_RATE || 1.0);
const DESKTOP_RATE = parseFloat(process.env.DESKTOP_STARS_RATE || 1.2);

/**
 * Convert UAH to Telegram Stars based on platform
 * @param {number} amountUAH - Amount in Ukrainian Hryvnia
 * @param {string} platform - User platform ('mobile' or 'desktop')
 * @returns {number} Amount in Telegram Stars (rounded)
 */
function convertToStars(amountUAH, platform = 'mobile') {
    const rate = platform === 'desktop' ? DESKTOP_RATE : MOBILE_RATE;
    return Math.ceil(amountUAH * rate);
}

/**
 * Detect platform from Telegram WebApp data
 * @param {object} webAppData - Telegram WebApp initData
 * @returns {string} 'mobile' or 'desktop'
 */
function detectPlatform(webAppData) {
    // Telegram WebApp platform detection
    if (webAppData && webAppData.platform) {
        const platform = webAppData.platform.toLowerCase();

        // Mobile platforms
        if (platform.includes('android') ||
            platform.includes('ios') ||
            platform.includes('mobile')) {
            return 'mobile';
        }

        // Desktop platforms
        if (platform.includes('macos') ||
            platform.includes('windows') ||
            platform.includes('linux') ||
            platform.includes('web')) {
            return 'desktop';
        }
    }

    // Default to mobile (higher commission)
    return 'mobile';
}

/**
 * Format price for display
 * @param {number} priceUAH - Price in UAH
 * @param {number} priceStars - Price in Stars
 * @returns {string} Formatted price string
 */
function formatPrice(priceUAH, priceStars) {
    return `${priceUAH.toFixed(2)} грн (${priceStars} ⭐)`;
}

module.exports = {
    convertToStars,
    detectPlatform,
    formatPrice,
    MOBILE_RATE,
    DESKTOP_RATE
};
