package com.hamsa.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.*;
import android.widget.EditText;
import android.widget.Toast;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    WebView w;
    SharedPreferences sp;
    ValueCallback<Uri[]> fcb;
    PermissionRequest pending;
    String host = "", base = "";
    // ضع هنا رابط السيرفر ليفتح التطبيق مباشرة عند كل المستخدمين بدون أي إدخال
    static final String DEFAULT_URL = "";
    static final int FC = 1, PERM = 2;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = getSharedPreferences("h", 0);
        if (android.os.Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 3);
        w = new WebView(this);
        w.setBackgroundColor(0xFF0B1220);
        setContentView(w);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        w.addJavascriptInterface(new Object() {
            @JavascriptInterface public void save(String n, String m, String d) { saveFile(n, m, d); }
            @JavascriptInterface public void auth(String tok) {
                sp.edit().putString("tok", tok).putString("base", base).apply();
                FcmService.register(MainActivity.this);
            }
        }, "Android");
        w.setWebViewClient(new WebViewClient() {
            @Override public void onReceivedSslError(WebView v, SslErrorHandler h, SslError e) {
                // يقبل الشهادة الذاتية لعنوان سيرفرك فقط
                if (host.equals(Uri.parse(e.getUrl()).getHost())) h.proceed(); else h.cancel();
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) failed();
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest r) { runOnUiThread(() -> askPerm(r)); }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fcb != null) fcb.onReceiveValue(null);
                fcb = cb;
                try { startActivityForResult(p.createIntent(), FC); }
                catch (Exception e) { fcb = null; return false; }
                return true;
            }
        });
        String u = DEFAULT_URL.isEmpty() ? sp.getString("url", null) : DEFAULT_URL;
        if (u == null) ask(); else open(u);
    }

    void ask() {
        EditText t = new EditText(this);
        t.setHint("https://xxxx.trycloudflare.com");
        t.setText(sp.getString("url", ""));
        t.setSingleLine(true);
        new AlertDialog.Builder(this).setTitle("عنوان سيرفر همسة").setView(t).setCancelable(false)
            .setPositiveButton("اتصال", (d, i) -> {
                String u = t.getText().toString().trim();
                if (u.isEmpty()) { ask(); return; }
                if (!u.startsWith("http")) u = "https://" + u;
                while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
                sp.edit().putString("url", u).apply();
                open(u);
            }).show();
    }

    void failed() {
        if (!DEFAULT_URL.isEmpty()) {
            Toast.makeText(this, "السيرفر يستيقظ... لحظات", Toast.LENGTH_SHORT).show();
            w.postDelayed(() -> w.reload(), 5000);
            return;
        }
        new AlertDialog.Builder(this).setTitle("تعذّر الاتصال بالسيرفر")
            .setMessage("تأكد أن السيرفر شغّال وأن العنوان صحيح.")
            .setPositiveButton("إعادة المحاولة", (d, i) -> w.reload())
            .setNegativeButton("تغيير العنوان", (d, i) -> ask()).show();
    }

    void open(String u) {
        host = Uri.parse(u).getHost();
        base = u;
        w.loadUrl(u);
        checkUpdate(u);
    }

    // يسأل السيرفر عن رقم نسخة التطبيق (apk) ويعرض نافذة تحديث إن كان أحدث
    void checkUpdate(String base) {
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(base + "/api/hint").openConnection();
                c.setConnectTimeout(5000); c.setReadTimeout(5000);
                InputStream in = c.getInputStream();
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[1024]; int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                String body = bo.toString("UTF-8");
                Matcher m = Pattern.compile("\"apk\":(\\d+)").matcher(body);
                int mine = (int) getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode();
                if (m.find() && Integer.parseInt(m.group(1)) > mine)
                    runOnUiThread(() -> new AlertDialog.Builder(this).setTitle("يوجد تحديث جديد")
                        .setMessage("نسخة أحدث من التطبيق جاهزة.")
                        .setPositiveButton("تحديث", (d, i) -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(base + "/app.apk"))))
                        .setNegativeButton("لاحقاً", null).show());
            } catch (Exception ignored) {}
        }).start();
    }

    void askPerm(PermissionRequest r) {
        List<String> need = new ArrayList<>();
        for (String x : r.getResources()) {
            if (x.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != 0) need.add(Manifest.permission.RECORD_AUDIO);
            if (x.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE) && checkSelfPermission(Manifest.permission.CAMERA) != 0) need.add(Manifest.permission.CAMERA);
        }
        if (need.isEmpty()) r.grant(r.getResources());
        else { pending = r; requestPermissions(need.toArray(new String[0]), PERM); }
    }

    @Override public void onRequestPermissionsResult(int c, String[] p, int[] g) {
        if (pending != null) { pending.grant(pending.getResources()); pending = null; }
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == FC && fcb != null) {
            fcb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fcb = null;
        }
    }

    void saveFile(String name, String mime, String d) {
        try {
            byte[] bytes = Base64.decode(d.substring(d.indexOf(',') + 1), Base64.DEFAULT);
            ContentValues v = new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME, name.isEmpty() ? "file" : name);
            v.put(MediaStore.Downloads.MIME_TYPE, mime.isEmpty() ? "application/octet-stream" : mime);
            Uri u = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            try (OutputStream o = getContentResolver().openOutputStream(u)) { o.write(bytes); }
            runOnUiThread(() -> Toast.makeText(this, "تم الحفظ في التنزيلات", Toast.LENGTH_SHORT).show());
        } catch (Exception e) {
            runOnUiThread(() -> Toast.makeText(this, "فشل الحفظ", Toast.LENGTH_SHORT).show());
        }
    }

    @Override protected void onPause() { super.onPause(); w.evaluateJavascript("window.setFg&&setFg(0)", null); }
    @Override protected void onResume() { super.onResume(); w.evaluateJavascript("window.setFg&&setFg(1)", null); }

    @Override public void onBackPressed() {
        w.evaluateJavascript("window.hBack?window.hBack():false", v -> { if (!"true".equals(v)) moveTaskToBack(true); });
    }
}
