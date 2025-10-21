// هذا الملف (background.js) سيعمل بشكل منفصل في الخلفية

// استيراد مكتبة Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

// تعريف دوال المساعدة لترجمة أنواع المتابعة
function getFollowupTypeText(type) {
    const typeMap = { 'call': 'مكالمة هاتفية', 'meeting': 'اجتماع', 'viewing': 'معاينة', 'whatsapp': 'رسالة واتساب' };
    return typeMap[type] || type;
}

// الدالة الرئيسية التي سيتم استدعاؤها في الخلفية
const performBackgroundTask = async () => {
    console.log('Background task is running...');
    
    // **مهم جدًا:** يجب إنشاء اتصال جديد بـ Supabase لأن هذا الكود معزول
    const SUPABASE_URL = 'https://vkzhkvwdmayzrknuxrlw.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZremhrdndkbWF5enJrbnV4cmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ4MzMxMTEsImV4cCI6MjA3MDQwOTExMX0.QvXV5kB6OaOFM6R_PnFj8_yQ7EA58sSaBHFQeITuSsk';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // جلب كل العملاء من قاعدة البيانات
    const { data: clients, error: clientsError } = await supabase.from('clients').select('*');
    if (clientsError || !clients) {
        console.error('Background task: Error fetching clients', clientsError);
        return;
    }

    const { LocalNotifications } = Capacitor.Plugins;
    const now = new Date();

    // نفس منطق دالة checkDueNotifications
    for (const client of clients) {
        if (!client.followups || client.followups.length === 0) continue;

        let followupsModified = false;
        for (const followup of client.followups) {
            if (!followup.date || !followup.time) continue;
            const followupDateTime = new Date(`${followup.date}T${followup.time}`);

            if (followup.reminder && !followup.notified && followupDateTime <= now) {
                const notificationObject = {
                    title: `تذكير: ${getFollowupTypeText(followup.type)}`,
                    message: `لديك موعد الآن مع العميل: ${client.name}`,
                    created_at: new Date().toISOString(),
                    type: 'reminder',
                    read: false,
                    client_id: client.id,
                    followup_id: followup.id
                };

                const { data: newDbNotification, error: insertError } = await supabase.from('notifications').insert([notificationObject]).select().single();

                if (!insertError && newDbNotification) {
await LocalNotifications.schedule({
    notifications: [{
        title: newDbNotification.title,
        body: newDbNotification.message,
        id: newDbNotification.id,
        schedule: { at: new Date(Date.now() + 1000) },
        channelId: 'crm_reminders_channel',
        extra: { clientId: client.id },
        smallIcon: 'ic_notification_logo', // <-- 1. اسم الأيقونة الجديدة (بدون .png)
        color: '#ffffffff' // <-- 2. لون الأيقونة (استخدمت اللون الأساسي من CSS لديك)
    }]
});
                    followup.notified = true;
                    followupsModified = true;
                }
            }
        }

        if (followupsModified) {
            await supabase.from('clients').update({ followups: client.followups }).eq('id', client.id);
        }
    }
    console.log('Background task finished.');
};

// تسجيل المستمع للمهمة
self.addEventListener('backgroundtask', () => {
    const taskId = 'checkRemindersTask'; // يجب أن يكون نفس المعرف المستخدم في التطبيق الرئيسي
    const task = BackgroundTask.beforeExit(async () => {
        await performBackgroundTask();
        task.finish();
    });
});