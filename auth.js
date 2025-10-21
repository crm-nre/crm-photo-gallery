// دالة جديدة لإظهار إشعارات احترافية
function showAuthToast(message, type = 'info') {
    // حذف أي إشعار قديم
    const existingToast = document.querySelector('.auth-toast');
    if (existingToast) {
        existingToast.remove();
    }

    // تحديد الأيقونة واللون بناءً على النوع
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
    
    // إنشاء عنصر الإشعار
    const toast = document.createElement('div');
    toast.className = `auth-toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${icons[type]} toast-icon"></i>
        <div class="toast-message">${message}</div>
    `;

    document.body.appendChild(toast);
    
    // إظهار الإشعار
    setTimeout(() => toast.classList.add('show'), 100);

    // إخفاء الإشعار بعد 4 ثوانٍ
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// ==========================================================
// ==          الكود الكامل لملف auth.js                  ==
// ==========================================================

// 1. معلومات الاتصال بقاعدة بيانات Supabase
const SUPABASE_URL = 'https://vkzhkvwdmayzrknuxrlw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZremhrdndkbWF5enJrbnV4cmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MzMxMTEsImV4cCI6MjA3MDQwOTExMX0.QvXV5kB6OaOFM6R_PnFj8_yQ7EA58sSaBHFQeITuSsk'; // ❗❗❗ استبدل هذا بمفتاحك الصحيح
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// 2. الانتظار حتى يتم تحميل الصفحة بالكامل ثم ربط الأزرار
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');

    // 3. ربط وظيفة تسجيل الدخول عند الضغط على زر "تسجيل الدخول"
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // منع الفورم من إعادة تحميل الصفحة
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        // إرسال البيانات إلى Supabase للتحقق منها
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            // في حالة وجود خطأ (مثل كلمة مرور خاطئة)
            alert('خطأ في تسجيل الدخول: ' + error.message);
        } else {
            // في حالة النجاح، قم بتوجيه المستخدم إلى لوحة التحكم
            window.location.href = 'dashboard.html';
        }
    });

    // 4. ربط وظيفة استعادة كلمة السر عند الضغط على رابط "نسيت كلمة السر"
    forgotPasswordLink.addEventListener('click', async (event) => {
        event.preventDefault();
        const email = document.getElementById('loginEmail').value;

        if (!email) {
            return alert('يرجى إدخال بريدك الإلكتروني أولاً في حقل الإيميل.');
        }

        // إرسال طلب إلى Supabase لإرسال إيميل استعادة كلمة السر
        const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            // ✅ هذا هو السطر الذي يربط العملية بملف update-password.html
            redirectTo: window.location.origin + '/update-password.html',
        });

        if (error) {
            alert('خطأ: ' + error.message);
        } else {
            alert('تم إرسال رابط إعادة تعيين كلمة السر إلى بريدك الإلكتروني.');
        }
    });
});