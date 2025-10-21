        // Global Variables
let clients = []; // سنقوم بملء هذه المصفوفة من قاعدة البيانات
let operations = []; // (مستقبلاً سيتم ربطها)
let notifications = []; // (مستقبلاً سيتم ربطها)
let isMultiSelectMode = false;
let selectedClientIds = new Set();
let touchStartTime = 0;
let touchMoved = false;
let currentUser = null; 
let currentCalendarDate = new Date();

// Supabase Connection
const SUPABASE_URL = 'https://vkzhkvwdmayzrknuxrlw.supabase.co'; // رابط المشروع الخاص بك
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZremhrdndkbWF5enJrbnV4cmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MzMxMTEsImV4cCI6MjA3MDQwOTExMX0.QvXV5kB6OaOFM6R_PnFj8_yQ7EA58sSaBHFQeITuSsk'; // مفتاح API الخاص بك

// قمنا بتغيير اسم المتغير إلى supabaseClient لتجنب الخطأ
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * تتحقق مما إذا كانت جلسة المستخدم الحالية هي الجلسة النشطة.
 * @returns {Promise<boolean>} - ترجع true إذا كانت الجلسة صالحة، و false إذا لم تكن.
 */
async function verifyActiveSession() {
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (user) {
        const localSessionId = localStorage.getItem('active_session_id');

        // ✅ نقرأ الآن من الجدول الجديد مباشرة لضمان الحصول على أحدث قيمة
        const { data: remoteSession, error } = await supabaseClient
            .from('active_sessions')
            .select('session_id')
            .eq('user_id', user.id)
            .single();

        if (error || !remoteSession) {
            // حدث خطأ أو لا توجد جلسة مسجلة لهذا المستخدم
            // هذا يعني أنه يجب تسجيل الخروج
            showToast('جلسة الدخول غير صالحة، يرجى الدخول مرة أخرى.', 'error');
            setTimeout(async () => {
                await supabaseClient.auth.signOut();
                localStorage.clear();
                window.location.replace('index.html');
            }, 3000);
            return false;
        }

        const remoteSessionId = remoteSession.session_id;

        if (localSessionId && remoteSessionId && localSessionId === remoteSessionId) {
            // كل شيء سليم
            return true;
        } else {
            // تم تسجيل الدخول من جهاز آخر
            showToast('تم تسجيل الدخول من جهاز آخر، سيتم تسجيل خروجك الآن.', 'warning');
            
            setTimeout(async () => {
                await supabaseClient.auth.signOut();
                localStorage.clear();
                window.location.replace('index.html');
            }, 3000);

            return false;
        }
    }
    return true; 
}

// دالة جديدة لجلب كل العملاء من قاعدة البيانات
async function fetchClients() {
    const { data, error } = await supabaseClient // <--- تم التعديل هنا
        .from('clients')
        .select('*');

    if (error) {
        console.error('Error fetching clients:', error);
        showToast('خطأ في تحميل بيانات العملاء', 'error');
    } else {
        clients = data;
    }
}

async function fetchOperations() {
    const { data, error } = await supabaseClient.from('operations').select('*');
    if (error) console.error('Error fetching operations:', error);
    else operations = data;
}

async function fetchNotifications() {
    const { data, error } = await supabaseClient.from('notifications').select('*');
    if (error) console.error('Error fetching notifications:', error);
    else notifications = data;
}

        let clientToDeleteId = null;
        let currentSection = 'dashboard';
        let isNavigatingBack = false;
        let currentClientId = null;
        let currentSearchFilters = {
            clientType: 'all',
            status: 'all',
            budget: '',
            location: ''
        };

// ✅ هذه هي النسخة الصحيحة التي تعمل في المتصفح والموبايل
async function saveClientsToLocal(clientsData) {
    try {
        // التحقق من بيئة التشغيل
        if (window.Capacitor && Capacitor.isNativePlatform()) {
            // نحن على الموبايل: استخدم Capacitor Preferences
            await Capacitor.Plugins.Preferences.set({
                key: 'cached_clients',
                value: JSON.stringify(clientsData)
            });
        } else {
            // نحن في المتصفح: استخدم localStorage
            localStorage.setItem('cached_clients', JSON.stringify(clientsData));
        }
    } catch (e) {
        console.error("Failed to save clients locally", e);
    }
}

// ✅ وهذه هي النسخة الصحيحة للتحميل
async function loadClientsFromLocal() {
    try {
        // التحقق من بيئة التشغيل
        if (window.Capacitor && Capacitor.isNativePlatform()) {
            // نحن على الموبايل: استخدم Capacitor Preferences
            const { value } = await Capacitor.Plugins.Preferences.get({ key: 'cached_clients' });
            return value ? JSON.parse(value) : [];
        } else {
            // نحن في المتصفح: استخدم localStorage
            const value = localStorage.getItem('cached_clients');
            return value ? JSON.parse(value) : [];
        }
    } catch (e) {
        console.error("Failed to load clients from local storage", e);
        return [];
    }
}

// ===================================
// == App Initialization (The Correct Way) ==
// ===================================

// هذا هو السطر الوحيد المطلوب لبدء التطبيق
document.addEventListener('DOMContentLoaded', initializeApp);

/**
 * الدالة الرئيسية لبدء تشغيل التطبيق.
 * تضمن جلب البيانات أولاً قبل عرض أي شيء.
 */
/**
 * الدالة الرئيسية لبدء تشغيل التطبيق.
 * تضمن جلب البيانات أولاً قبل عرض أي شيء.
 */
async function initializeApp() {

        // ✅ أضف هذا الجزء في بداية الدالة مباشرة
    const isSessionValid = await verifyActiveSession();
    if (!isSessionValid) {
        return; // أوقف تحميل التطبيق إذا كانت الجلسة غير صالحة
    }
    
    // =============================================================
    // == الخطوة 1: جلب بيانات المستخدم المسجل أولاً وقبل كل شيء ==
    // =============================================================
    await loadUserProfile(); // تحميل بيانات المستخدم
    listenForSessionChanges(); // ✅ أضف هذا السطر هنا لبدء الاستماع

    // =================================================
    // == الخطوة 2: إعداد المستمعين الأساسيين للتطبيق ==
    // =================================================
    setupEventListeners(); // ربط الأزرار والنماذج
    enhanceNativeSelects(); // <-- أضف هذا السطر هنا
    updateCurrentDate();   // تحديث التاريخ في الواجهة

    // ===========================================
    // == الخطوة 3: إعداد ميزات الموبايل (Capacitor) ==
    // ===========================================
    if (window.Capacitor && Capacitor.isNativePlatform()) {
        const { App, LocalNotifications, DarkMode, BackgroundTask } = Capacitor.Plugins;

        // --- مستمع زر الرجوع في أندرويد ---
        App.addListener('backButton', (event) => {
            const openModal = document.querySelector('.modal.show');
            const sidebar = document.getElementById('sidebar');
            const panel = document.getElementById('notificationsPanel');

            if (isMultiSelectMode) {
                exitMultiSelectMode();
            } else if (openModal) {
                closeModal(openModal.id);
            } else if (window.innerWidth < 768 && sidebar.classList.contains('show')) {
                closeSidebar();
            } else if (panel && panel.classList.contains('show')) {
                history.back();
            } else if (currentSection === 'client-profile') {
                switchSection('clients');
            } else if (currentSection !== 'dashboard') {
                switchSection('dashboard');
            } else {
                App.exitApp();
            }
        });
// ===== بداية الكود الجديد لمعالجة الروابط العميقة =====

// التأكد من أننا على الموبايل قبل إضافة المستمع
if (window.Capacitor && Capacitor.isNativePlatform()) {
    const { App } = Capacitor.Plugins;

    App.addListener('appUrlOpen', async (event) => {
        console.log('App opened with URL:', event.url);
        showToast('تم استقبال رابط التأكيد...', 'info');

        // الرابط الذي سيصل من Supabase يبدو هكذا:
        // nrecrm://callback#access_token=...&refresh_token=...&type=email_change

        // استخراج التوكنز من الرابط
        const url = new URL(event.url);
        const hash = new URLSearchParams(url.hash.substring(1)); // نزيل # من البداية

        const accessToken = hash.get('access_token');
        const refreshToken = hash.get('refresh_token');

        if (!accessToken || !refreshToken) {
            console.error("لم يتم العثور على التوكن في الرابط.");
            showToast('رابط التأكيد غير صالح.', 'error');
            return;
        }

        // أهم خطوة: استخدام التوكنز لتسجيل وتأكيد جلسة المستخدم
        const { data, error } = await supabaseClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
        });

        if (error) {
            console.error('خطأ في تأكيد الجلسة:', error);
            showToast('فشل تأكيد تغيير البريد الإلكتروني.', 'error');
            return;
        }

        // إذا نجح كل شيء
        showToast('تم تأكيد البريد الإلكتروني بنجاح!', 'success');

        // تحديث بيانات المستخدم في الواجهة (الاسم، الإيميل الجديد، إلخ)
        await loadUserProfile();

        // الانتقال إلى الصفحة الرئيسية
        switchSection('dashboard');
    });
}
// ===== نهاية الكود الجديد =====
        // --- إعداد الوضع الداكن ---
        try {
            const result = await DarkMode.isDarkMode();
            applyTheme(result.isDarkMode);
            await DarkMode.addListener('darkModeStateChanged', (state) => {
                applyTheme(state.isDarkMode);
            });
        } catch(e) { console.error('Error handling dark mode', e); }

        // --- إعداد صلاحيات وقنوات الإشعارات ---
        try {
            await LocalNotifications.requestPermissions();
            await LocalNotifications.createChannel({
                id: 'crm_reminders_channel',
                name: 'تذكيرات ومتابعات CRM',
                description: 'إشعارات خاصة بمتابعة العملاء والتذكيرات',
                importance: 5,
                visibility: 1,
                sound: 'default'
            });
            console.log("Notification channel created successfully.");
        } catch (e) { console.log("Could not create notification channel (this is normal on iOS)", e); }
        
        // --- مستمع الضغط على الإشعارات ---
        try {
            LocalNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
                const clientId = notificationAction.notification.extra?.clientId;
                if (clientId) {
                    viewClientProfile(clientId);
                }
            });
        } catch (e) { console.error('Error setting up notification listener', e); }

        // --- تسجيل مهمة الخلفية ---
        try {
            let taskId = await BackgroundTask.beforeExit(async () => {
                console.log('Background Sync Task Starting...');
                await checkDueNotifications(); // فحص المواعيد
                BackgroundTask.finish({ taskId });
            });
        } catch (e) {
            console.error('Failed to register background task', e);
        }
    }

    // ====================================================================
    // == الخطوة 4: تحميل بيانات العملاء (من الكاش ثم من الإنترنت)     ==
    // ====================================================================
    clients = await loadClientsFromLocal();
    console.log(`Loaded ${clients.length} clients from local cache.`);
    updateDashboardStats();
    renderClientsTable();
    updateActiveFiltersDisplay();
    
    // جلب البيانات الجديدة من الإنترنت في الخلفية وتحديث الواجهة
    fetchClients().then(() => {
        console.log("Successfully synced with Supabase.");
        updateDashboardStats();
        renderClientsTable();
    }).catch(e => {
        console.warn("Could not sync with Supabase, running in offline mode.", e);
    });

    // ===============================================
    // == الخطوة 5: تحميل باقي البيانات وعرضها      ==
    // ===============================================
    await fetchOperations();
    await fetchNotifications();
    renderOperationsTable();
    loadNotifications();
    
    // ===========================================
    // == الخطوة 6: تشغيل المهام الدورية والذكية ==
    // ===========================================
    checkDueNotifications(); // الفحص الفوري عند بدء التشغيل
    setInterval(checkDueNotifications, 60 * 1000); // الفحص كل دقيقة

    // بدء سلسلة التذكيرات العشوائية بعد دقيقتين
    setTimeout(function runRandomReminderScheduler() {
        scheduleRandomClientReminder();
        const minHours = 4;
        const maxHours = 9;
        const randomInterval = (Math.random() * (maxHours - minHours) + minHours) * 60 * 60 * 1000;
        console.log(`Next random reminder check in ${(randomInterval / (1000 * 60 * 60)).toFixed(2)} hours.`);
        setTimeout(runRandomReminderScheduler, randomInterval);
    }, 2 * 60 * 1000);

    // ✅ النسخة الجديدة لتشغيل التذكير العشوائي في أوقات متغيرة
    function runRandomReminderScheduler() {
        // قم بتشغيل المهمة
        scheduleRandomClientReminder();

        // حدد وقتًا عشوائيًا للمرة القادمة (بين 4 و 9 ساعات)
        const minHours = 4;
        const maxHours = 9;
        const randomInterval = (Math.random() * (maxHours - minHours) + minHours) * 60 * 60 * 1000;
        
        console.log(`Next random reminder check in ${(randomInterval / (1000 * 60 * 60)).toFixed(2)} hours.`);

        // أعد جدولة المهمة للوقت العشوائي الجديد
        setTimeout(runRandomReminderScheduler, randomInterval);
    }

    // ابدأ سلسلة المهام العشوائية بعد دقيقتين من تشغيل التطبيق
    setTimeout(runRandomReminderScheduler, 2 * 60 * 1000);

} // <-- هذا هو القوس الأخير الذي يغلق دالة initializeApp

// ✅ أعد إضافة هذه الدالة
function convertArabicNumerals(str) {
    if (!str) return '';
    // هذه الدالة تقوم بتحويل الأرقام العربية (٠-٩) إلى إنجليزية (0-9)
    return str.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

// -------------------------------
// enhanceNativeSelects()
// يحول جميع <select class="form-select"> إلى custom dropdowns
// ويقوم بمزامنة القيمة مع الـ select الأصلي (ينفذ event 'change')
// -------------------------------
function enhanceNativeSelects() {
    // منع الازدواجية
    if (enhanceNativeSelects._done) return;
    enhanceNativeSelects._done = true;

    document.querySelectorAll('select.form-select').forEach(select => {
        // تخطي إن تم تحويله مسبقًا
        if (select.dataset.enhanced === '1') return;

        // إنشاء عناصر الواجهة
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';

        const trigger = document.createElement('div');
        trigger.className = 'select-trigger';
        const triggerText = document.createElement('span');
        triggerText.textContent = (select.options[select.selectedIndex] && select.options[select.selectedIndex].textContent) || 'اختر';
        trigger.appendChild(triggerText);
        const triggerIcon = document.createElement('i');
        triggerIcon.className = 'fas fa-chevron-down';
        trigger.appendChild(triggerIcon);

        const optionsBox = document.createElement('div');
        optionsBox.className = 'select-options';

        Array.from(select.options).forEach(opt => {
            const o = document.createElement('div');
            o.className = 'select-option';
            o.dataset.value = opt.value;
            o.textContent = opt.textContent;
            if (opt.disabled) o.classList.add('disabled');
            if (opt.selected) o.classList.add('selected');
            o.addEventListener('click', (ev) => {
                ev.stopPropagation();
                // تحديث النص في الـ trigger
                triggerText.textContent = o.textContent;
                // تحديث القيمة في الـ select الأصلي
                select.value = o.dataset.value;
                // علامة مختارة
                optionsBox.querySelectorAll('.select-option').forEach(x => x.classList.remove('selected'));
                o.classList.add('selected');
                // اغلاق القايمة
                wrapper.classList.remove('open');
                // إطلاق حدث change حتى أي كود يعتمد على onchange يعمل (مثال: toggleClientFields)
                select.dispatchEvent(new Event('change', { bubbles: true }));
            });
            optionsBox.appendChild(o);
        });

        // بناء الواجهة وإدخالها قبل الـ select
        wrapper.appendChild(trigger);
        wrapper.appendChild(optionsBox);
        select.parentNode.insertBefore(wrapper, select);

        // أخفى الـ select الأصلي (سيبته في الـ DOM لكي أي كود يقرأه يظل يشتغل)
        select.style.display = 'none';
        select.dataset.enhanced = '1';

        // تصرف عند الضغط على trigger
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            // غلق أي فواصل مفتوحة أخرى
            document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
                if (w !== wrapper) w.classList.remove('open');
            });
            wrapper.classList.toggle('open');
        });
    });

    // إغلاق أي قائمة عند النقر خارجها
    window.addEventListener('click', () => {
        document.querySelectorAll('.custom-select-wrapper.open').forEach(w => w.classList.remove('open'));
    });
}


/**
 * دالة مخصصة لتفعيل كل الأزرار والنماذج.
 * هذا يجعل الكود منظمًا.
 */
function setupEventListeners() {
    // Menu toggle with animation
    document.getElementById('menuToggle').addEventListener('click', function(e) {
        toggleSidebar();
    });

    // Notification button with animation
    document.getElementById('notificationBtn').addEventListener('click', function(e) {
        toggleNotifications();
    });

    // Forms
    document.getElementById('brokerForm').addEventListener('submit', handleSaveBroker);
    document.getElementById('addClientForm').addEventListener('submit', handleAddClient);
    document.getElementById('editClientForm').addEventListener('submit', handleEditClient);
    document.getElementById('profileUpdateForm').addEventListener('submit', handleProfileUpdate);
    document.getElementById('followupForm').addEventListener('submit', handleAddFollowup);
    document.getElementById('viewingForm').addEventListener('submit', handleAddViewing);
    document.getElementById('statusForm').addEventListener('submit', handleChangeStatus);
    document.getElementById('editFollowupForm').addEventListener('submit', handleEditFollowup);
    document.getElementById('namePhoneSearchInput').addEventListener('input', applyFilters);
    document.getElementById('holdForm').addEventListener('submit', handleSetReminderHold);

    // Sidebar navigation
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.dataset.section;
            if (section) {
                switchSection(section);
                if (window.innerWidth < 768) closeSidebar();
            }
        });
    });

    // Other Buttons
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Global click listeners for closing modals, etc.
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('modal')) {
            closeModal(e.target.id);
        }
        const panel = document.getElementById('notificationsPanel');
        const btn = document.getElementById('notificationBtn');
        if (panel && !panel.contains(e.target) && !btn.contains(e.target)) {
            panel.classList.remove('show');
        }
        const sidebar = document.getElementById('sidebar');
        const menuBtn = document.getElementById('menuToggle');
        if (sidebar && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
            closeSidebar();
        }
        // Custom select dropdowns logic
        document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
            if (!w.contains(e.target)) {
                w.classList.remove('open');
            }
        });
    });

    // Animation on page load
    window.addEventListener('load', function() {
        const buttons = document.querySelectorAll('.header-btn, .menu-btn');
        buttons.forEach((button, index) => {
            setTimeout(() => {
                button.style.animation = 'fadeInUp 0.6s ease forwards';
            }, index * 100);
        });
    });
    
    // Custom selects setup
    document.addEventListener('DOMContentLoaded', enhanceNativeSelects);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('show');
    }
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('show');
    // عندما نغلق القائمة، نعود خطوة في سجل التصفح
    // history.back(); // سنقوم بتعطيل هذا السطر حاليًا لتبسيط الأمور
}

        function toggleClientFields() {
            const clientType = document.getElementById('clientType').value;
            const buyerFields = document.getElementById('buyerFields');
            const sellerFields = document.getElementById('sellerFields');

            if (clientType === 'buyer') {
                buyerFields.style.display = 'block';
                sellerFields.style.display = 'none';
            } else if (clientType === 'seller') {
                buyerFields.style.display = 'none';
                sellerFields.style.display = 'block';
            } else {
                buyerFields.style.display = 'none';
                sellerFields.style.display = 'none';
            }
        }

        function toggleEditClientFields() {
            const clientType = document.getElementById('editClientType').value;
            const buyerFields = document.getElementById('editBuyerFields');
            const sellerFields = document.getElementById('editSellerFields');

            if (clientType === 'buyer') {
                buyerFields.style.display = 'block';
                sellerFields.style.display = 'none';
            } else if (clientType === 'seller') {
                buyerFields.style.display = 'none';
                sellerFields.style.display = 'block';
            } else {
                buyerFields.style.display = 'none';
                sellerFields.style.display = 'none';
            }
        }

