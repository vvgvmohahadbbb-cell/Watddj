package com.hamsa.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

public class FcmService extends FirebaseMessagingService {
    static final String CH = "msgs";

    @Override public void onMessageReceived(RemoteMessage m) {
        Map<String, String> d = m.getData();
        show(this, d.get("title"), d.get("body"), d.get("tag"));
    }

    @Override public void onNewToken(String t) {
        getSharedPreferences("h", 0).edit().putString("fcm", t).apply();
        send(this);
    }

    static void show(Context c, String title, String body, String tag) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CH, "الرسائل", NotificationManager.IMPORTANCE_HIGH));
        Intent i = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(c, CH)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title == null ? "همسة" : title)
            .setContentText(body == null ? "" : body)
            .setAutoCancel(true).setContentIntent(pi).build();
        nm.notify(tag == null ? 0 : tag.hashCode(), n);
    }

    // يطلب رمز الإشعارات من Firebase ويرسله للسيرفر (لا يعمل بدون google-services.json)
    static void register(Context c) {
        try {
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(t -> {
                c.getSharedPreferences("h", 0).edit().putString("fcm", t).apply();
                send(c);
            });
        } catch (Throwable ignored) {}
    }

    static void send(Context c) {
        new Thread(() -> {
            try {
                SharedPreferences sp = c.getSharedPreferences("h", 0);
                String base = sp.getString("base", null), tok = sp.getString("tok", null), f = sp.getString("fcm", null);
                if (base == null || tok == null || f == null) return;
                HttpURLConnection h = (HttpURLConnection) new URL(base + "/api/push").openConnection();
                h.setRequestMethod("POST"); h.setDoOutput(true);
                h.setRequestProperty("content-type", "application/json");
                try (OutputStream o = h.getOutputStream()) {
                    o.write(("{\"tok\":\"" + tok + "\",\"fcm\":\"" + f + "\"}").getBytes("UTF-8"));
                }
                h.getResponseCode();
            } catch (Exception ignored) {}
        }).start();
    }
}
