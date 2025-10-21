import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Toast } from '@capacitor/toast';

/** ✅ إرسال إشعار محلي */
export async function sendLocalNotification(title, body) {
  await LocalNotifications.schedule({
    notifications: [{
      title,
      body,
      id: Date.now(),
      schedule: { at: new Date(Date.now() + 1000) },
    }]
  });
}

/** ✅ استيراد ملف */
export async function importFile() {
  const input = document.createElement("input");
  input.type = "file";
  return new Promise((resolve) => {
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/** ✅ حفظ ملف داخل الجهاز */
export async function saveFileToDevice(filename, content) {
  try {
    await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Documents,
      encoding: Encoding.UTF8,
    });
    console.log("✔️ تم الحفظ بنجاح");
  } catch (err) {
    console.error("❌ خطأ أثناء الحفظ", err);
  }
}

/** ✅ فتح واتساب */
export function openWhatsApp(phone, message) {
  const formatted = phone.replace(/\D/g, "");
  const url = `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
}

/** ✅ اتصال هاتفي */
export function makePhoneCall(phone) {
  window.open(`tel:${phone}`, "_self");
}

/** ✅ عرض Toast */
export async function showToast(message) {
  await Toast.show({
    text: message,
    duration: 'short',
    position: 'bottom',
  });
}