// ✅ استبدل الدالة بالكامل
function switchSection(section) {
    // تحديث الشريط الجانبي
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.remove('active');
    });
    const activeLink = document.querySelector(`[data-section="${section}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }

    // تحديث المحتوى
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.classList.remove('active');
    });
    document.getElementById(section).classList.add('active');

    currentSection = section;
    
    // تحديث سجل المتصفح
if (!isNavigatingBack) {
    history.pushState({section: section}, '', `#${section}`);
}

    // تحديث البيانات عند التبديل
    if (section === 'dashboard') updateDashboardStats();
    if (section === 'clients') renderClientsTable();
    if (section === 'operations') renderOperationsTable();
   
    // ✅ أضف هذين السطرين
    if (section === 'pending-followups') renderPendingFollowups();
    if (section === 'today-viewings') renderTodayViewings();
}

function updateCurrentDate() {
    const now = new Date();
    const options = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        numberingSystem: 'latn' // هذا السطر يفرض الأرقام الإنجليزية
    };
    // قمنا بتغيير 'en-GB' إلى 'ar-EG' لعرض الشهور والأيام بالعربية
    document.getElementById('currentDate').textContent = now.toLocaleDateString('ar-EG', options);
}

function updateDashboardStats() {
    // 1. تصفية قائمة العملاء لإزالة أي عناصر غير صالحة (null أو undefined)
    const validClients = clients.filter(c => c && c.status);
    
    const totalClients = validClients.length;
    const seriousClients = validClients.filter(c => c.status === 'serious').length;
    
    // 2. حساب المتابعات القادمة بناءً على قائمة العملاء الصالحة
    const pendingFollowups = validClients.reduce((count, client) => {
        return count + (client.followups ? client.followups.filter(f => 
            f.type !== 'viewing' && new Date(`${f.date}T${f.time}`) > new Date()
        ).length : 0);
    }, 0);
    
    // 3. حساب المعاينات القادمة بناءً على قائمة العملاء الصالحة
    const todayViewings = validClients.reduce((count, client) => {
        return count + (client.followups ? client.followups.filter(f =>
            f.type === 'viewing' && new Date(`${f.date}T${f.time}`) > new Date()
        ).length : 0);
    }, 0);

    // 4. تحديث الأرقام في الواجهة
    document.getElementById('totalClients').textContent = totalClients;
    document.getElementById('seriousClients').textContent = seriousClients;
    document.getElementById('pendingFollowups').textContent = pendingFollowups;
    document.getElementById('todayViewings').textContent = todayViewings;

    // 5. تحديث قائمة العملاء المميزين بناءً على القائمة الصالحة
    const featuredClients = validClients.filter(c => c.featured).slice(-5).reverse();
    const container = document.getElementById('recentClientsTable');
    
    if (featuredClients.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-star"></i>
                <div>لا توجد عملاء مميزون</div>
                <div style="font-size: 0.75rem; margin-top: 8px; color: var(--gray-400);">يمكنك تمييز العملاء من صفحة العميل الشخصية</div>
            </div>
        `;
    } else {
        container.innerHTML = featuredClients.map(client => {
            const followups = client.followups || [];
            const upcomingViewings = (client.followups || []).filter(
                f => f.type === 'viewing' && new Date(`${f.date}T${f.time}`) > new Date()
            ).length;

            const upcomingFollowups = (client.followups || []).filter(
                f => f.type !== 'viewing' && new Date(`${f.date}T${f.time}`) > new Date()
            ).length;
            
            const hasUpcomingActivities = upcomingViewings > 0 || upcomingFollowups > 0;
            
            return `
            <div class="mobile-table-item featured" onclick="viewClientProfile(${client.id})">
                ${client.featured ? '<div class="featured-badge"><i class="fas fa-star"></i></div>' : ''}
                <div class="mobile-table-header">
                    <div class="mobile-table-name">${client.name}</div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <div class="mobile-table-type">
                            ${client.type === 'buyer' ? 'طالب' : 'عارض'}
                        </div>
                        <span class="status-badge status-${client.status || 'pending'}" style="font-size: 0.65rem; padding: 2px 6px;">
                            ${getStatusText(client.status || 'pending')}
                        </span>
                    </div>
                </div>
                <div class="mobile-table-details">
                    <div class="mobile-table-detail">
                        <span class="mobile-table-label">الهاتف:</span>
                        <span class="mobile-table-value">${(client.phones || [])[0] || 'لا يوجد'}${client.phones && client.phones.length > 1 ? ` +${client.phones.length - 1}` : ''}</span>
                    </div>
                    ${client.type === 'buyer' && client.buyerData ? `
                        <div class="mobile-table-detail">
                            <span class="mobile-table-label">الميزانية:</span>
                            <span class="mobile-table-value">${client.buyerData.budget || 'غير محدد'}</span>
                        </div>
                        <div class="mobile-table-detail">
                            <span class="mobile-table-label">المنطقة:</span>
                            <span class="mobile-table-value">${client.buyerData.location || 'غير محدد'}</span>
                        </div>
                    ` : ''}
                    ${client.type === 'seller' && client.sellerData ? `
                        <div class="mobile-table-detail">
                            <span class="mobile-table-label">السعر:</span>
                            <span class="mobile-table-value">${client.sellerData.price || 'غير محدد'}</span>
                        </div>
                        <div class="mobile-table-detail">
                            <span class="mobile-table-label">المنطقة:</span>
                            <span class="mobile-table-value">${client.sellerData.location || 'غير محدد'}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="mobile-table-actions" onclick="event.stopPropagation();">
                    <button class="btn btn-info btn-sm" onclick="handleClientCall('${client.id}')" title="اتصال">
                        <i class="fas fa-phone"></i>
                    </button>
                    <button class="btn btn-accent btn-sm" onclick="handleClientWhatsapp('${client.id}')" title="واتساب">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('');
    }
}

async function handleAddClient(e) {
    e.preventDefault();
    const name = document.getElementById('clientName').value.trim();
    const type = document.getElementById('clientType').value;
    const phones = Array.from(document.querySelectorAll('#phoneNumbers input[type="tel"]')).map(input => input.value.trim()).filter(Boolean);
    
    if (!name || !type || phones.length === 0) return showToast('يرجى ملء الحقول المطلوبة (*)', 'error');

    const clientObject = { name, type, phones, notes: document.getElementById('clientNotes').value.trim(), status: 'interested', featured: false };

    if (type === 'buyer') {
clientObject.buyerData = {
    budget: document.getElementById('buyerBudget').value,
    location: document.getElementById('buyerLocation').value,
    area: document.getElementById('buyerArea').value,
    floors: document.getElementById('buyerFloors').value, // ✅ تمت الإضافة هنا
    unitType: document.getElementById('buyerUnitType').value
};
        if (Object.values(clientObject.buyerData).some(val => !val)) return showToast('لعميل "طالب وحدة"، يجب ملء كل الحقول.', 'error');
        clientObject.sellerData = null;
} else {
    clientObject.sellerData = {
        location: document.getElementById('sellerLocation').value,
        price: document.getElementById('sellerPrice').value,
        commission: document.getElementById('sellerCommission').value,
        area: document.getElementById('sellerArea').value,
        floors: document.getElementById('sellerFloors').value,
        rooms: document.getElementById('sellerRooms').value,
        bathrooms: document.getElementById('sellerBathrooms').value,
        kitchens: document.getElementById('sellerKitchens').value,
        elevators: document.getElementById('sellerElevators').value,
        unitType: document.getElementById('sellerUnitType').value,
        licensed: document.getElementById('sellerLicensed').value,
        meters: Array.from(document.querySelectorAll('#sellerFields .checkbox-group input[type="checkbox"]:checked')).map(el => el.value).join(', '),
        details: document.getElementById('sellerDetails').value
    };
    // التحقق من الحقول المطلوبة
    if (!clientObject.sellerData.location || !clientObject.sellerData.price || !clientObject.sellerData.commission || !clientObject.sellerData.area || !clientObject.sellerData.floors || !clientObject.sellerData.rooms || !clientObject.sellerData.bathrooms || !clientObject.sellerData.kitchens || !clientObject.sellerData.elevators || !clientObject.sellerData.unitType || !clientObject.sellerData.licensed) {
        return showToast('يرجى ملء جميع الحقول المطلوبة لعارض الوحدة', 'error');
    }
    clientObject.buyerData = null;
}

const { data, error } = await supabaseClient
        .from('clients')
        .insert([clientObject])
        .select();

    if (error) {
        console.error('Error adding client:', error);
        return showToast('حدث خطأ أثناء إضافة العميل', 'error');
    }
    
    // Check if data was returned successfully before proceeding
    if (data && data.length > 0) {
        clients.unshift(data[0]);
        await saveClientsToLocal(clients);
        addOperation('add_client', `تم إضافة العميل: ${clientObject.name}`);
        showToast('تم إضافة العميل بنجاح', 'success');
        resetForm();
        updateDashboardStats();
        setTimeout(() => { switchSection('clients'); renderClientsTable(); }, 1000);
    } else {
        // Handle case where no data is returned without an error
        console.error('Data insertion failed, but no error object was returned.');
        showToast('فشل إضافة العميل، يرجى المحاولة مرة أخرى', 'error');
    }
}

        function addPhoneInput() {
            const container = document.getElementById('phoneNumbers');
            const addButton = container.parentElement.querySelector('button[onclick="addPhoneInput()"]');
            const div = document.createElement('div');
            div.className = 'phone-input-group';
            div.innerHTML = `
                <input type="tel" class="form-input" placeholder="رقم الهاتف" value="+" oninput="formatPhoneInput(this)">
                <button type="button" class="btn btn-danger btn-sm" onclick="removePhoneInput(this)" style="min-width: 36px; padding: 8px;">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            container.appendChild(div);
        }

        function removePhoneInput(button) {
            const container = document.getElementById('phoneNumbers');
            const phoneGroups = container.querySelectorAll('.phone-input-group');
            if (phoneGroups.length > 1) {
                button.parentElement.remove();
            } else {
                showToast('يجب الاحتفاظ برقم هاتف واحد على الأقل', 'warning');
            }
        }

        function resetForm() {
            document.getElementById('addClientForm').reset();
            const container = document.getElementById('phoneNumbers');
            container.innerHTML = `
                <div class="phone-input-group">
                    <input type="tel" class="form-input" placeholder="رقم الهاتف" required value="+" oninput="formatPhoneInput(this)">
                    <button type="button" class="btn btn-danger btn-sm" onclick="removePhoneInput(this)" style="min-width: 36px; padding: 8px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            // Hide client type fields
            document.getElementById('buyerFields').style.display = 'none';
            document.getElementById('sellerFields').style.display = 'none';
        }

function renderClientsTable() {
    // ✅ الخطوة 1: تصفية أي كائنات عملاء غير صالحة أو فارغة
    let filteredClients = clients.filter(client => client && client.created_at)
                                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (currentSearchFilters.searchTerm) {
        const searchTerm = currentSearchFilters.searchTerm.toLowerCase();
        filteredClients = filteredClients.filter(client =>
            client.name.toLowerCase().includes(searchTerm) ||
            (client.phones && client.phones.some(phone => phone.includes(searchTerm)))
        );
    }

    // الخطوة 2: تطبيق باقي الفلاتر
    if (currentSearchFilters.clientType === 'featured') {
        filteredClients = filteredClients.filter(c => c.featured);
    } else if (currentSearchFilters.clientType !== 'all') {
        filteredClients = filteredClients.filter(c => c.type === currentSearchFilters.clientType);
    }
    if (currentSearchFilters.status !== 'all') {
        filteredClients = filteredClients.filter(c => (c.status || 'pending') === currentSearchFilters.status);
    }
    if (currentSearchFilters.budget) {
        const budgetFilter = currentSearchFilters.budget.replace(/,/g, '').toLowerCase();
        filteredClients = filteredClients.filter(client => {
            if (client.buyerData && client.buyerData.budget) return String(client.buyerData.budget).replace(/,/g, '').toLowerCase().includes(budgetFilter);
            if (client.sellerData && client.sellerData.price) return String(client.sellerData.price).replace(/,/g, '').toLowerCase().includes(budgetFilter);
            return false;
        });
    }
    if (currentSearchFilters.location) {
        const locationFilter = currentSearchFilters.location.toLowerCase();
        filteredClients = filteredClients.filter(client => {
            if (client.buyerData && client.buyerData.location) return client.buyerData.location.toLowerCase().includes(locationFilter);
            if (client.sellerData && client.sellerData.location) return client.sellerData.location.toLowerCase().includes(locationFilter);
            return false;
        });
    }

    // الخطوة 3: عرض قائمة العملاء الرئيسية مع جميع التفاصيل
    const container = document.getElementById('clientsTable');
    if (filteredClients.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-users"></i><div>لا توجد عملاء لعرضهم</div></div>`;
    } else {
        container.innerHTML = filteredClients.map(client => {
            const followups = client.followups || [];
            const upcomingViewings = followups.filter(f =>
                f.type === 'viewing' && new Date(`${f.date}T${f.time}`) > new Date()
            ).length;
            const upcomingFollowups = followups.filter(f =>
                f.type !== 'viewing' && new Date(`${f.date}T${f.time}`) > new Date()
            ).length;
            const hasUpcomingActivities = upcomingViewings > 0 || upcomingFollowups > 0;
            const isSelected = selectedClientIds.has(client.id);

            return `
                <div
                    class="mobile-table-item"
                    data-client-id="${client.id}"
                >
                    ${client.featured ? '<div class="featured-badge"><i class="fas fa-star"></i></div>' : ''}
                    <div class="mobile-table-header">
                        <div class="mobile-table-name">${client.name}</div>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <div class="mobile-table-type">${client.type === 'buyer' ? 'طالب' : 'عارض'}</div>
                            <span class="status-badge status-${client.status || 'pending'}" style="font-size: 0.65rem; padding: 2px 6px;">${getStatusText(client.status || 'pending')}</span>
                        </div>
                    </div>
                    <div class="mobile-table-details">
                        <div class="mobile-table-detail"><span class="mobile-table-label">الهاتف:</span><span class="mobile-table-value">${(client.phones || [])[0] || 'لا يوجد'}${client.phones && client.phones.length > 1 ? ` +${client.phones.length - 1}` : ''}</span></div>
                        ${client.type === 'buyer' && client.buyerData ? `<div class="mobile-table-detail"><span class="mobile-table-label">الميزانية:</span><span class="mobile-table-value">${client.buyerData.budget || 'غير محدد'}</span></div><div class="mobile-table-detail"><span class="mobile-table-label">المنطقة:</span><span class="mobile-table-value">${client.buyerData.location || 'غير محدد'}</span></div>` : ''}
                        ${client.type === 'seller' && client.sellerData ? `<div class="mobile-table-detail"><span class="mobile-table-label">السعر:</span><span class="mobile-table-value">${client.sellerData.price || 'غير محدد'}</span></div><div class="mobile-table-detail"><span class="mobile-table-label">المنطقة:</span><span class="mobile-table-value">${client.sellerData.location || 'غير محدد'}</span></div>` : ''}
                        <div class="mobile-table-detail"><span class="mobile-table-label">تاريخ الإضافة:</span><span class="mobile-table-value">${new Date(client.created_at).toLocaleDateString('ar-EG', {numberingSystem: 'latn'})} - ${new Date(client.created_at).toLocaleTimeString('ar-EG', {hour12: true, numberingSystem: 'latn'})}</span></div>
                        ${hasUpcomingActivities ? `<div class="mobile-table-detail" style="margin-top: 8px;"><div style="display: flex; gap: 8px; font-size: 0.7rem;">${upcomingViewings > 0 ? `<span style="color: var(--info); font-weight: 500;"><i class="fas fa-eye"></i> ${upcomingViewings} معاينة</span>` : ''}${upcomingFollowups > 0 ? `<span style="color: var(--warning); font-weight: 500;"><i class="fas fa-calendar-check"></i> ${upcomingFollowups} متابعة</span>` : ''}</div></div>` : ''}
                    </div>
                    <div class="mobile-table-actions" onclick="event.stopPropagation();">
                        <button class="btn btn-info btn-sm" onclick="handleClientCall('${client.id}')" title="اتصال"><i class="fas fa-phone"></i></button>
                        <button class="btn btn-accent btn-sm" onclick="handleClientWhatsapp('${client.id}')" title="واتساب"><i class="fab fa-whatsapp"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="deleteClient('${client.id}')" title="حذف"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    attachClientCardListeners();
}

        /**
 * [جديدة] - تقوم بتسجيل الخروج الإجباري مع عرض رسالة.
 */
function forceLogout(message) {
    showToast(message, 'warning');
    
    // انتظر قليلاً ليرى المستخدم الرسالة ثم قم بالخروج
    setTimeout(async () => {
        await supabaseClient.auth.signOut();
        localStorage.clear();
        window.location.replace('index.html');
    }, 3000);
}

/**
 * [جديدة] - تستمع لأي تغييرات تحدث على جلسة المستخدم النشطة في قاعدة البيانات.
 */
function listenForSessionChanges() {
    // لا تقم بتشغيل المستمع إذا لم يكن هناك مستخدم مسجل
    if (!currentUser) return;

    const channel = supabaseClient
        .channel(`session-watcher-${currentUser.id}`) // اسم فريد للقناة
        .on(
            'postgres_changes',
            {
                event: '*', // استمع لكل الأحداث (INSERT, UPDATE)
                schema: 'public',
                table: 'active_sessions',
                filter: `user_id=eq.${currentUser.id}` // استمع فقط للتغييرات التي تخص هذا المستخدم
            },
            (payload) => {
                console.log('Change received!', payload);
                
                // جلب معرف الجلسة الجديد من التحديث الذي وصل
                const newRemoteSessionId = payload.new.session_id;
                // جلب معرف الجلسة الحالي المخزن على الجهاز
                const localSessionId = localStorage.getItem('active_session_id');

                // إذا كان المعرف الجديد مختلفًا عن المعرف المحلي، فهذا يعني أن جهازًا آخر قد سجل الدخول
                if (newRemoteSessionId !== localSessionId) {
                    // استدعاء دالة الخروج الإجباري
                    forceLogout('تم تسجيل الدخول من جهاز آخر، سيتم تسجيل خروجك الآن.');
                }
            }
        )
        .subscribe();
}

function attachClientCardListeners() {
    const clientCards = document.querySelectorAll('#clientsTable .mobile-table-item');
    clientCards.forEach(card => {
        const clientId = card.dataset.clientId;
        // ربط الأحداث بالدالة الجديدة
        card.addEventListener('touchstart', (e) => handleTouch(e, clientId));
        card.addEventListener('touchmove', (e) => handleTouch(e, clientId));
        card.addEventListener('touchend', (e) => handleTouch(e, clientId));

        // إضافة أحداث الماوس لضمان العمل على الكمبيوتر
        card.addEventListener('mousedown', (e) => handleTouch(e, clientId));
        card.addEventListener('mouseup', (e) => handleTouch(e, clientId)); // ✅ أضف هذا السطر
    });
}

/**
 * [جديدة] - الدالة الرئيسية والمستقرة للتعامل مع كل أنواع التفاعل.
 */
function handleTouch(event, clientId) {
        // ✅ لو الضغط جاي من أزرار الإجراءات (اتصال، واتساب، حذف) ما تفتحش الكارت
    if (event.target.closest('.mobile-table-actions')) {
        if (event.stopPropagation) event.stopPropagation(); 
        touchStartTime = 0; // نوقف أي تتبّع للمسة
        touchMoved = true;  // نمنع فتح الكارت
        return;             // نخرج من الدالة
    }
    const clientCard = document.querySelector(`[data-client-id='${clientId}']`);

    if (event.type === 'touchstart' || event.type === 'mousedown') {
        touchStartTime = Date.now();
        touchMoved = false;

    } else if (event.type === 'touchmove') {
        touchMoved = true;

    } else if (event.type === 'touchend' || event.type === 'mouseup') { 
        if (touchMoved) return; // إذا كان تمريرًا، لا تفعل شيئًا

        const touchDuration = Date.now() - touchStartTime;

        if (touchDuration > 400) { // ضغطة مطولة
            event.preventDefault(); // منع أي سلوك افتراضي آخر
            isMultiSelectMode = true;
            toggleClientSelection(clientId, clientCard);
        } else { // ضغطة قصيرة
            if (isMultiSelectMode) {
                event.preventDefault();
                toggleClientSelection(clientId, clientCard);
            } else {
                viewClientProfile(clientId); // السلوك الافتراضي
            }
        }
    }
}

/**
 * [جديدة] - تقوم بتحديد أو إلغاء تحديد العميل وتحديث الواجهة.
 */
function toggleClientSelection(clientId, element) {
    if (selectedClientIds.has(Number(clientId))) {
        selectedClientIds.delete(Number(clientId));
        element.classList.remove('selected');
    } else {
        selectedClientIds.add(Number(clientId));
        element.classList.add('selected');
    }

    if (selectedClientIds.size === 0) {
        exitMultiSelectMode();
    } else {
        updateMultiSelectUI();
    }
}

/**
 * [جديدة] - تحديث واجهة وضع التحديد (إظهار الزر وتحديث العدد).
 */
function updateMultiSelectUI() {
    const bar = document.getElementById('multiSelectBar');
    const count = document.getElementById('multiSelectCount');

    if (selectedClientIds.size > 0 && isMultiSelectMode) {
        count.textContent = `${selectedClientIds.size} تم تحديده`;
        bar.classList.add('show');
    } else {
        bar.classList.remove('show');
    }
}

/**
 * [جديدة] - الخروج من وضع التحديد المتعدد.
 */
function exitMultiSelectMode() {
    isMultiSelectMode = false;
    selectedClientIds.clear();
    document.querySelectorAll('.mobile-table-item.selected').forEach(el => el.classList.remove('selected'));
    updateMultiSelectUI();
}

/**
 * [جديدة] - تقوم بتجميع بيانات العملاء المحددين ومشاركتها.
 */
async function handleBulkShare() {
    if (selectedClientIds.size === 0) return;

    let combinedText = [];
    const separator = "\n— — — — —\n"; // الخط الفاصل

    selectedClientIds.forEach(id => {
        const client = clients.find(c => c.id === id);
        if (client) {
            let clientText = '';
            if (client.type === 'buyer') {
                clientText = generateBuyerShareText(client);
            } else if (client.type === 'seller') {
                clientText = generateSellerShareText(client);
            }
            if(clientText) combinedText.push(clientText);
        }
    });

    if (combinedText.length > 0) {
        await shareOrCopyText(combinedText.join(separator));
    } else {
        showToast('لا توجد بيانات كافية للمشاركة', 'warning');
    }

    // الخروج من وضع التحديد بعد المشاركة
    exitMultiSelectMode();
}

function renderFeaturedClients(limit = 5) {
    const container = document.getElementById('recentClientsTable');
    const featuredClients = clients.filter(c => c.featured).slice(-limit).reverse();

    if (featuredClients.length === 0) {
        container.innerHTML = `
        attachClientCardListeners(); // استدعاء الدالة الجديدة لربط الأحداث
            <div class="empty-state">
                <i class="fas fa-star"></i>
                <div>لا توجد عملاء مميزون</div>
                <div style="font-size: 0.75rem; margin-top: 8px; color: var(--gray-400);">يمكنك تمييز العملاء من صفحة العميل الشخصية</div>
            </div>
        `;
        return;
    }

    container.innerHTML = featuredClients.map(client => {
        const followups = client.followups || [];
// 1. حساب المعاينات القادمة فقط
const upcomingViewings = (client.followups || []).filter(
    f => f.type === 'viewing' && new Date(`${f.date}T${f.time}`) > new Date()
).length;

// 2. حساب المتابعات الأخرى القادمة (بشكل منفصل)
const upcomingFollowups = (client.followups || []).filter(
    f => f.type !== 'viewing' && new Date(`${f.date}T${f.time}`) > new Date()
).length;
        const hasUpcomingActivities = upcomingViewings > 0 || upcomingFollowups > 0;

        return `
        <div class="mobile-table-item ${client.featured ? 'featured' : ''}" onclick="viewClientProfile(${client.id})">
            ${client.featured ? '<div class="featured-badge"><i class="fas fa-star"></i></div>' : ''}
            <div class="mobile-table-header">
                <div class="mobile-table-name">${client.name}</div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <div class="mobile-table-type">${client.type === 'buyer' ? 'طالب' : 'عارض'}</div>
                    <span class="status-badge status-${client.status || 'pending'}" style="font-size: 0.65rem; padding: 2px 6px;">${getStatusText(client.status || 'pending')}</span>
                </div>
            </div>

            <div class="mobile-table-details">
                <div class="mobile-table-detail"><span class="mobile-table-label">الهاتف:</span><span class="mobile-table-value">${(client.phones || [])[0] || 'لا يوجد'}${client.phones && client.phones.length > 1 ? ` +${client.phones.length - 1}` : ''}</span></div>
                ${client.type === 'buyer' && client.buyerData ? `<div class="mobile-table-detail"><span class="mobile-table-label">الميزانية:</span><span class="mobile-table-value">${client.buyerData.budget || 'غير محدد'}</span></div><div class="mobile-table-detail"><span class="mobile-table-label">المنطقة:</span><span class="mobile-table-value">${client.buyerData.location || 'غير محدد'}</span></div>` : ''}
                ${client.type === 'seller' && client.sellerData ? `<div class="mobile-table-detail"><span class="mobile-table-label">السعر:</span><span class="mobile-table-value">${client.sellerData.price || 'غير محدد'}</span></div><div class="mobile-table-detail"><span class="mobile-table-label">المنطقة:</span><span class="mobile-table-value">${client.sellerData.location || 'غير محدد'}</span></div>` : ''}
                <div class="mobile-table-detail"><span class="mobile-table-label">تاريخ الإضافة:</span><span class="mobile-table-value">${client.created_at ? (new Date(client.created_at).toLocaleDateString('ar-EG', {numberingSystem:'latn'}) + ' - ' + new Date(client.created_at).toLocaleTimeString('ar-EG', {hour12:false,numberingSystem:'latn'})) : 'غير معروف'}</span></div>
                ${hasUpcomingActivities ? `<div class="mobile-table-detail" style="margin-top: 8px;"><div style="display: flex; gap: 8px; font-size: 0.7rem;">${upcomingViewings > 0 ? `<span style="color: var(--info); font-weight: 500;"><i class="fas fa-eye"></i> ${upcomingViewings} معاينة</span>` : ''}${upcomingFollowups > 0 ? `<span style="color: var(--warning); font-weight: 500;"><i class="fas fa-calendar-check"></i> ${upcomingFollowups} متابعة</span>` : ''}</div></div>` : ''}
            </div>

            <div class="mobile-table-actions" onclick="event.stopPropagation();">
                <button class="btn btn-primary btn-sm" onclick="editClient('${client.id}')" title="تعديل"><i class="fas fa-edit"></i></button>
                <button class="btn btn-accent btn-sm" onclick="addFollowup('${client.id}')" title="متابعة"><i class="fas fa-plus"></i></button>
                <button class="btn btn-info btn-sm" onclick="handleClientCall('${client.id}')" title="اتصال"><i class="fas fa-phone"></i></button>
                <button class="btn btn-accent btn-sm" onclick="handleClientWhatsapp('${client.id}')" title="واتساب"><i class="fab fa-whatsapp"></i></button>
                <button class="btn btn-danger btn-sm" onclick="deleteClient('${client.id}')" title="حذف"><i class="fas fa-trash"></i></button>
            </div>
        </div>
        `;
    }).join('');
}


        function renderOperationsTable() {
            const container = document.getElementById('operationsTable');
            
            if (operations.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-clipboard-list"></i>
                        <div>لا توجد عمليات لعرضها</div>
                    </div>
                `;
                return;
            }

            const sortedOperations = operations.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            container.innerHTML = sortedOperations.map(operation => `
                <div class="mobile-table-item">
                    <div class="mobile-table-header">
                        <div class="mobile-table-name">${getOperationTypeText(operation.type)}</div>
                        <div class="mobile-table-type" style="background: var(--info); font-size: 0.65rem;">
                            ${new Date(operation.timestamp).toLocaleDateString('en-GB')}
                        </div>
                    </div>
                    <div class="mobile-table-details">
                        <div class="mobile-table-detail">
                            <span class="mobile-table-label">التفاصيل:</span>
                            <span class="mobile-table-value">${operation.details}</span>
                        </div>
                        <div class="mobile-table-detail">
                            <span class="mobile-table-label">الوقت:</span>
                            <span class="mobile-table-value">${new Date(operation.timestamp).toLocaleTimeString('ar-EG', {hour12: true, numberingSystem: 'latn'})}</span>
                        </div>
                    </div>
                    <div class="mobile-table-actions">
                        <button class="btn btn-danger btn-sm" onclick="deleteOperation('${operation.id}')" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        }

// الدالة الأولى: لفتح نافذة التعديل وملء البيانات
function editClient(clientId) {
    const client = clients.find(c => c.id == clientId); // Use == for safety
    if (!client) return showToast('لم يتم العثور على العميل', 'error');

    // Populate the form fields
    document.getElementById('editClientId').value = client.id;
    document.getElementById('editClientName').value = client.name;
    document.getElementById('editClientType').value = client.type;
    document.getElementById('editClientStatus').value = client.status || 'interested';
    document.getElementById('editClientNotes').value = client.notes || '';

    // Populate phone numbers
    const phoneContainer = document.getElementById('editPhoneNumbers');
    phoneContainer.innerHTML = (client.phones || []).map(phone => `
        <div class="phone-input-group">
            <input type="tel" class="form-input" value="${phone}" oninput="formatPhoneInput(this)">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeEditPhoneInput(this)">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('') + `
        <button type="button" class="btn btn-secondary btn-sm" onclick="addEditPhoneInput()" style="margin-top: 12px;">
            <i class="fas fa-plus"></i> إضافة رقم آخر
        </button>
    `;

    // Populate buyer/seller data
    if (client.type === 'buyer') {
const buyerData = client.buyerData || {};
document.getElementById('editBuyerBudget').value = buyerData.budget || '';
document.getElementById('editBuyerLocation').value = buyerData.location || '';
document.getElementById('editBuyerArea').value = buyerData.area || '';
document.getElementById('editBuyerFloors').value = buyerData.floors || ''; // ✅ تمت الإضافة هنا
document.getElementById('editBuyerUnitType').value = buyerData.unitType || '';
    }
if (client.type === 'seller') {
    const sellerData = client.sellerData || {};
    document.getElementById('editSellerLocation').value = sellerData.location || '';
    document.getElementById('editSellerPrice').value = sellerData.price || '';
    document.getElementById('editSellerCommission').value = sellerData.commission || '';
    document.getElementById('editSellerArea').value = sellerData.area || '';
    document.getElementById('editSellerFloors').value = sellerData.floors || '';
    document.getElementById('editSellerRooms').value = sellerData.rooms || '';
    document.getElementById('editSellerBathrooms').value = sellerData.bathrooms || '';
    document.getElementById('editSellerKitchens').value = sellerData.kitchens || '';
    document.getElementById('editSellerElevators').value = sellerData.elevators || '';
    document.getElementById('editSellerUnitType').value = sellerData.unitType || '';
    document.getElementById('editSellerLicensed').value = sellerData.licensed || '';
    document.getElementById('editSellerDetails').value = sellerData.details || '';

    // تحديد مربعات الاختيار بناءً على البيانات المخزنة
    const meters = sellerData.meters ? sellerData.meters.split(', ').map(m => m.trim()) : [];
    document.getElementById('editSellerMeterElectricity').checked = meters.includes('كهرباء');
    document.getElementById('editSellerMeterWater').checked = meters.includes('مياه');
    document.getElementById('editSellerMeterGas').checked = meters.includes('غاز');
}

    toggleEditClientFields();
    showModal('editClientModal');
}

async function handleEditClient(e) {
    e.preventDefault();
    const clientId = document.getElementById('editClientId').value;
    
    const updateObject = {
        name: document.getElementById('editClientName').value.trim(),
        type: document.getElementById('editClientType').value,
        notes: document.getElementById('editClientNotes').value.trim(),
        phones: Array.from(document.querySelectorAll('#editPhoneNumbers input[type="tel"]')).map(input => input.value.trim()).filter(Boolean),
        status: document.getElementById('editClientStatus').value
    };

    if (updateObject.type === 'buyer') {
updateObject.buyerData = {
    budget: document.getElementById('editBuyerBudget').value,
    location: document.getElementById('editBuyerLocation').value,
    area: document.getElementById('editBuyerArea').value,
    floors: document.getElementById('editBuyerFloors').value, // ✅ تمت الإضافة هنا
    unitType: document.getElementById('editBuyerUnitType').value
};
        updateObject.sellerData = null;
} else {
    updateObject.sellerData = {
        location: document.getElementById('editSellerLocation').value,
        price: document.getElementById('editSellerPrice').value,
        commission: document.getElementById('editSellerCommission').value,
        area: document.getElementById('editSellerArea').value,
        floors: document.getElementById('editSellerFloors').value,
        rooms: document.getElementById('editSellerRooms').value,
        bathrooms: document.getElementById('editSellerBathrooms').value,
        kitchens: document.getElementById('editSellerKitchens').value,
        elevators: document.getElementById('editSellerElevators').value,
        unitType: document.getElementById('editSellerUnitType').value,
        licensed: document.getElementById('editSellerLicensed').value,
        meters: Array.from(document.querySelectorAll('#editSellerFields .checkbox-group input[type="checkbox"]:checked')).map(el => el.value).join(', '),
        details: document.getElementById('editSellerDetails').value
    };
    updateObject.buyerData = null;
}

    const { data, error } = await supabaseClient
        .from('clients')
        .update(updateObject)
        .eq('id', clientId)
        .select();

    if (error) {
        console.error('Error updating client:', error);
        showToast('حدث خطأ أثناء تعديل العميل', 'error');
    } else {
        const clientIndex = clients.findIndex(c => c.id == clientId);
        if (clientIndex !== -1) clients[clientIndex] = data[0];
        clients[clientIndex] = data[0];
        await saveClientsToLocal(clients);
        addOperation('edit_client', `تم تعديل بيانات العميل: ${updateObject.name}`);
        showToast('تم تعديل العميل بنجاح', 'success');
        closeModal('editClientModal');
        renderClientsTable();
        // Refresh profile if we're viewing it
        if (currentSection === 'client-profile' && currentClientId == clientId) {
            viewClientProfile(clientId);
        }
    }
}

function addEditPhoneInput() {
    const container = document.getElementById('editPhoneNumbers');
    const button = container.querySelector('button[onclick="addEditPhoneInput()"]');
    const div = document.createElement('div');
    div.className = 'phone-input-group';
    div.innerHTML = `
        <input type="tel" class="form-input" placeholder="رقم هاتف إضافي" value="+20" oninput="formatPhoneInput(this)">
        <button type="button" class="btn btn-danger btn-sm" onclick="removeEditPhoneInput(this)">
            <i class="fas fa-trash"></i>
        </button>
    `;
    // Insert the new input group before the "Add" button
    container.insertBefore(div, button);
}

function removeEditPhoneInput(button) {
    const container = document.getElementById('editPhoneNumbers');
    const phoneGroups = container.querySelectorAll('.phone-input-group');
    if (phoneGroups.length > 1) {
        button.parentElement.remove();
    } else {
        showToast('يجب الاحتفاظ برقم هاتف واحد على الأقل', 'warning');
    }
}

function deleteClient(clientId) {
    const title = 'تأكيد الحذف';
    const message = 'هل أنت متأكد من رغبتك في حذف هذا العميل؟ سيتم فقدان جميع بياناته بشكل نهائي.';
    const confirmText = 'نعم، قم بالحذف';

    showConfirmModal(title, message, confirmText, async () => {
        // الخطوة 1: الحذف من قاعدة البيانات
        const { error } = await supabaseClient
            .from('clients')
            .delete()
            .eq('id', clientId);

        if (error) {
            console.error('Error deleting client:', error);
            showToast('حدث خطأ أثناء حذف العميل', 'error');
        } else {
            // الخطوة 2 (الأهم): إزالة العميل من القائمة المحلية في الكود
            clients = clients.filter(c => c.id != clientId);
            await saveClientsToLocal(clients);
            addOperation('delete_client', `تم حذف عميل (ID: ${clientId})`);
            showToast('تم حذف العميل بنجاح', 'success');
            
            // الخطوة 3: إعادة رسم جدول العملاء ليختفي العميل من الشاشة
            renderClientsTable();
            
            // تحديث الإحصائيات في الصفحة الرئيسية
            updateDashboardStats();

            // إذا كان الحذف من صفحة البروفايل، ارجع لصفحة العملاء
            if (currentSection === 'client-profile') {
                switchSection('clients');
            }
        }
    });
}

        function addFollowup(clientId) {
            document.getElementById('followupClientId').value = clientId;
            
            // Set default date to today
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('followupDate').value = today;
            
            // Set default time to current time + 1 hour
            const now = new Date();
            now.setHours(now.getHours() + 1);
            const timeString = now.toTimeString().slice(0, 5);
            document.getElementById('followupTime').value = timeString;
            
            showModal('followupModal');
        }

// ✅ استبدل الدالة القديمة بالكامل بهذه النسخة الجديدة
async function requestBatteryPermission() {
    // التأكد من أننا على منصة تدعم الـ plugin
    if (!window.Capacitor || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
        return showToast('هذه الميزة متاحة فقط على تطبيق الأندرويد.', 'info');
    }

    try {
        // استدعاء الـ plugin الجديد بالاسم الصحيح
        const { BatteryOptimization } = Capacitor.Plugins;

        // أولاً، تحقق مما إذا كان التطبيق لديه الصلاحية بالفعل
        const result = await BatteryOptimization.isBatteryOptimizationEnabled();

        if (!result.enabled) {
            showToast('التطبيق لديه هذه الصلاحية بالفعل.', 'success');
        } else {
            // إذا لم تكن لديه، اطلبها من المستخدم
            await BatteryOptimization.requestBatteryOptimizationPermission();
            showToast('تم فتح إعدادات البطارية، يرجى تعطيل التحسين لتطبيقنا.', 'info');
        }
    } catch (e) {
        console.error('Error with battery optimization plugin', e);
        showToast('حدث خطأ أثناء طلب الصلاحية.', 'error');
    }
}

// ✅ استبدل هذه الدالة بالكامل
async function handleAddFollowup(e) {
    e.preventDefault();
    const clientId = document.getElementById('followupClientId').value;
    const clientIndex = clients.findIndex(c => c.id == clientId);
    if (clientIndex === -1) return;

    const client = clients[clientIndex];

    const newFollowup = {
        id: generateId(),
        type: document.getElementById('followupType').value,
        date: document.getElementById('followupDate').value,
        time: document.getElementById('followupTime').value,
        notes: document.getElementById('followupNotes').value.trim(),
        reminder: document.getElementById('followupReminder').checked,
        createdAt: new Date().toISOString(),
        notified: false
    };

    const updatedFollowups = [...(client.followups || []), newFollowup];
    const { data: clientData, error: clientError } = await supabaseClient
        .from('clients')
        .update({ followups: updatedFollowups })
        .eq('id', clientId)
        .select();

    if (clientError) {
        showToast('حدث خطأ أثناء إضافة المتابعة', 'error');
        return;
    }
    
    clients[clientIndex] = clientData[0];
    await saveClientsToLocal(clients);
    const instantNotification = {
        title: `تمت إضافة متابعة جديدة`,
        message: `تم جدولة ${getFollowupTypeText(newFollowup.type)} للعميل: ${client.name}`,
        type: 'system',
        client_id: client.id,
        followup_id: newFollowup.id,
        created_at: new Date().toISOString(),
        read: false // <-- تم التعديل هنا ليظهر في شارة الإشعارات
    };

        if (newFollowup.reminder && window.Capacitor && Capacitor.isNativePlatform()) {
        const followupDateTime = new Date(`${newFollowup.date}T${newFollowup.time}`);
        if (followupDateTime > new Date()) {
            const { LocalNotifications } = Capacitor.Plugins;
            const notificationId = parseInt(newFollowup.id.replace(/[^0-9]/g, '').slice(-9));

            await LocalNotifications.schedule({
                notifications: [{
                    title: `تذكير: ${getFollowupTypeText(newFollowup.type)}`,
                    body: `لديك موعد قادم مع العميل: ${client.name}`,
                    id: notificationId,
                    schedule: { at: followupDateTime },
                    channelId: 'crm_reminders_channel',
                    extra: { clientId: client.id }
                }]
            });
        }
    }

    // انتظر رد قاعدة البيانات واحصل على الإشعار الكامل مع الـ ID
    const { data: newNotificationData, error: notificationError } = await supabaseClient
        .from('notifications')
        .insert([instantNotification])
        .select()
        .single();

    if (!notificationError && newNotificationData) {
        // أضف الإشعار الكامل والصحيح للقائمة المحلية
        notifications.unshift(newNotificationData);
        loadNotifications(); // حدث الواجهة الآن
        
                if (window.Capacitor && Capacitor.isNativePlatform()) {
            const { LocalNotifications } = Capacitor.Plugins;
            await LocalNotifications.schedule({
                notifications: [{
                    title: newNotificationData.title,
                    body: newNotificationData.message,
                    id: newNotificationData.id,
                    schedule: { at: new Date(Date.now() + 1000) }, // إظهاره الآن
                    channelId: 'crm_reminders_channel'
                }]
            });
        }
    }

    addOperation('add_followup', `تم إضافة متابعة للعميل: ${client.name}`);
    showToast('تم إضافة المتابعة بنجاح.', 'success');
    closeModal('followupModal');
    // أضف هذا السطر
document.getElementById('followupForm').reset();

// ✅ ابدأ بإضافة الأسطر الجديدة من هنا
updateDashboardStats();    // تحديث الأرقام في الإحصائيات
renderPendingFollowups();  // تحديث قائمة المتابعات القادمة
renderTodayViewings();     // تحديث قائمة معاينات اليوم
// ✅ نهاية الأسطر الجديدة

    if (currentClientId == clientId) viewClientProfile(clientId);
        checkDueNotifications(); // ✅ أضف هذا السطر هنا

}

// ✅ هذه هي النسخة الوحيدة التي يجب أن تكون موجودة
async function handleAddViewing(e) {
    e.preventDefault();
    const clientId = document.getElementById('viewingClientId').value;
    const clientIndex = clients.findIndex(c => c.id == clientId);
    if (clientIndex === -1) return;

    const client = clients[clientIndex];

    // 1. إنشاء كائن المعاينة
    const newViewing = {
        id: generateId(),
        type: 'viewing',
        date: document.getElementById('viewingDate').value,
        time: document.getElementById('viewingTime').value,
        location: document.getElementById('viewingLocation').value.trim(),
        notes: document.getElementById('viewingNotes').value.trim(),
        reminder: document.getElementById('viewingReminder').checked,
        createdAt: new Date().toISOString(),
        notified: false
    };

    // 2. تحديث بيانات العميل في Supabase
    const updatedFollowups = [...(client.followups || []), newViewing];
    const { data, error } = await supabaseClient
        .from('clients')
        .update({ followups: updatedFollowups })
        .eq('id', clientId)
        .select()
        .single();

    if (error) {
        showToast('حدث خطأ أثناء حجز المعاينة', 'error');
        return; // توقف هنا في حالة الخطأ
    }
    
    // 3. تحديث البيانات المحلية والكاش
    clients[clientIndex] = data;
    await saveClientsToLocal(clients); // ⭐ مهم: تحديث التخزين المحلي

    // 4. إنشاء إشعار فوري للهيدر والموبايل
    const instantNotification = {
        title: `تم حجز معاينة جديدة`,
        message: `تم حجز معاينة للعميل: ${client.name} في ${newViewing.location}`,
        type: 'system',
        client_id: client.id,
        followup_id: newViewing.id,
        created_at: new Date().toISOString(),
        read: false
    };

    const { data: newNotificationData, error: notificationError } = await supabaseClient
        .from('notifications')
        .insert([instantNotification])
        .select()
        .single();

    if (!notificationError && newNotificationData) {
        notifications.unshift(newNotificationData);
        loadNotifications(); // تحديث الهيدر

        // إرسال إشعار للموبايل
        if (window.Capacitor && Capacitor.isNativePlatform()) {
            const { LocalNotifications } = Capacitor.Plugins;
            await LocalNotifications.schedule({
                notifications: [{
                    title: newNotificationData.title,
                    body: newNotificationData.message,
                    id: newNotificationData.id,
                    schedule: { at: new Date(Date.now() + 500) },
                    channelId: 'crm_reminders_channel'
                }]
            });
        }
    }

    // 5. إظهار رسالة النجاح وإغلاق النافذة
    addOperation('add_viewing', `تم حجز معاينة للعميل: ${client.name}`);
    showToast('تم حجز المعاينة بنجاح.', 'success');
    closeModal('viewingModal');
    // أضف هذا السطر
document.getElementById('viewingForm').reset();

// ✅ ابدأ بإضافة الأسطر الجديدة من هنا
updateDashboardStats();    // تحديث الأرقام في الإحصائيات
renderPendingFollowups();  // تحديث قائمة المتابعات القادمة
renderTodayViewings();     // تحديث قائمة معاينات اليوم
// ✅ نهاية الأسطر الجديدة

    if (currentClientId == clientId) {
        viewClientProfile(clientId);
    }
}

// ضع هذا الكود الجديد مكان الذي حذفته
function handleClientCall(clientId) {
    const client = clients.find(c => c.id == clientId);
    if (!client || !client.phones || client.phones.length === 0) {
        return showToast('لا يوجد رقم هاتف لهذا العميل', 'error');
    }

    // إذا كان هناك أكثر من رقم، أظهر قائمة الاختيار
    if (client.phones.length > 1) {
        showPhoneSelectionModal(client, 'call');
    } else {
        // إذا كان هناك رقم واحد فقط، قم بالاتصال مباشرة
        callClient(client.phones[0]);
    }
}

// ضع هذا الكود الجديد مكان الذي حذفته
function handleClientWhatsapp(clientId) {
    const client = clients.find(c => c.id == clientId);
    if (!client || !client.phones || client.phones.length === 0) {
        return showToast('لا يوجد رقم هاتف لهذا العميل', 'error');
    }

    // إذا كان هناك أكثر من رقم، أظهر قائمة الاختيار
    if (client.phones.length > 1) {
        showPhoneSelectionModal(client, 'whatsapp');
    } else {
        // إذا كان هناك رقم واحد فقط، أرسل مباشرة
        whatsappClient(client.phones[0]);
    }
}

// انسخ وألصق هاتين الدالتين الجديدتين
/**
 * [جديدة] - تعرض القائمة العائمة لاختيار رقم الهاتف.
 * @param {object} client - كائن العميل الكامل.
 * @param {string} action - نوع الإجراء ('call' أو 'whatsapp').
 */
function showPhoneSelectionModal(client, action) {
    // تحديد النص والأيقونة بناءً على الإجراء المطلوب
    const actionText = action === 'call' ? 'الاتصال' : 'إرسال رسالة واتساب';
    const actionIcon = action === 'call' ? 'fa-phone' : 'fab fa-whatsapp';
    
    // إنشاء عنصر الـ modal ديناميكيًا
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.style.zIndex = '2001'; 

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h3 class="modal-title">اختيار رقم الهاتف</h3>
                <button class="modal-close" onclick="this.closest('.modal').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div style="padding: 0 24px 24px;">
                <p style="color: var(--gray-600); margin-bottom: 20px; font-size: 0.9rem;">
                    اختر الرقم المراد ${actionText} عليه للعميل <strong>${client.name}</strong>:
                </p>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${client.phones.map((phone, index) => `
                        <button class="btn btn-secondary" onclick="executePhoneAction('${phone}', '${action}'); this.closest('.modal').remove();" 
                                style="justify-content: flex-start; text-align: right; padding: 16px;">
                            <i class="fas ${actionIcon}" style="margin-left: 12px; min-width: 16px;"></i>
                            <span>${phone}</span>
                            ${index === 0 ? '<span style="margin-right: auto; font-size: 0.75rem; color: var(--gray-500);">(الرئيسي)</span>' : ''}
                        </button>
                    `).join('')}
                </div>
                <div style="margin-top: 20px; text-align: center;">
                    <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal').remove()">
                        إلغاء
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

/**
 * [جديدة] - تنفذ الإجراء النهائي بعد اختيار الرقم.
 * @param {string} phone - رقم الهاتف المختار.
 * @param {string} action - نوع الإجراء ('call' أو 'whatsapp').
 */
function executePhoneAction(phone, action) {
    if (action === 'call') {
        callClient(phone);
    } else if (action === 'whatsapp') {
        whatsappClient(phone);
    }
}

        function showPhoneSelectionModal(client, action) {
            const actionText = action === 'call' ? 'الاتصال' : 'إرسال رسالة واتساب';
            const actionIcon = action === 'call' ? 'fa-phone' : 'fab fa-whatsapp';
            
            const modal = document.createElement('div');
            modal.className = 'modal show';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h3 class="modal-title">اختيار رقم الهاتف</h3>
                        <button class="modal-close" onclick="this.closest('.modal').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div style="padding: 0 24px 24px;">
                        <p style="color: var(--gray-600); margin-bottom: 20px; font-size: 0.9rem;">
                            اختر الرقم المراد ${actionText} عليه للعميل <strong>${client.name}</strong>:
                        </p>
                        <div style="display: flex; flex-direction: column; gap: 12px;">
                            ${client.phones.map((phone, index) => `
                                <button class="btn btn-secondary" onclick="executePhoneAction('${phone}', '${action}'); this.closest('.modal').remove();" 
                                        style="justify-content: flex-start; text-align: right; padding: 16px;">
                                    <i class="fas ${actionIcon}" style="margin-left: 12px;"></i>
                                    <span>${phone}</span>
                                    ${index === 0 ? '<span style="margin-right: auto; font-size: 0.75rem; color: var(--gray-500);">(الرئيسي)</span>' : ''}
                                </button>
                            `).join('')}
                        </div>
                        <div style="margin-top: 20px; text-align: center;">
                            <button class="btn btn-secondary btn-sm" onclick="this.closest('.modal').remove()">
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
        }

        function executePhoneAction(phone, action) {
            if (action === 'call') {
                callClient(phone);
            } else if (action === 'whatsapp') {
                whatsappClient(phone);
            }
        }

        function callClient(phone) {
            if (phone) {
                window.location.href = `tel:${phone}`;
                addOperation('call_client', `تم الاتصال بالرقم: ${phone}`);
            }
        }

        function whatsappClient(phone) {
            if (phone) {
                const cleanPhone = phone.replace(/\D/g, '');
                window.open(`https://wa.me/${cleanPhone}`, '_blank');
                addOperation('whatsapp_client', `تم إرسال رسالة واتساب للرقم: ${phone}`);
            }
        }

async function addOperation(type, details) {
    const operationObject = {
        type: type,
        details: details,
        timestamp: new Date().toISOString()
    };

    const { data, error } = await supabaseClient // <--- تم التصحيح هنا
        .from('operations')
        .insert([operationObject])
        .select();
    
    if (error) {
        console.error('Error adding operation:', error);
    } else if (data) {
        operations.push(data[0]);
    }
}

function deleteOperation(operationId) {
    showConfirmModal('تأكيد حذف العملية', 'هل أنت متأكد من حذف هذه العملية؟', 'نعم، قم بالحذف', async () => {
        const { error } = await supabaseClient
            .from('operations')
            .delete()
            .eq('id', operationId);

        if (error) {
            console.error('Error deleting operation:', error);
            showToast('حدث خطأ أثناء حذف العملية', 'error');
        } else {
            operations = operations.filter(op => op.id != operationId);
            showToast('تم حذف العملية بنجاح', 'success');
            renderOperationsTable();
            updateDataStats();
        }
    });
}

function clearAllOperations() {
    const title = 'تأكيد مسح السجل';
    const message = 'هل أنت متأكد من حذف جميع العمليات؟ هذا الإجراء لا يمكن التراجع عنه.';
    const confirmText = 'نعم، امسح الكل';

    showConfirmModal(title, message, confirmText, async () => {
        const { error } = await supabaseClient
            .from('operations')
            .delete()
            .gt('id', 0); // Delete all rows

        if (error) {
            console.error('Error clearing operations:', error);
            showToast('حدث خطأ أثناء مسح السجل', 'error');
        } else {
            operations = []; // Clear local array
            showToast('تم حذف جميع العمليات بنجاح', 'success');
            renderOperationsTable();
            updateDataStats();
        }
    });
}

        function exportData() {
            const data = {
                clients: clients.map(client => ({
                    ...client,
                    followups: client.followups || [],
                    exportedAt: new Date().toISOString()
                })),
                operations,
                notifications,
                exportDate: new Date().toISOString(),
                version: '2.0',
                appName: 'CRM-NRE'
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `CRM-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            addOperation('export_data', 'تم تصدير البيانات بنجاح');
            showToast('تم تصدير البيانات بنجاح', 'success');
        }

// ✅ استبدل دالة importData بالكامل بهذه النسخة الصحيحة
function importData(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const title = '<i class="fas fa-upload"></i> تأكيد استيراد البيانات';
        const message = 'هل أنت متأكد من استيراد البيانات؟ سيتم استبدال جميع بياناتك الحالية بالبيانات الموجودة في الملف.';
        const confirmText = 'نعم، قم بالاستيراد';

        try {
            const data = JSON.parse(e.target.result);
            
            if (!data.clients || !Array.isArray(data.clients)) {
                throw new Error('ملف غير صالح - لا يحتوي على بيانات العملاء');
            }

            // لاحظ إضافة كلمة "async" هنا لحل مشكلة اللون الأحمر
            showConfirmModal(title, message, confirmText, async () => { 
                clients = data.clients.map(client => ({
                    ...client,
                    followups: client.followups || []
                }));
                
                operations = data.operations || [];
                notifications = data.notifications || [];

                // هنا قمنا بحذف استدعاء saveData() ووضعنا الكود الصحيح
                await saveClientsToLocal(clients); 
                
                addOperation('import_data', `تم استيراد البيانات من ملف ${file.name}`);
                showToast('تم استيراد البيانات بنجاح', 'success');
                
                // إعادة تحميل الواجهة بالكامل لعرض البيانات الجديدة
                updateDashboardStats();
                renderClientsTable();
                renderOperationsTable();
                loadNotifications();
                updateDataStats();
            });
            
        } catch (error) {
            console.error('Import error:', error);
            showToast('خطأ في قراءة الملف. تأكد من أنه ملف JSON صالح.', 'error');
        }
    };
    
    reader.readAsText(file);
    input.value = ''; // Reset input
}

        // ✅ استبدل دالة عرض الإشعارات بالكامل بهذه النسخة
// ✅ استبدل الدالة بالكامل بهذه النسخة
function loadNotifications() {
    const container = document.getElementById('notificationsList');
    const badge = document.getElementById('notificationBadge');
    
    const sortedNotifications = notifications.sort((a, b) => new Date(b.created_at || b.time) - new Date(a.created_at || a.time));
    const unreadNotifications = sortedNotifications.filter(n => !n.read);

    if (unreadNotifications.length > 0) {
        badge.textContent = unreadNotifications.length;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }

    const recentNotifications = sortedNotifications.slice(0, 15);

    if (recentNotifications.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding: 30px 20px;"><i class="fas fa-bell-slash"></i><div>لا توجد أي إشعارات</div></div>`;
        return;
    }

    container.innerHTML = recentNotifications.map(notification => `
        <div class="notification-item" style="position: relative; padding-left: 45px; ${notification.read ? 'opacity: 0.6;' : ''}" 
             onclick="handleNotificationClick('${notification.id}')">  <div class="notification-content">
                <div class="notification-icon ${getNotificationIconClass(notification.type)}">
                    <i class="fas ${getNotificationIcon(notification.type)}"></i>
                </div>
                <div class="notification-text">
                    <div class="notification-title">${notification.title}</div>
                    <div class="notification-desc">${notification.message}</div>
                    <div class="notification-time">${formatFullDateTime(notification.created_at || notification.time)}</div>
                </div>
            </div>
            <button 
                onclick="deleteHeaderNotification('${notification.id}', event)" 
                title="مسح الإشعار" 
                style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--gray-400); cursor: pointer; font-size: 0.9rem; padding: 5px; border-radius: 50%; width: 30px; height: 30px; line-height: 1;">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function clearAllNotifications() {
    if (notifications.length === 0) {
        return showToast('لا توجد إشعارات لمسحها.', 'info');
    }

    showConfirmModal(
        'تأكيد مسح الكل',
        'هل أنت متأكد من رغبتك في حذف جميع الإشعارات؟ لا يمكن التراجع عن هذا الإجراء.',
        'نعم، امسح الكل',
        async () => {
            const { error } = await supabaseClient
                .from('notifications')
                .delete()
                .neq('id', 0);

            if (error) {
                console.error('Error clearing notifications:', error);
                showToast('حدث خطأ أثناء مسح الإشعارات', 'error');
            } else {
                notifications = [];
                loadNotifications();
                showToast('تم مسح جميع الإشعارات بنجاح', 'success');
                // ✅ السطر الجديد لإغلاق اللوحة
                document.getElementById('notificationsPanel').classList.remove('show');
            }
        }
    );
}

// ✅ أضف هذه الدالة الجديدة بالكامل في ملفك
async function deleteHeaderNotification(notificationId, event) {
    // هذه الدالة تمنع تشغيل الأحداث الأخرى عند الضغط على زر الحذف
    event.stopPropagation();

    // 1. الحذف من قاعدة بيانات Supabase
    const { error } = await supabaseClient
        .from('notifications')
        .delete()
        .eq('id', notificationId);

    if (error) {
        showToast('حدث خطأ أثناء حذف الإشعار', 'error');
        console.error('Error deleting notification:', error);
    } else {
        // 2. الحذف من القائمة المحلية
        notifications = notifications.filter(n => Number(n.id) !== Number(notificationId));

        // 3. إعادة رسم قائمة الإشعارات بالبيانات الجديدة
        loadNotifications();
        showToast('تم حذف الإشعار', 'info');
        
        // ✅ هذا هو الكود الجديد
        // إذا أصبحت قائمة الإشعارات فارغة، قم بإغلاق اللوحة
        if (notifications.length === 0) {
            document.getElementById('notificationsPanel').classList.remove('show');
        }
    }
}

// ✅ النسخة النهائية والصحيحة لدالة فحص التذكيرات
// ✅ النسخة النهائية والصحيحة لدالة فحص التذكيرات
async function checkDueNotifications() {
    const now = new Date();
    // تحديد فترة السماح (5 دقائق)
    const gracePeriod = new Date(now.getTime() - 5 * 60 * 1000);
    
    for (const client of clients) {
        if (!client.followups || client.followups.length === 0) continue;

        let followupsModified = false;

        for (const followup of client.followups) {
            if (!followup.date || !followup.time) continue;

            const followupDateTime = new Date(`${followup.date}T${followup.time}`);

            // التحقق من المواعيد الفائتة التي لم يتم الإشعار بها
            if (followup.reminder && !followup.notified && followupDateTime <= now) {
                
                // --- الجزء الجديد والذكي ---
                if (followupDateTime >= gracePeriod) {
                    // الحالة الأولى: الموعد فات منذ أقل من 5 دقائق
                    // نفترض أن الإشعار المحلي عمل، لذلك نحدث قاعدة البيانات بصمت فقط
                    followup.notified = true;
                    followupsModified = true;
                    console.log(`Silently marking recent followup for ${client.name} as notified.`);
                } else {
                    // الحالة الثانية: الموعد فات منذ أكثر من 5 دقائق
                    // هنا ننشئ إشعارًا مرئيًا لأنه قد يكون فائتًا بالفعل
                    const notificationObject = {
                        title: `تذكير فائت: ${getFollowupTypeText(followup.type)}`,
                        message: `لديك موعد فائت مع العميل: ${client.name}`,
                        created_at: new Date().toISOString(),
                        type: 'reminder',
                        read: false,
                        client_id: client.id,
                        followup_id: followup.id
                    };

                    const { data: newDbNotification, error: insertError } = await supabaseClient
                        .from('notifications')
                        .insert([notificationObject])
                        .select()
                        .single();

                    if (!insertError && newDbNotification) {
                        notifications.unshift(newDbNotification);
                        loadNotifications(); // تحديث واجهة الإشعارات
                        
                        followup.notified = true;
                        followupsModified = true;
                    }
                }
                // --- نهاية الجزء الجديد ---
            }
        }

        // تحديث قاعدة البيانات إذا تم تعديل أي متابعة
        if (followupsModified) {
            await supabaseClient
                .from('clients')
                .update({ followups: client.followups })
                .eq('id', client.id);
        }
    }
}

function handleLogout() {
    showConfirmModal('تأكيد تسجيل الخروج', 'هل أنت متأكد من رغبتك في تسجيل الخروج؟', 'تسجيل الخروج', async () => {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            showToast('حدث خطأ أثناء تسجيل الخروج', 'error');
        } else {
            // توجيه المستخدم إلى صفحة الدخول بعد الخروج
            window.location.href = 'index.html';
        }
    });
}

        function showModal(modalId) {
            document.getElementById(modalId).classList.add('show');
        }

        function closeModal(modalId) {
            document.getElementById(modalId).classList.remove('show');
        }

        // Utility Functions

// ✅ دالة جديدة لرسم التقويم بشكل ديناميكي
function renderCalendar() {
    const monthYearDisplay = document.getElementById('calendarMonthYear');
    const daysContainer = document.getElementById('calendar-days');

    const today = new Date();
    const currentMonth = currentCalendarDate.getMonth();
    const currentYear = currentCalendarDate.getFullYear();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDay = new Date(currentYear, currentMonth, 1).getDay(); // يوم الأحد هو 0

    // تحديث عنوان الشهر والعام
    monthYearDisplay.textContent = currentCalendarDate.toLocaleString('ar-EG', { month: 'long', year: 'numeric' });

    let daysHtml = '';
    
    // إضافة الخلايا الفارغة قبل بداية الشهر
    for (let i = 0; i < firstDay; i++) {
        daysHtml += '<div></div>';
    }

    // إضافة خلايا أيام الشهر
    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(currentYear, currentMonth, i);
        const isToday = date.toDateString() === today.toDateString();
        daysHtml += `<div class="calendar-day ${isToday ? 'today' : ''}">${i}</div>`;
    }

    daysContainer.innerHTML = daysHtml;
}

// ✅ دالة جديدة للتحكم في التنقل بين الشهور
function changeMonth(direction) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + direction);
    renderCalendar();
}

// ✅ أضف هذه الدالة الجديدة لفتح التقويم
function showCalendarModal() {
    // قم بتعيين التاريخ الحالي عند فتح التقويم
    currentCalendarDate = new Date();
    showModal('calendarModal');
    renderCalendar();
}

        function generateId() {
            return Date.now().toString(36) + Math.random().toString(36).substr(2);
        }

// ✅ استبدل الدالة القديمة بالكامل بهذه النسخة الجديدة
function formatPhoneInput(input) {
    let value = input.value;

    // 1. إبقاء الأرقام وعلامة '+' فقط
    let numbers = value.replace(/[^\d+]/g, '');

    // 2. التأكد من أن '+' موجودة فقط في البداية
    if (numbers.lastIndexOf('+') > 0) {
        numbers = '+' + numbers.replace(/\+/g, '');
    }

    // 3. إذا لم تكن القيمة فارغة ولا تبدأ بـ '+'، أضفها
    if (numbers && !numbers.startsWith('+')) {
        numbers = '+' + numbers;
    }

    // 4. تحديد أقصى طول لرقم دولي (عادة + و 15 رقمًا)
    if (numbers.length > 16) {
        numbers = numbers.substring(0, 16);
    }

    // 5. تحديث قيمة الحقل
    input.value = numbers;
}

        function showToast(message, type = 'success') {
            const existingToast = document.querySelector('.toast');
            if (existingToast) {
                existingToast.remove();
            }

            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `
                <div class="toast-content">
                    <i class="fas ${getToastIcon(type)} toast-icon"></i>
                    <div class="toast-message">${message}</div>
                </div>
            `;

            document.body.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 100);

            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        }

// ✅ النسخة المحدثة لفتح وإغلاق الإشعارات
function toggleNotifications() {
    const panel = document.getElementById('notificationsPanel');
    if (!panel) return;

    const isOpening = !panel.classList.contains('show');
    panel.classList.toggle('show');

    if (isOpening) {
        // عند فتح اللوحة، قم بإنشاء حالة جديدة في سجل المتصفح
        history.pushState({ panelOpen: 'notifications' }, 'Notifications');
    } else {
        // إذا كانت اللوحة مفتوحة وتم الضغط على الزر لإغلاقها، ارجع خطوة
        // هذا يضمن أن سجل التصفح يظل متزامنًا
        if (history.state && history.state.panelOpen === 'notifications') {
            history.back();
        }
    }
}

        // دالة مركزية جديدة لإظهار نافذة التأكيد
function showConfirmModal(title, message, confirmText, onConfirmCallback) {
    // 1. تحديث محتوى القائمة
    document.getElementById('confirmModalTitle').innerHTML = title;
    document.getElementById('confirmModalBody').textContent = message;
    
    const confirmBtn = document.getElementById('confirmModalConfirmBtn');
    confirmBtn.innerHTML = confirmText;

    // 2. إزالة أي event listeners قديمة لتجنب تكرار الأوامر
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    // 3. إضافة الـ event listener الجديد لتنفيذ الأمر المطلوب عند التأكيد
    newConfirmBtn.addEventListener('click', () => {
        onConfirmCallback(); // تنفيذ الدالة الممررة
        closeModal('confirmModal'); // إغلاق القائمة
    });

    // 4. إظهار القائمة
    showModal('confirmModal');
}

        function getStatusText(status) {
            const statusMap = {
                'interested': 'مهتم',
                'serious': 'جاد',
                'not-interested': 'غير مهتم',
                'pending': 'معلق',
                'booked': 'تم الحجز',
                'paid': 'تم الدفع'
            };
            return statusMap[status] || 'معلق';
        }

        function getFollowupTypeText(type) {
            const typeMap = {
                'call': 'مكالمة هاتفية',
                'meeting': 'اجتماع',
                'viewing': 'معاينة',
                'whatsapp': 'رسالة واتساب'
            };
            return typeMap[type] || type;
        }

// ✅ استبدل الدالة القديمة بالكامل بهذه النسخة المحدثة
function getOperationTypeText(type) {
    const typeMap = {
        'add_client': 'إضافة عميل',
        'edit_client': 'تعديل بيانات عميل',
        'delete_client': 'حذف عميل',
        'add_followup': 'إضافة متابعة',
        'edit_followup': 'تعديل متابعة',
        'delete_followup': 'حذف متابعة',
        'add_viewing': 'حجز معاينة',
        'change_status': 'تغيير حالة العميل', // <-- هذه هي الإضافة التي طلبتها
        'feature_client': 'تمييز عميل',
        'unfeature_client': 'إلغاء تمييز عميل',
        'call_client': 'اتصال بعميل',
        'whatsapp_client': 'رسالة واتساب',
        'export_data': 'تصدير البيانات',
        'import_data': 'استيراد البيانات',
        'logout': 'تسجيل الخروج'
    };
    return typeMap[type] || type;
}

// ✅ استبدل هذه الدالة بالكامل
function getNotificationIcon(type) {
    const iconMap = {
        'followup': 'fa-calendar-check',
        'reminder': 'fa-bell',
        'system': 'fa-info-circle',
        'random_reminder': 'fa-lightbulb' // <-- الأيقونة الجديدة
    };
    return iconMap[type] || 'fa-bell';
}

// ✅ استبدل هذه الدالة بالكامل
function getNotificationIconClass(type) {
    const classMap = {
        'followup': 'primary',
        'reminder': 'warning',
        'system': 'info',
        'random_reminder': 'accent' // <-- اللون الجديد
    };
    return `stat-icon ${classMap[type] || 'primary'}`;
}

// ✅ أضف هذه الدالة الجديدة بالكامل لإصلاح الخطأ الثاني
async function markNotificationRead(notificationId) {
    const notificationIndex = notifications.findIndex(n => n.id == notificationId);
    if (notificationIndex === -1 || notifications[notificationIndex].read) {
        // إذا لم يتم العثور عليه أو كان مقروءًا بالفعل، لا تفعل شيئًا
        return;
    }

    // 1. التحديث في قاعدة البيانات
    const { error } = await supabaseClient
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

    if (!error) {
        // 2. التحديث في القائمة المحلية
        notifications[notificationIndex].read = true;
        // 3. إعادة رسم قائمة الإشعارات لإظهار التغيير
        loadNotifications();
    } else {
        console.error("Error marking notification as read:", error);
    }
}

/**
 * ✅ النسخة الجديدة والمحسنة: تقوم بجدولة تذكير عشوائي لمتابعة عميل.
 * تعمل هذه الدالة بشكل دوري في الخلفية.
 */
async function scheduleRandomClientReminder() {
    // لا تقم بتشغيل الميزة إذا كان عدد العملاء قليلًا جدًا
    if (clients.length < 3) {
        console.log("Random reminder skipped: not enough clients.");
        return;
    }

    // --- START: تعديل منطق الفلترة ---
    const now = new Date();
    const eligibleClients = clients.filter(client => {
        // الحالة الافتراضية للعملاء القدامى هي 'active'
        const status = client.randomReminderStatus?.status || 'active';

        // 1. استبعاد العملاء الذين تم كتمهم بشكل دائم
        if (status === 'muted') {
            return false;
        }

        // 2. استبعاد العملاء قيد الإيقاف المؤقت (hold)
        if (status === 'hold' && client.randomReminderStatus.holdUntil) {
            if (new Date(client.randomReminderStatus.holdUntil) > now) {
                return false; // ما زال في فترة الإيقاف المؤقت
            }
        }

        // 3. الشرط الأصلي: لم يتم إرسال تذكير له خلال آخر 3 أيام
        const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
        return !client.lastRandomReminderAt || new Date(client.lastRandomReminderAt) < oneDayAgo;
    });
    // --- END: تعديل منطق الفلترة ---

    if (eligibleClients.length === 0) {
        console.log("No eligible clients for a random reminder at this time.");
        return;
    }

    const randomClient = eligibleClients[Math.floor(Math.random() * eligibleClients.length)];

    // (باقي الكود لإنشاء الإشعار كما هو، لا تغيير فيه)
    const notificationObject = {
        title: `💡 تذكير عشوائي`,
        message: `هل فكرت في متابعة العميل: ${randomClient.name} اليوم؟`,
        created_at: new Date().toISOString(),
        type: 'random_reminder',
        read: false,
        client_id: randomClient.id
    };
    const { data: newDbNotification, error: insertError } = await supabaseClient
        .from('notifications')
        .insert([notificationObject])
        .select()
        .single();

    if (insertError) {
        console.error("Failed to save random reminder notification:", insertError);
        return;
    }
    notifications.unshift(newDbNotification);
    loadNotifications();

    if (window.Capacitor && Capacitor.isNativePlatform()) {
        const { LocalNotifications } = Capacitor.Plugins;
        await LocalNotifications.schedule({
            notifications: [{
                title: newDbNotification.title,
                body: newDbNotification.message,
                id: newDbNotification.id,
                schedule: { at: new Date(Date.now() + 1000) },
                channelId: 'crm_reminders_channel',
                extra: { clientId: randomClient.id }
            }]
        });
    }

    await supabaseClient
        .from('clients')
        .update({ lastRandomReminderAt: new Date().toISOString() })
        .eq('id', randomClient.id);

    const clientIndex = clients.findIndex(c => c.id == randomClient.id);
    if (clientIndex !== -1) {
        clients[clientIndex].lastRandomReminderAt = new Date().toISOString();
        await saveClientsToLocal(clients);
    }

    console.log(`Random reminder scheduled for client: ${randomClient.name}`);
}

        function getToastIcon(type) {
            const iconMap = {
                'success': 'fa-check-circle',
                'error': 'fa-exclamation-circle',
                'warning': 'fa-exclamation-triangle',
                'info': 'fa-info-circle'
            };
            return iconMap[type] || 'fa-info-circle';
        }

        function getTimeAgo(dateString) {
            const now = new Date();
            const date = new Date(dateString);
            const diffInMinutes = Math.floor((now - date) / (1000 * 60));
            
            if (diffInMinutes < 1) return 'الآن';
            if (diffInMinutes < 60) return `منذ ${diffInMinutes} دقيقة`;
            
            const diffInHours = Math.floor(diffInMinutes / 60);
            if (diffInHours < 24) return `منذ ${diffInHours} ساعة`;
            
            const diffInDays = Math.floor(diffInHours / 24);
            return `منذ ${diffInDays} يوم`;
        }

// ✅ دالة جديدة ومحسنة لعرض التاريخ والوقت بشكل كامل
function formatFullDateTime(dateString) {
    if (!dateString) return ''; // حماية من الأخطاء

    const date = new Date(dateString);
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',

        hour: '2-digit',
        minute: '2-digit',
        hour12: true, // استخدم نظام 12 ساعة (صباحًا/مساءً)
        numberingSystem: 'latn' // لضمان ظهور الأرقام بالإنجليزية
    };
    
    // استخدم 'ar-EG' لعرض الشهور والأيام بالعربية
    return new Date(date).toLocaleString('ar-EG', options);
}

        // Client Profile Functions

// ✅ أضف هذه الدالة الجديدة
/**
 * تقوم بتطبيق الثيم الداكن أو الفاتح على التطبيق.
 * @param {boolean} isDark - هل الوضع الداكن مفعل أم لا.
 */
function applyTheme(isDark) {
    if (isDark) {
        document.body.classList.add('dark');
    } else {
        document.body.classList.remove('dark');
    }
}

function viewClientProfile(clientId) {
        window.scrollTo(0, 0); // <--- أضف هذا السطر
    const client = clients.find(c => c.id == clientId);
    if (!client) {
        showToast('لم يتم العثور على العميل.', 'error');
        return;
    }

    currentClientId = clientId;
// ✅ السطر الجديد حسب طلبك
document.getElementById('profileClientName').innerHTML = '<i class="fas fa-user"></i> <span>الصفحة الشخصية للعميل</span>';

    // Update featured button
// Populate profile header (separate followups and viewings)
const profileHeader = document.getElementById('profileHeader');
const followups = client.followups || [];

// فصل المتابعات العادية عن المعاينات
const followupItems = followups.filter(f => f.type !== 'viewing');
const viewingItems = followups.filter(f => f.type === 'viewing');

const now = new Date();

// إحصائيات المتابعات (بدون المعاينات)
const totalFollowups = followupItems.length;
const completedFollowups = followupItems.filter(f => new Date(`${f.date}T${f.time}`) <= now).length;
const upcomingFollowups = followupItems.filter(f => new Date(`${f.date}T${f.time}`) > now).length;

// إحصائيات المعاينات
const totalViewings = viewingItems.length;
const completedViewings = viewingItems.filter(f => new Date(`${f.date}T${f.time}`) <= now).length;
const upcomingViewings = viewingItems.filter(f => new Date(`${f.date}T${f.time}`) > now).length;

profileHeader.innerHTML = `
    <div class="profile-header-container">
        <div class="profile-name-and-type">
            <div class="profile-name">${client.name}</div>
            <div class="profile-type">${client.type === 'buyer' ? 'طالب وحدة' : 'عارض وحدة'}</div>
        </div>
    </div>
    
    <div class="profile-stats">
        <div class="profile-stat">
            <div class="profile-stat-value">${totalFollowups}</div>
            <div class="profile-stat-label">إجمالي المتابعات</div>
        </div>
        <div class="profile-stat">
            <div class="profile-stat-value">${completedFollowups}</div>
            <div class="profile-stat-label">متابعات مكتملة</div>
        </div>
        <div class="profile-stat">
            <div class="profile-stat-value">${upcomingFollowups}</div>
            <div class="profile-stat-label">متابعات قادمة</div>
        </div>
    </div>

    <div class="profile-stats" style="margin-top:8px;">
        <div class="profile-stat">
            <div class="profile-stat-value">${totalViewings}</div>
            <div class="profile-stat-label">إجمالي المعاينات</div>
        </div>
        <div class="profile-stat">
            <div class="profile-stat-value">${completedViewings}</div>
            <div class="profile-stat-label">معاينات مكتملة</div>
        </div>
        <div class="profile-stat">
            <div class="profile-stat-value">${upcomingViewings}</div>
            <div class="profile-stat-label">معاينات قادمة</div>
        </div>
    </div>
`;

    // Populate detailed info
const basicInfoContainer = document.getElementById('profileBasicInfo');
basicInfoContainer.innerHTML = `
    <div class="profile-details-grid">
        <!-- الحالة -->
        <div class="detail-badge">
            <i class="fas fa-flag badge-icon"></i>
            <div class="badge-label">الحالة الحالية</div>
            <div class="profile-info-value" style="margin-top: auto;">
                <span class="status-badge status-${client.status || 'pending'}">
                    ${getStatusText(client.status || 'pending')}
                </span>
            </div>
        </div>

        <!-- بيانات طالب الوحدة -->
        ${client.buyerData ? `
            <div class="detail-badge">
                <i class="fas fa-building badge-icon"></i>
                <div class="badge-label">نوع الوحدة</div>
                <div class="profile-info-value">${getUnitTypeText(client.buyerData.unitType) || 'غير محدد'}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-map-marker-alt badge-icon"></i>
                <div class="badge-label">المنطقة المطلوبة</div>
                <div class="profile-info-value">${client.buyerData.location || 'غير محدد'}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-ruler-combined badge-icon"></i>
                <div class="badge-label">المساحة</div>
                <div class="profile-info-value">${client.buyerData.area || 'غير محدد'} متر²</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-building badge-icon"></i>
                <div class="badge-label">الدور المطلوب</div>
                <div class="profile-info-value">${client.buyerData.floors || 'غير محدد'}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-sack-dollar badge-icon"></i>
                <div class="badge-label">الميزانية</div>
                <div class="profile-info-value">${client.buyerData.budget || 'غير محدد'}</div>
            </div>
        ` : ''}

        <!-- بيانات البائع -->
        ${client.sellerData ? `
            <div class="detail-badge">
                <i class="fas fa-building badge-icon"></i>
                <div class="badge-label">نوع الوحدة</div>
                <div class="profile-info-value">${getUnitTypeText(client.sellerData.unitType) || 'غير محدد'}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-map-marker-alt badge-icon"></i>
                <div class="badge-label">الموقع</div>
                <div class="profile-info-value">${client.sellerData.location || 'غير محدد'}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-ruler-combined badge-icon"></i>
                <div class="badge-label">المساحة</div>
                <div class="profile-info-value">${client.sellerData.area || 'غير محدد'} متر²</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-door-open badge-icon"></i>
                <div class="badge-label">الغرف</div>
                <div class="profile-info-value">${client.sellerData.rooms || 'غير محدد'}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-shower badge-icon"></i>
                <div class="badge-label">الحمامات</div>
                <div class="profile-info-value">${client.sellerData.bathrooms || 'غير محدد'}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-utensils badge-icon"></i>
                <div class="badge-label">المطابخ</div>
                <div class="profile-info-value">${client.sellerData.kitchens || 'غير محدد'}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-building badge-icon"></i>
                <div class="badge-label">الدور</div>
                <div class="profile-info-value">${client.sellerData.floors || 'غير محدد'}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-elevator badge-icon"></i>
                <div class="badge-label">المصاعد</div>
                <div class="profile-info-value">${client.sellerData.elevators || 'غير محدد'}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-gas-pump badge-icon"></i>
                <div class="badge-label">العدادات</div>
                <div class="profile-info-value">${client.sellerData.meters || 'غير محدد'}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-file-invoice-dollar badge-icon"></i>
                <div class="badge-label">الترخيص</div>
                <div class="profile-info-value">${client.sellerData.licensed === 'yes' ? 'نعم' : (client.sellerData.licensed === 'no' ? 'لا' : 'غير محدد')}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-percent badge-icon"></i>
                <div class="badge-label">العمولة %</div>
                <div class="profile-info-value">${client.sellerData.commission || 'غير محدد'}</div>
            </div>
            <div class="detail-badge">
                <i class="fas fa-sack-dollar badge-icon"></i>
                <div class="badge-label">السعر المطلوب</div>
                <div class="profile-info-value">${client.sellerData.price || 'غير محدد'}</div>
            </div>
        ` : ''}

        <!-- أرقام الهاتف (ثابتة بعد السعر) -->
        <div class="detail-badge">
            <i class="fas fa-phone-alt badge-icon"></i>
            <div class="badge-label">أرقام الهاتف</div>
            <div class="profile-info-value" style="margin-top: auto;">
                ${client.phones?.length ? client.phones.join('<br>') : 'لا يوجد'}
            </div>
        </div>

        <!-- تفاصيل إضافية -->
        ${client.sellerData ? `
        <div class="detail-badge" style="grid-column: 1 / -1;">
            <i class="fas fa-info-circle badge-icon"></i>
            <div class="badge-label">تفاصيل إضافية</div>
            <div class="profile-info-value" style="white-space: pre-wrap;">
                ${client.sellerData.details || 'لا يوجد'}
            </div>
        </div>
        ` : ''}

        <!-- الملاحظات -->
        <div class="detail-badge" style="grid-column: 1 / -1;">
            <i class="fas fa-sticky-note badge-icon"></i>
            <div class="badge-label">ملاحظات</div>
            <div class="profile-info-value" style="white-space: pre-wrap;">
                ${client.notes || 'لا يوجد'}
            </div>
        </div>

        <!-- تاريخ الإضافة -->
        <div class="detail-badge">
            <i class="fas fa-calendar-alt badge-icon"></i>
            <div class="badge-label">تاريخ الإضافة</div>
            <div class="profile-info-value">
                ${new Date(client.created_at).toLocaleDateString('ar-EG', { numberingSystem: 'latn' })}
            </div>
        </div>

        <!-- عمولة مخفية -->
        ${client.commission ? `
        <div class="profile-info-item" style="border-left-color: var(--accent);">
            <div class="profile-info-label">العمولة</div>
            <div class="profile-info-value" style="display: flex; align-items: center; gap: 8px;">
                <span id="commissionDisplay" style="font-weight: 600; color: var(--accent);">••••••</span>
                <button type="button" onclick="toggleProfileCommissionVisibility()" style="background: none; border: none; cursor: pointer;">
                    <i class="fas fa-eye" id="profileCommissionToggle"></i>
                </button>
            </div>
        </div>
        ` : ''}
    </div>
`;

    // Populate followups timeline
// ✅ START: الكود المحدث والمنظم لعرض المتابعات
const followupsContainer = document.getElementById('profileFollowups');

if (followups.length === 0) {
    followupsContainer.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-calendar-alt"></i>
            <div>لا توجد متابعات لهذا العميل</div>
        </div>
    `;
} else {
    const sortedFollowups = followups.sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));

    followupsContainer.innerHTML = sortedFollowups.map(followup => {
        const isUpcoming = new Date(`${followup.date}T${followup.time}`) > new Date();
        const statusText = isUpcoming ? 'قادم' : 'مكتمل';
        const statusColor = isUpcoming ? 'var(--warning)' : 'var(--accent)';

        return `
        <div class="followup-timeline-item ${followup.type}">
            <div class="followup-header">
                <div class="followup-title-group">
                    <span class="followup-type-badge followup-type-${followup.type}">${getFollowupTypeText(followup.type)}</span>
                    <h4 class="followup-date-time">${new Date(followup.date).toLocaleDateString('ar-EG', {day: 'numeric', month: 'long'})} - ${followup.time}</h4>
                </div>
                <span style="font-size: 0.75rem; color: ${statusColor}; font-weight: 600; align-self: center;">${statusText}</span>
            </div>

            ${(followup.location || followup.notes) ? `
            <div class="followup-details">
                ${followup.location ? `<p style="margin-bottom: 8px;"><strong>الموقع:</strong> ${followup.location}</p>` : ''}
                ${followup.notes ? `<p><strong>ملاحظات:</strong> ${followup.notes}</p>` : ''}
            </div>
            ` : ''}

            <div class="form-actions" style="padding: 12px 0 0; margin-top: 12px; border-top: 1px solid var(--gray-100); justify-content: flex-start;">
                <button class="btn btn-primary btn-sm" onclick="editFollowup('${currentClientId}', '${followup.id}')" title="تعديل">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteFollowup('${currentClientId}', '${followup.id}')" title="حذف">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        `;
    }).join('');
}
// ✅ END: نهاية الكود المحدث
    // --- START: Reminder Control Card Logic ---
const reminderContainer = document.getElementById('reminderControlContainer');
if (reminderContainer) {
    const reminderStatus = client.randomReminderStatus?.status || 'active';
    const holdUntil = client.randomReminderStatus?.holdUntil;
    let buttonsHtml = '';

    if (reminderStatus === 'active') {
        buttonsHtml = `
        <p style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 16px; margin-top: 0;">
            التذكيرات العشوائية مفعلة لهذا العميل.
        </p>
        <div style="display: flex; gap: 12px;">
            <button class="btn btn-secondary btn-sm" onclick="showHoldReminderModal()"><i class="fas fa-pause-circle"></i> إيقاف مؤقت...</button>
            <button class="btn btn-danger btn-sm" onclick="updateClientRandomReminderStatus('muted')"><i class="fas fa-bell-slash"></i> لا تذكرني به مجددًا</button>
        </div>`;
    } else if (reminderStatus === 'muted') {
        buttonsHtml = `
            <p style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 16px;">التذكيرات العشوائية معطلة لهذا العميل.</p>
            <button class="btn btn-success btn-sm" onclick="updateClientRandomReminderStatus('active')"><i class="fas fa-play-circle"></i> إعادة تفعيل التذكيرات</button>`;
    } else if (reminderStatus === 'hold') {
        buttonsHtml = `
            <p style="font-size: 0.85rem; color: var(--gray-600); margin-bottom: 16px;">التذكيرات متوقفة مؤقتًا حتى: <strong style="color: var(--primary);">${new Date(holdUntil).toLocaleDateString('ar-EG')}</strong></p>
            <button class="btn btn-success btn-sm" onclick="updateClientRandomReminderStatus('active')"><i class="fas fa-play-circle"></i> تفعيلها الآن</button>`;
    }
    reminderContainer.innerHTML = buttonsHtml;
}
// --- END: Reminder Control Card Logic ---
const brokerCard = document.getElementById('brokerCard');
const brokers = client.brokerCollaboration || [];

if (brokers.length > 0) {
    const brokerListHtml = brokers.map(broker => {
        return `
        <div style="margin-bottom: 20px; border-bottom: 1px solid var(--gray-200); padding-bottom: 16px;">
            <div class="profile-info-grid">
                <div class="profile-info-item">
                    <div class="profile-info-label">اسم الوسيط</div>
                    <div class="profile-info-value">${broker.name}</div>
                </div>
                <div class="profile-info-item">
                    <div class="profile-info-label">أرقام الهاتف</div>
                    <div class="profile-info-value">${broker.phones.join(' / ')}</div>
                </div>
                ${broker.report ? `
                <div class="profile-info-item" style="grid-column: 1 / -1;">
                    <div class="profile-info-label">تقرير التعاون</div>
                    <div class="profile-info-value" style="white-space: pre-wrap;">${broker.report}</div>
                </div>` : ''}
            </div>
            <div class="form-actions" style="padding: 12px 0 0; justify-content: flex-start; border-top: none;">
                <button class="btn btn-info btn-sm" onclick="handleBrokerCall('${broker.id}')" title="اتصال">
                    <i class="fas fa-phone"></i>
                </button>
                <button class="btn btn-accent btn-sm" onclick="handleBrokerWhatsapp('${broker.id}')" title="واتساب">
                    <i class="fab fa-whatsapp"></i>
                </button>
                <button class="btn btn-primary btn-sm" onclick="editBroker('${broker.id}')" title="تعديل">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteBroker('${broker.id}')" title="مسح">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        `;
    }).join('');

    brokerCard.innerHTML = `
        <div class="card-header">
            <h3 class="card-title">
                <i class="fas fa-handshake" style="color: var(--accent);"></i>
                بيانات التعاون مع الوسطاء
            </h3>
        </div>
        <div style="padding: 16px;">${brokerListHtml}</div>
    `;
    brokerCard.style.display = 'block';

} else {
    brokerCard.style.display = 'none';
}

    switchSection('client-profile');
}
/**
 * ✅ دالة جديدة: لتحديث حالة التذكير العشوائي للعميل.
 * @param {string} status - الحالة الجديدة ('hold', 'muted', 'active').
 */
function editBroker(brokerId) {
    const client = clients.find(c => c.id == currentClientId);
    if (!client) return;

    const brokerToEdit = client.brokerCollaboration?.find(b => b.id == brokerId);
    if (!brokerToEdit) return showToast('لم يتم العثور على الوسيط', 'error');

    document.getElementById('brokerName').value = brokerToEdit.name || '';
    document.getElementById('brokerReport').value = brokerToEdit.report || '';
    
    // ✅ هنا يجب أن نجهز النموذج لبيانات التعديل وليس الإضافة
    const phoneContainer = document.getElementById('brokerPhoneNumbers');
    const phones = brokerToEdit.phones || [''];
    phoneContainer.innerHTML = phones.map(phone => `
        <div class="phone-input-group">
            <input type="tel" class="form-input" placeholder="رقم هاتف الوسيط" value="${phone}" oninput="formatPhoneInput(this)">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeBrokerPhoneInput(this)">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
    
    // ✅ إضافة زر تحديث بدلاً من الحفظ
    document.getElementById('brokerForm').onsubmit = (e) => handleUpdateBroker(e, brokerId);

    showModal('brokerModal');
}
async function handleUpdateBroker(event, brokerId) {
    event.preventDefault();
    if (!currentClientId) return;

    const updatedBrokerData = {
        name: document.getElementById('brokerName').value.trim(),
        phones: Array.from(document.querySelectorAll('#brokerPhoneNumbers input[type="tel"]')).map(input => input.value.trim()).filter(Boolean),
        report: document.getElementById('brokerReport').value.trim(),
        id: brokerId
    };

    if (!updatedBrokerData.name || updatedBrokerData.phones.length === 0) {
        return showToast('يجب إدخال اسم ورقم هاتف الوسيط على الأقل', 'error');
    }

    const client = clients.find(c => c.id == currentClientId);
    if (!client) return;

    const updatedBrokersList = (client.brokerCollaboration || []).map(broker => 
        broker.id == brokerId ? updatedBrokerData : broker
    );
    
    // ✅ هذا هو السطر المصحح
    const { data, error } = await supabaseClient
        .from('clients')
        .update({ brokerCollaboration: updatedBrokersList })
        .eq('id', currentClientId)
        .select();

// ...
if (error) {
    showToast('حدث خطأ أثناء تحديث بيانات التعاون', 'error');
    console.error('Error updating broker data:', error);
} else if (data) { // ✅ تأكد من وجود بيانات
    const clientIndex = clients.findIndex(c => c.id == currentClientId);
    if (clientIndex !== -1) {
        clients[clientIndex] = data;
    }
    await saveClientsToLocal(clients);
    
    showToast('تم تحديث بيانات التعاون بنجاح', 'success');
    closeModal('brokerModal');
    viewClientProfile(currentClientId);
}
}
function deleteBroker(brokerId) {
    showConfirmModal('تأكيد مسح الوسيط', 'هل أنت متأكد من رغبتك في مسح بيانات هذا الوسيط؟', 'نعم، قم بالمسح', async () => {
        const client = clients.find(c => c.id == currentClientId);
        if (!client) return;
        
        const updatedBrokersList = (client.brokerCollaboration || []).filter(broker => broker.id != brokerId);

        const { data, error } = await supabaseClient
            .from('clients')
            .update({ brokerCollaboration: updatedBrokersList })
            .eq('id', currentClientId)
            .select()
            .single(); // ✅ استخدام single

        if (error) {
            showToast('حدث خطأ أثناء مسح البيانات', 'error');
        } else if (data) { // ✅ تأكد من وجود بيانات
            const clientIndex = clients.findIndex(c => c.id == currentClientId);
            if (clientIndex !== -1) {
                clients[clientIndex] = data; // تحديث الكائن بالكامل
            }
            await saveClientsToLocal(clients);
    
            showToast('تم مسح بيانات التعاون بنجاح', 'success');
            viewClientProfile(currentClientId);
        } else {
            // التعامل مع حالة عدم وجود بيانات مُرجعة
            showToast('تم مسح البيانات بنجاح، ولكن لم يتم إرجاع أي شيء', 'info');
            viewClientProfile(currentClientId);
        }
    });
}
async function updateClientRandomReminderStatus(status, holdDate = null) {
    if (!currentClientId) return;

    const clientIndex = clients.findIndex(c => c.id == currentClientId);
    if (clientIndex === -1) return;

    const client = clients[clientIndex];
    const updateData = { status: status };
    let toastMessage = '';

    if (status === 'hold' && holdDate) { // ✅ تم التعديل هنا
        updateData.holdUntil = new Date(holdDate).toISOString();
        // ✅ تم تعديل رسالة التأكيد لتعرض التاريخ المختار
        toastMessage = `تم إيقاف تذكيرات ${client.name} مؤقتًا حتى ${new Date(holdDate).toLocaleDateString('ar-EG')}.`;
    } else if (status === 'muted') {
        toastMessage = `لن يتم تذكيرك بالعميل ${client.name} مرة أخرى.`;
    } else if (status === 'active') {
        toastMessage = `تم إعادة تفعيل التذكيرات للعميل ${client.name}.`;
    }

const { data, error } = await supabaseClient
    .from('clients')
    .update({ randomReminderStatus: updateData })
    .eq('id', currentClientId)
    .select()
    .single();

if (error) {
    console.error('Error updating reminder status:', error);
    showToast('حدث خطأ أثناء تحديث الحالة', 'error');
} else if (data) { // ✅ تأكد من أن "data" ليست فارغة
    clients[clientIndex] = data; 
    await saveClientsToLocal(clients);
    showToast(toastMessage, 'success');
    viewClientProfile(currentClientId);
} else {
    // هذه الحالة قد تحدث إذا لم يتم العثور على العميل أو لم يتم تحديث أي شيء
    showToast('لم يتم تحديث الحالة', 'info');
}
}

/**
 * ✅ دالة المسح الرئيسية التي كانت مفقودة
 */
async function handleDeleteBroker() {
    if (!currentClientId) return;

    showConfirmModal(
        'تأكيد مسح الوسيط',
        'هل أنت متأكد من رغبتك في مسح بيانات هذا التعاون؟ لا يمكن التراجع عن هذا الإجراء.',
        'نعم، قم بالمسح',
        async () => {
            const client = clients.find(c => c.id == currentClientId);
            if (!client) return;

            // تحديث حقل التعاون بـ null
            const { data, error } = await supabaseClient
                .from('clients')
                .update({ brokerCollaboration: null })
                .eq('id', currentClientId)
                .select()
                .single();

            if (error) {
                showToast('حدث خطأ أثناء مسح البيانات', 'error');
            } else {
                const clientIndex = clients.findIndex(c => c.id == currentClientId);
                if (clientIndex !== -1 && data) {
                    clients[clientIndex] = data;
                }
                await saveClientsToLocal(clients);

                showToast('تم مسح بيانات التعاون بنجاح', 'success');
                if (document.getElementById('brokerModal').classList.contains('show')) {
                    closeModal('brokerModal');
                }
                viewClientProfile(currentClientId);
            }
        }
    );
}

function showHoldReminderModal() {
    // تحديد تاريخ الغد كتاريخ افتراضي مقترح
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('holdUntilDate').value = tomorrow.toISOString().split('T')[0];
    showModal('holdReminderModal');
}

/**
 * ✅ دالة جديدة: للتعامل مع حفظ تاريخ الإيقاف المؤقت.
 */
async function handleSetReminderHold(event) {
    event.preventDefault(); // منع إعادة تحميل الصفحة
    const holdDate = document.getElementById('holdUntilDate').value;
    if (holdDate) {
        await updateClientRandomReminderStatus('hold', holdDate);
        closeModal('holdReminderModal');
    } else {
        showToast('يرجى تحديد تاريخ صحيح', 'error');
    }
}

async function toggleFeaturedClient() {
    if (!currentClientId) return;

    const clientIndex = clients.findIndex(c => c.id == currentClientId);
    if (clientIndex === -1) return;

    const client = clients[clientIndex];
    const newFeaturedStatus = !client.featured; // تحديد الحالة الجديدة

    // 1. إرسال التحديث إلى Supabase
    const { data, error } = await supabaseClient
        .from('clients')
        .update({ featured: newFeaturedStatus })
        .eq('id', currentClientId)
        .select();

    if (error) {
        console.error('Error updating featured status:', error);
        showToast('حدث خطأ أثناء تمييز العميل', 'error');
    } else {
        // 2. تحديث البيانات المحلية والواجهة بعد النجاح
        clients[clientIndex] = data[0];
        await saveClientsToLocal(clients);
        const featuredBtn = document.getElementById('toggleFeaturedBtn');
        const featuredBtnText = document.getElementById('featuredBtnText');

        if (newFeaturedStatus) {
            featuredBtn.className = 'btn btn-warning btn-sm';
            featuredBtnText.textContent = 'إلغاء التمييز';
            showToast('تم تمييز العميل بنجاح', 'success');
            addOperation('feature_client', `تم تمييز العميل: ${client.name}`);
        } else {
            featuredBtn.className = 'btn btn-secondary btn-sm';
            featuredBtnText.textContent = 'تمييز العميل';
            showToast('تم إلغاء تمييز العميل', 'success');
            addOperation('unfeature_client', `تم إلغاء تمييز العميل: ${client.name}`);
        }

        updateDashboardStats();
        renderClientsTable(); // إعادة رسم قائمة العملاء لإظهار التغيير
    }
}

        function editClientFromProfile() {
            if (!currentClientId) return;
            editClient(currentClientId);
        }

        function addFollowupFromProfile() {
            if (!currentClientId) return;
            addFollowup(currentClientId);
        }

        function addViewingFromProfile() {
            if (!currentClientId) return;
            document.getElementById('viewingClientId').value = currentClientId;
            
            // Set default date to tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            document.getElementById('viewingDate').value = tomorrow.toISOString().split('T')[0];
            
            // Set default time to 10:00 AM
            document.getElementById('viewingTime').value = '10:00';
            
            showModal('viewingModal');
        }

        function callClientFromProfile() {
            if (!currentClientId) return;
            handleClientCall(currentClientId);
        }

        function whatsappClientFromProfile() {
            if (!currentClientId) return;
            handleClientWhatsapp(currentClientId);
        }
        
function changeClientStatus() {
    if (!currentClientId) return;
    const client = clients.find(c => c.id == currentClientId); // تم إصلاح البحث هنا
    if (!client) {
        showToast('لم يتم العثور على العميل', 'error');
        return;
    }

    document.getElementById('statusClientId').value = currentClientId;
    document.getElementById('newClientStatus').value = client.status || 'interested';
    document.getElementById('commissionAmount').value = client.commission || '';
    
    // إظهار حقل العمولة إذا كانت الحالة "تم الدفع"
    toggleCommissionField(); 
    
    showModal('statusModal');
}

// ✅ أضف هذه الدوال الجديدة الثلاثة

function navigateToClients(filters = {}) {
    // تعيين الفلاتر المطلوبة
    currentSearchFilters = {
        clientType: filters.clientType || 'all',
        status: filters.status || 'all',
        budget: '',
        location: ''
    };
    
    // تحديث واجهة عرض الفلاتر
    updateActiveFiltersDisplay();
    // الانتقال إلى صفحة العملاء (سيتم تطبيق الفلاتر تلقائيًا)
    switchSection('clients');
}

function renderPendingFollowups() {
    const container = document.getElementById('pendingFollowupsList');
    let allFollowups = [];

    // جمع كل المتابعات القادمة (غير المعاينات) من كل العملاء
    clients.forEach(client => {
        (client.followups || []).forEach(followup => {
            if (followup.type !== 'viewing' && new Date(`${followup.date}T${followup.time}`) > new Date()) {
                allFollowups.push({ ...followup, clientName: client.name, clientId: client.id });
            }
        });
    });

    // فرز المتابعات حسب التاريخ (الأقرب أولاً)
    allFollowups.sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

    if (allFollowups.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-calendar-check"></i><div>لا توجد متابعات قادمة.</div></div>`;
        return;
    }

    container.innerHTML = allFollowups.map(f => `
        <div class="mobile-table-item" onclick="viewClientProfile(${f.clientId})">
            <div class="mobile-table-header">
                <div class="mobile-table-name">${f.clientName}</div>
                <span class="followup-type-badge followup-type-${f.type}">${getFollowupTypeText(f.type)}</span>
            </div>
            <div class="mobile-table-details">
                <div class="mobile-table-detail">
                    <span class="mobile-table-label">التاريخ والوقت:</span>
                    <span class="mobile-table-value" style="font-weight: 600;">${formatFullDateTime(f.date + 'T' + f.time)}</span>
                </div>
                ${f.notes ? `<div class="mobile-table-detail"><span class="mobile-table-label">ملاحظات:</span><span class="mobile-table-value">${f.notes}</span></div>` : ''}
            </div>
        </div>
    `).join('');
}

function renderTodayViewings() {
    const container = document.getElementById('todayViewingsList');
    let upcomingViewings = [];

    // جمع كل المعاينات القادمة من كل العملاء
    clients.forEach(client => {
        (client.followups || []).forEach(followup => {
            // ✅ هذا هو الشرط الجديد الذي يبحث عن كل المعاينات المستقبلية
            if (followup.type === 'viewing' && new Date(`${followup.date}T${followup.time}`) > new Date()) {
                upcomingViewings.push({ ...followup, clientName: client.name, clientId: client.id });
            }
        });
    });

    // فرز المعاينات حسب التاريخ (الأقرب أولاً)
    upcomingViewings.sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

    if (upcomingViewings.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-eye-slash"></i><div>لا توجد معاينات قادمة.</div></div>`;
        return;
    }

    container.innerHTML = upcomingViewings.map(f => `
        <div class="mobile-table-item" onclick="viewClientProfile(${f.clientId})">
            <div class="mobile-table-header">
                <div class="mobile-table-name">${f.clientName}</div>
                <span class="followup-type-badge followup-type-viewing">معاينة</span>
            </div>
            <div class="mobile-table-details">
                <div class="mobile-table-detail">
                    <span class="mobile-table-label">التاريخ والوقت:</span>
                    <span class="mobile-table-value" style="font-weight: 600;">${formatFullDateTime(f.date + 'T' + f.time)}</span>
                </div>
                 <div class="mobile-table-detail">
                    <span class="mobile-table-label">الموقع:</span>
                    <span class="mobile-table-value">${f.location || 'غير محدد'}</span>
                </div>
                ${f.notes ? `<div class="mobile-table-detail"><span class="mobile-table-label">ملاحظات:</span><span class="mobile-table-value">${f.notes}</span></div>` : ''}
            </div>
        </div>
    `).join('');
}

function deleteClientFromProfile() {
    if (!currentClientId) return;
    deleteClient(currentClientId);
}

async function handleChangeStatus(e) {
    e.preventDefault();
    const clientId = document.getElementById('statusClientId').value;
    const newStatus = document.getElementById('newClientStatus').value;
    const commissionAmount = document.getElementById('commissionAmount').value.trim();

    const clientIndex = clients.findIndex(c => c.id == clientId);
    if (clientIndex === -1) return;

    const client = clients[clientIndex];
    const oldStatus = client.status;

    const updateObject = {
        status: newStatus,
        commission: (newStatus === 'paid' && commissionAmount) ? commissionAmount : client.commission
    };
    
    // إذا لم تكن الحالة "تم الدفع"، تأكد من أن العمولة ستكون فارغة
    if (newStatus !== 'paid') {
        updateObject.commission = null;
    }

    const { data, error } = await supabaseClient
        .from('clients')
        .update(updateObject)
        .eq('id', clientId)
        .select();

    if (error) {
        console.error('Error updating status:', error);
        showToast('حدث خطأ أثناء تحديث الحالة', 'error');
    } else {
        clients[clientIndex] = data[0]; // تحديث البيانات المحلية بالبيانات الجديدة
        await saveClientsToLocal(clients);
        addOperation('change_status', `تم تغيير حالة العميل ${client.name} إلى ${getStatusText(newStatus)}`);
        showToast('تم تحديث الحالة بنجاح', 'success');
        closeModal('statusModal');
        
        // تحديث الواجهة
        renderClientsTable();
        if (currentClientId == clientId) {
            viewClientProfile(clientId);
        }
    }
}

        function getUnitTypeText(type) {
            const typeMap = {
                'apartment': 'شقة',
                'villa': 'فيلا',
                'duplex': 'دوبلكس',
                'penthouse': 'بنتهاوس',
                'studio': 'استوديو',
                'office': 'مكتب',
                'shop': 'محل تجاري'
            };
            return typeMap[type] || type;
        }

        function toggleCommissionField() {
            const status = document.getElementById('newClientStatus').value;
            const commissionField = document.getElementById('commissionField');
            
            if (status === 'paid') {
                commissionField.style.display = 'block';
            } else {
                commissionField.style.display = 'none';
                document.getElementById('commissionAmount').value = '';
            }
        }

        function editFollowup(clientId, followupId) {
    const client = clients.find(c => c.id == clientId);
    if (!client || !client.followups) return showToast('لم يتم العثور على العميل', 'error');

    const followup = client.followups.find(f => f.id == followupId);
    if (!followup) return showToast('لم يتم العثور على المتابعة', 'error');

    document.getElementById('editFollowupClientId').value = clientId;
    document.getElementById('editFollowupId').value = followupId;
    document.getElementById('editFollowupType').value = followup.type;
    document.getElementById('editFollowupDate').value = followup.date;
    document.getElementById('editFollowupTime').value = followup.time;
    document.getElementById('editFollowupNotes').value = followup.notes || '';
    document.getElementById('editFollowupReminder').checked = followup.reminder;
    document.getElementById('editFollowupLocation').value = followup.location || '';
    
    toggleEditFollowupLocationField();
    showModal('editFollowupModal');
}

        function toggleEditFollowupLocationField() {
            const type = document.getElementById('editFollowupType').value;
            const locationGroup = document.getElementById('editFollowupLocationGroup');
            
            if (type === 'viewing' || type === 'meeting') {
                locationGroup.style.display = 'block';
                document.getElementById('editFollowupLocation').required = true;
            } else {
                locationGroup.style.display = 'none';
                document.getElementById('editFollowupLocation').required = false;
            }
        }

// دالة حذف المتابعة (الجديدة)
function deleteFollowup(clientId, followupId) {
    showConfirmModal('تأكيد الحذف', 'هل أنت متأكد من حذف هذه المتابعة؟', 'نعم، قم بالحذف', async () => {
        const clientIndex = clients.findIndex(c => c.id == clientId);
        if (clientIndex === -1) return;

        // --- إلغاء الإشعار المجدول (إذا كان موجوداً) ---
        if (window.Capacitor && Capacitor.isNativePlatform()) {
            const { LocalNotifications } = Capacitor.Plugins;
            const notificationId = parseInt(followupId.replace(/[^0-9]/g, '').slice(-9));
            await LocalNotifications.cancel({ notifications: [{ id: notificationId }] });
        }
        // --- نهاية جزء الإلغاء ---

        const client = clients[clientIndex];
        const updatedFollowups = (client.followups || []).filter(f => f.id !== followupId);

        // ✅ هذا هو الجزء الذي تم إصلاحه بالكامل
        const { data, error } = await supabaseClient
            .from('clients')
            .update({ followups: updatedFollowups }) // تحديث مصفوفة المتابعات
            .eq('id', clientId) // للعميل المحدد فقط
            .select()
            .single();

        if (error) {
            console.error('Error deleting followup:', error);
            showToast('حدث خطأ أثناء حذف المتابعة', 'error');
        } else {
            // تحديث البيانات المحلية بعد نجاح الحذف من قاعدة البيانات
            clients[clientIndex] = data;
            await saveClientsToLocal(clients);
            addOperation('delete_followup', `تم حذف متابعة للعميل: ${client.name}`);
            showToast('تم حذف المتابعة بنجاح', 'success');
            
            // إعادة تحميل واجهة صفحة العميل الشخصية لإظهار التغيير
            if (currentClientId == clientId) {
                viewClientProfile(clientId);
            }
        }
    });
}

// دالة تعديل المتابعة (الجديدة)
async function handleEditFollowup(e) {
    e.preventDefault();
    const clientId = document.getElementById('editFollowupClientId').value;
    const followupId = document.getElementById('editFollowupId').value;
    const clientIndex = clients.findIndex(c => c.id == clientId);
    if (clientIndex === -1) return;

    const client = clients[clientIndex];
    let updatedFollowups = [...(client.followups || [])];
    const followupIndex = updatedFollowups.findIndex(f => f.id == followupId);
    if (followupIndex === -1) return;
    
    updatedFollowups[followupIndex] = {
        ...updatedFollowups[followupIndex],
        type: document.getElementById('editFollowupType').value,
        date: document.getElementById('editFollowupDate').value,
        time: document.getElementById('editFollowupTime').value,
        notes: document.getElementById('editFollowupNotes').value.trim(),
        reminder: document.getElementById('editFollowupReminder').checked,
        location: document.getElementById('editFollowupLocation').value.trim()
    };

    const { data, error } = await supabaseClient.from('clients').update({ followups: updatedFollowups }).eq('id', clientId).select();

    if (error) {
        showToast('حدث خطأ أثناء تعديل المتابعة', 'error');
    } else {
        clients[clientIndex] = data[0];
        addOperation('edit_followup', `تم تعديل متابعة للعميل: ${client.name}`);
        showToast('تم تعديل المتابعة بنجاح', 'success');
        closeModal('editFollowupModal');
        if (currentClientId == clientId) viewClientProfile(clientId);
    }
}

// ✅ النسخة المحدثة لدالة applyFilters
function applyFilters() {
    // جلب قيم الفلاتر من حقول الإدخال
    currentSearchFilters.clientType = document.getElementById('clientTypeFilter').value;
    currentSearchFilters.status = document.getElementById('statusFilter').value;
    
    // ✅ السطر الجديد لجلب قيمة البحث بالاسم والهاتف
    currentSearchFilters.searchTerm = document.getElementById('namePhoneSearchInput').value.trim();

    renderClientsTable(); // إعادة رسم جدول العملاء بالفلترة الجديدة
    updateActiveFiltersDisplay();
}

        function toggleSearchModal() {
            showModal('searchModal');
            
            // Populate current filters
            document.getElementById('searchBudgetFilter').value = currentSearchFilters.budget;
            document.getElementById('searchLocationFilter').value = currentSearchFilters.location;
        }

        function handleSearch(e) {
            e.preventDefault();
            
            currentSearchFilters.budget = document.getElementById('searchBudgetFilter').value.trim();
            currentSearchFilters.location = document.getElementById('searchLocationFilter').value.trim();
            
            renderClientsTable();
            updateActiveFiltersDisplay();
            closeModal('searchModal');
            showToast('تم تطبيق البحث بنجاح', 'success');
        }

        function resetSearchForm() {
            document.getElementById('searchBudgetFilter').value = '';
            document.getElementById('searchLocationFilter').value = '';
        }

        function updateActiveFiltersDisplay() {
            const display = document.getElementById('activeFiltersDisplay');
            const text = document.getElementById('activeFiltersText');
            
            const activeFilters = [];
            
            if (currentSearchFilters.clientType !== 'all') {
                const typeText = {
                    'buyer': 'طالبي الوحدات',
                    'seller': 'عارضي الوحدات',
                    'featured': 'العملاء المميزون'
                };
                activeFilters.push(`النوع: ${typeText[currentSearchFilters.clientType]}`);
            }
            
            if (currentSearchFilters.status !== 'all') {
                activeFilters.push(`الحالة: ${getStatusText(currentSearchFilters.status)}`);
            }
            
            if (currentSearchFilters.budget) {
                activeFilters.push(`الميزانية: ${currentSearchFilters.budget}`);
            }
            
            if (currentSearchFilters.location) {
                activeFilters.push(`المنطقة: ${currentSearchFilters.location}`);
            }
            
            if (activeFilters.length > 0) {
                text.textContent = `الفلاتر النشطة: ${activeFilters.join(' • ')}`;
                display.style.display = 'flex';
            } else {
                display.style.display = 'none';
            }
        }
// ✅ استخدم هذه الدالة الجديدة لكل الخانات الرقمية
function formatAndConvertNumberInput(input) {
    // 1. قم بتحويل أي أرقام عربية إلى إنجليزية أولاً
    let value = convertArabicNumerals(input.value);

    // 2. قم بإزالة أي حرف ليس رقمًا إنجليزيًا (0-9)
    value = value.replace(/[^0-9]/g, '');
    
    // 3. إضافة الفواصل كل 3 أرقام (للميزانية والسعر)
    if (value) {
        value = value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    
    input.value = value;
}

// ✅ النسخة المحدثة لدالة clearFilters
function clearFilters() {
    currentSearchFilters = {
        clientType: 'all',
        status: 'all',
        budget: '',
        location: '',
        searchTerm: '' // ✅ إضافة مسح مصطلح البحث
    };
    
    // مسح قيم حقول الإدخال في الواجهة
    document.getElementById('clientTypeFilter').value = 'all';
    document.getElementById('statusFilter').value = 'all';
    document.getElementById('namePhoneSearchInput').value = ''; // ✅ إضافة مسح حقل البحث

    renderClientsTable();
    updateActiveFiltersDisplay();
    showToast('تم مسح جميع الفلاتر', 'success');
}

function toggleProfileCommissionVisibility() {
    // تم تغيير === إلى == للسماح بمقارنة الرقم مع النص
    const client = clients.find(c => c.id == currentClientId); 
    if (!client || !client.commission) return;
    
    const display = document.getElementById('commissionDisplay');
    const toggle = document.getElementById('profileCommissionToggle');
    
    if (display.textContent === '••••••') {
        display.textContent = client.commission;
        toggle.className = 'fas fa-eye-slash';
    } else {
        display.textContent = '••••••';
        toggle.className = 'fas fa-eye';
    }
}

// ✅ أضف هذه الدالة الجديدة بالكامل
function handleNotificationClick(notificationId) {
    const notification = notifications.find(n => n.id == notificationId);
    if (!notification) return;

    // 1. قم بتمييز الإشعار كمقروء
    markNotificationRead(notificationId);

    // 2. إذا كان الإشعار مرتبطًا بعميل، انتقل إلى صفحته
    if (notification.client_id) {
        // ابحث عن العميل في القائمة وانتقل إليه
        const clientExists = clients.some(c => c.id == notification.client_id);
        if (clientExists) {
            viewClientProfile(notification.client_id);
        } else {
            showToast('لم يعد هذا العميل موجودًا.', 'warning');
        }
    }

    // 3. أغلق لوحة الإشعارات لتحسين تجربة المستخدم
    document.getElementById('notificationsPanel').classList.remove('show');
}
/**
 * ===============================================
 * == START: Broker Collaboration Functions ==
 * ===============================================
 */

function showBrokerModal() {
    // 1. مسح النموذج بالكامل أولاً لضمان عدم وجود بيانات قديمة
    document.getElementById('brokerForm').reset();
    
    // 2. إعادة تهيئة حقول أرقام الهاتف مع حقل فارغ واحد
    const phoneContainer = document.getElementById('brokerPhoneNumbers');
    phoneContainer.innerHTML = `
        <div class="phone-input-group">
            <input type="tel" class="form-input" placeholder="رقم هاتف الوسيط" value="+20" oninput="formatPhoneInput(this)">
            <button type="button" class="btn btn-danger btn-sm" onclick="removeBrokerPhoneInput(this)">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

    // 3. فتح النافذة العائمة
    showModal('brokerModal');
}

async function handleSaveBroker(event) {
    event.preventDefault();
    if (!currentClientId) return;

    const brokerData = {
        name: document.getElementById('brokerName').value.trim(),
        phones: Array.from(document.querySelectorAll('#brokerPhoneNumbers input[type="tel"]')).map(input => input.value.trim()).filter(Boolean),
        report: document.getElementById('brokerReport').value.trim(),
        id: generateId() // ✅ مهم: إضافة معرف فريد لكل وسيط
    };

    if (!brokerData.name || brokerData.phones.length === 0) {
        return showToast('يجب إدخال اسم ورقم هاتف الوسيط على الأقل', 'error');
    }

    const client = clients.find(c => c.id == currentClientId);
    if (!client) return;

    // ✅ الخطوة الحاسمة: إدخال العنصر الجديد إلى المصفوفة الموجودة
    const updatedBrokers = [...(client.brokerCollaboration || []), brokerData];

    const { data, error } = await supabaseClient
        .from('clients')
        .update({ brokerCollaboration: updatedBrokers })
        .eq('id', currentClientId)
        .select()
        .single();
    
    if (error) {
        showToast('حدث خطأ أثناء حفظ بيانات التعاون', 'error');
        console.error('Error saving broker data:', error);
    } else {
        const clientIndex = clients.findIndex(c => c.id == currentClientId);
        if (clientIndex !== -1) clients[clientIndex] = data;
        await saveClientsToLocal(clients);
        
        showToast('تم حفظ بيانات التعاون بنجاح', 'success');
        closeModal('brokerModal');
        viewClientProfile(currentClientId);
    }
}

// تضيف حقل هاتف جديد في نافذة الوسيط
function addBrokerPhoneInput() {
    const container = document.getElementById('brokerPhoneNumbers');
    const div = document.createElement('div');
    div.className = 'phone-input-group';
    div.innerHTML = `
        <input type="tel" class="form-input" placeholder="رقم هاتف إضافي" value="+" oninput="formatPhoneInput(this)">
        <button type="button" class="btn btn-danger btn-sm" onclick="removeBrokerPhoneInput(this)">
            <i class="fas fa-trash"></i>
        </button>
    `;
    container.appendChild(div);
}

// تزيل حقل هاتف في نافذة الوسيط
function removeBrokerPhoneInput(button) {
    const container = document.getElementById('brokerPhoneNumbers');
    if (container.children.length > 1) {
        button.parentElement.remove();
    } else {
        showToast('يجب الاحتفاظ برقم واحد على الأقل', 'warning');
    }
}

function handleBrokerCall(brokerId) {
    const client = clients.find(c => c.id == currentClientId);
    const broker = client?.brokerCollaboration?.find(b => b.id == brokerId);
    if (!broker || !broker.phones || broker.phones.length === 0) return;

    if (broker.phones.length > 1) {
        showPhoneSelectionModal(broker, 'call');
    } else {
        callClient(broker.phones[0]);
    }
}

// ✅ هذه هي الدالة الصحيحة التي يجب أن تبقى:
function handleBrokerWhatsapp(brokerId) {
    const client = clients.find(c => c.id == currentClientId);
    const broker = client?.brokerCollaboration?.find(b => b.id == brokerId);
    if (!broker || !broker.phones || broker.phones.length === 0) return;

    if (broker.phones.length > 1) {
        showPhoneSelectionModal(broker, 'whatsapp');
    } else {
        whatsappClient(broker.phones[0]);
    }
}

// تظهر نافذة اختيار الرقم (للوكيل)
function showBrokerPhoneSelectionModal(action) {
    const client = clients.find(c => c.id == currentClientId);
    const broker = client?.brokerCollaboration;
    if (!broker) return;

    const actionText = action === 'call' ? 'الاتصال' : 'إرسال رسالة واتساب';
    const actionIcon = action === 'call' ? 'fa-phone' : 'fab fa-whatsapp';
    
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.style.zIndex = '2001'; 

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header"><h3 class="modal-title">اختيار رقم الوسيط</h3><button class="modal-close" onclick="this.closest('.modal').remove()"><i class="fas fa-times"></i></button></div>
            <div style="padding: 0 24px 24px;">
                <p style="margin-bottom: 20px;">اختر الرقم لـ ${actionText} عليه للوسيط <strong>${broker.name}</strong>:</p>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${broker.phones.map((phone, index) => `
                        <button class="btn btn-secondary" onclick="executePhoneAction('${phone}', '${action}'); this.closest('.modal').remove();">
                            <i class="fas ${actionIcon}" style="margin-left: 12px;"></i>
                            <span>${phone}</span>
                            ${index === 0 ? '<span style="margin-right: auto; font-size: 0.75rem;">(الرئيسي)</span>' : ''}
                        </button>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
/**
 * ✅ دالة جديدة: لمسح الوسيط من صفحته الشخصية مباشرة.
 */
function handleDeleteBrokerFromProfile() {
    // نستدعي نفس الدالة القديمة ولكن من مكان مختلف
    handleDeleteBroker();
}
/**
 * ===============================================
 * == START: Client Share Functions ==
 * ===============================================
 */

// دالة وسيطة للمشاركة من صفحة العميل الشخصية
function handleShareClientFromProfile() {
    if (currentClientId) {
        handleShareClient(currentClientId);
    }
}

// الدالة الرئيسية التي تجهز النص وتشاركه
async function handleShareClient(clientId) {
    const client = clients.find(c => c.id == clientId);
    if (!client) return showToast('لم يتم العثور على العميل', 'error');

    let shareText = '';
    if (client.type === 'buyer') {
        shareText = generateBuyerShareText(client);
    } else if (client.type === 'seller') {
        shareText = generateSellerShareText(client);
    }

    if (shareText) {
        await shareOrCopyText(shareText);
    } else {
        showToast('لا توجد بيانات كافية للمشاركة', 'warning');
    }
}

// دالة إنشاء نص المشاركة لـ "طالب الوحدة"
function generateBuyerShareText(client) {
    const data = client.buyerData;
    if (!data || !data.budget || !data.location) return '';

    const unitType = getUnitTypeText(data.unitType) || 'وحدة';
    
    // بناء النص سطر بسطر
    let textLines = [];
    textLines.push(`مطلوب ${unitType} بادجت *${data.budget}* ✨`);
    textLines.push(`* مناطق *${data.location}*.`);
    
    // إضافة الأدوار فقط إذا كانت موجودة وليست "0"
    if (data.floors && data.floors.trim() !== '0' && data.floors.trim() !== '') {
        textLines.push(`* الادوار *${data.floors}*`);
    }

    return textLines.join('\n'); // \n تعني سطر جديد
}

function generateSellerShareText(client) {
    const data = client.sellerData;
    if (!data || !data.price || !data.location) return '';

    const unitType = getUnitTypeText(data.unitType) || 'وحدة';
    const commissionText = data.commission ? ` + ${data.commission} نسبة` : '';

    let textLines = [];

    // السطر الأول: نوع الوحدة، المساحة، والموقع
    const firstLine = `*${unitType} للبيع ${data.area || ''} متر – ${data.location || ''}* ✨`;
    textLines.push(firstLine);

    // السطر الثاني: التفاصيل الإضافية بين قوسين
    if (data.details) {
        textLines.push(`(${data.details})`);
    }

    // إضافة الحقول الرئيسية بشكل منسق
    if (data.rooms) textLines.push(`- عدد الغرف: ${data.rooms}`);
    if (data.bathrooms) textLines.push(`- عدد الحمامات: ${data.bathrooms}`);
    if (data.kitchens) textLines.push(`- عدد المطابخ: ${data.kitchens}`);
    if (data.elevators) textLines.push(`- عدد المصاعد: ${data.elevators}`);
    if (data.floors) textLines.push(`- الدور: ${data.floors}`);

    // إضافة حالة الترخيص
    const licensedText = data.licensed === 'yes' ? 'مرخصة' : 'غير مرخصة';
    textLines.push(`- ${licensedText}`);

    // إضافة العدادات
    const metersText = data.meters ? `- العدادات: ${data.meters}` : '';
    if (metersText) {
        textLines.push(metersText);
    }

    // السطر الأخير: السعر والعمولة
    const lastLine = `مطلوب: *${data.price} جنيه${commissionText}*`;
    textLines.push(lastLine);

    return textLines.join('\n');
}

// الدالة الذكية التي تستخدم المشاركة الأصلية أو تقوم بالنسخ
async function shareOrCopyText(text) {
    if (navigator.share) { // هل المتصفح (خاصة الموبايل) يدعم المشاركة؟
        try {
            await navigator.share({
                title: 'تفاصيل وحدة',
                text: text,
            });
            showToast('تمت المشاركة بنجاح!', 'success');
        } catch (error) {
            console.log('Error sharing', error);
        }
    } else { // للمتصفحات التي لا تدعم المشاركة (مثل جوجل كروم على الكمبيوتر)
        try {
            await navigator.clipboard.writeText(text);
            showToast('تم نسخ التفاصيل إلى الحافظة!', 'success');
        } catch (error) {
            showToast('فشل النسخ إلى الحافظة', 'error');
            console.error('Failed to copy: ', error);
        }
    }
}

/**
 * ===============================================
 * == END: Client Share Functions ==
 * ===============================================
 */
// ===============================================
// == START: دوال الملف الشخصي للمستخدم
// ===============================================

/**
 * جلب بيانات المستخدم الحالي من Supabase وعرضها.
 */
async function loadUserProfile() {
    const { data: { user } } = await supabaseClient.auth.getUser();

    if (user) {
        currentUser = user; // تخزين بيانات المستخدم في المتغير العام
        displayUserData(); // استدعاء دالة العرض في الواجهة
    } else {
        console.warn("User not logged in.");
    }
}

/**
 * عرض بيانات المستخدم في حقول النموذج ورسالة الترحيب.
 */
function displayUserData() {
    if (!currentUser) return;

    // 1. تحديث رسالة الترحيب
    const welcomeUserNameElem = document.getElementById('welcomeUserName');
    if (welcomeUserNameElem) {
        welcomeUserNameElem.textContent = currentUser.user_metadata.full_name || 'مرحباً بك';
    }

    // 2. ملء حقول صفحة الملف الشخصي
    const profileNameInput = document.getElementById('profileName');
    if (profileNameInput) {
        profileNameInput.value = currentUser.user_metadata.full_name || '';
    }
    
    const profileEmailInput = document.getElementById('profileEmail');
    if (profileEmailInput) {
        profileEmailInput.value = currentUser.email || '';
    }
}

/**
 * تنفيذ عملية تحديث بيانات المستخدم في Supabase.
 */
async function handleProfileUpdate(event) {
    event.preventDefault(); // منع إعادة تحميل الصفحة

    const name = document.getElementById('profileName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    const password = document.getElementById('profilePassword').value;
    const confirmPassword = document.getElementById('profileConfirmPassword').value;

    let changesMade = false;

    // 1. تحديث الاسم (إذا تم تغييره)
    if (name && name !== currentUser.user_metadata.full_name) {
        const { error } = await supabaseClient.auth.updateUser({ data: { full_name: name } });
        if (error) {
            showToast(`خطأ في تحديث الاسم: ${error.message}`, 'error');
            return;
        }
        showToast('تم تحديث الاسم بنجاح', 'success');
        changesMade = true;
    }

    // 2. تحديث كلمة المرور (إذا تم إدخالها)
    if (password) {
        if (password.length < 6) {
            showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
            return;
        }
        if (password !== confirmPassword) {
            showToast('كلمتا المرور غير متطابقتين', 'error');
            return;
        }
        
        const { error } = await supabaseClient.auth.updateUser({ password });
        if (error) {
            showToast(`خطأ في تحديث كلمة المرور: ${error.message}`, 'error');
            return;
        }
        showToast('تم تحديث كلمة المرور بنجاح', 'success');
        changesMade = true;
    }

    // 3. تحديث البريد الإلكتروني (إذا تم تغييره)
    if (email && email !== currentUser.email) {
        // ✅ هذا هو الجزء الحرج: Supabase الآن ترسل رابط تأكيد
        const { data, error } = await supabaseClient.auth.updateUser({ email });
        
        if (error) {
            showToast(`خطأ في تحديث الإيميل: ${error.message}`, 'error');
            return;
        }
        
        // إذا كان هناك بيانات، فهذا يعني أن التحديث قد تم بالفعل (أو لم يكن هناك تغيير)
        // أما إذا كان الـ 'user' في البيانات 'null'، فهذا يعني أن Supabase أرسلت إيميل تأكيد
        if (data.user?.email !== email) {
            showToast('تم إرسال رابط تأكيد إلى بريدك الإلكتروني الجديد. يرجى مراجعة بريدك لإتمام التغيير.', 'info');
        } else {
            showToast('تم تحديث البريد الإلكتروني بنجاح', 'success');
        }
        
        changesMade = true;
    }

    if (changesMade) {
        await loadUserProfile(); // إعادة تحميل البيانات لعرضها محدثة
        setTimeout(() => {
            switchSection('dashboard');
        }, 3000); // تأخير لتظهر الرسالة للمستخدم
    } else {
        showToast('لم تقم بإجراء أي تغييرات', 'info');
    }

    // مسح حقول كلمة المرور في كل الحالات
    document.getElementById('profilePassword').value = '';
    document.getElementById('profileConfirmPassword').value = '';
}

// ===============================================
// ==  END: دوال الملف الشخصي للمستخدم
// ===============================================
// Enhanced button interactions with ripple effect
function createRipple(event) {
    const button = event.currentTarget;
    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.offsetLeft - radius}px`;
    circle.style.top = `${event.clientY - button.offsetTop - radius}px`;
    circle.classList.add("ripple");

    const ripple = button.getElementsByClassName("ripple")[0];
    if (ripple) {
        ripple.remove();
    }

    button.appendChild(circle);
}