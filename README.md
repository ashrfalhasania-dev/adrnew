# ADR Pro — تطبيق الهاتف (v2)

React Native + Expo (SDK 57) + TypeScript، مربوط بمشروع Supabase الخاص بـ v2 فقط
(`vmlizevbfssqmcpknobe`) — لا يتصل بالنظام القديم أبداً.

## بناء APK
شغّل `BUILD_APK.bat` (يحتاج Node.js وحساب Expo مجاني من expo.dev).

## للمطوّر
```
npm install
npx tsc --noEmit        # فحص الأنواع
npx expo start          # تشغيل للتطوير (يحتاج development build)
```

- الكود المشترك مع البرنامج المكتبي: `../app/shared` (الصلاحيات، الحالات) — عبر `@shared/*`.
- تسجيل الدخول: نفس اسم المستخدم وكلمة المرور؛ البريد الداخلي مشتق من اسم المستخدم
  (`src/lib/auth.ts` ↔ `public.staff_login_email()` في قاعدة البيانات).
- كل جداول القاعدة مغلقة أمام التطبيق؛ الوصول فقط عبر دوال `app_*` المحمية.
