/* Copyright (c) 2026 ExTerm Labs. All Rights Reserved. Free for personal, non-commercial use. Copying, modifying, reverse-engineering, cloning, or redistributing source or derivative works without express written permission from ExTerm Labs is strictly prohibited. */
package com.exterm.app;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import android.view.View;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * ExTerm v17.6 for Android: the same single-file workstation, served from the APK's assets on a secure
 * https origin (so IndexedDB, localStorage and WebCrypto all work), with wallet / DEX deep links handed to
 * the installed apps, and Picture-in-Picture when the user leaves the app.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/index.html";
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#07080B"));
        w.setNavigationBarColor(Color.parseColor("#07080B"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#07080B"));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " ExTermAndroid/17.6");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath() == null || "/".equals(u.getPath()) ? "/index.html" : u.getPath();
                try {
                    InputStream in = getAssets().open("www" + path);
                    Map<String, String> h = new HashMap<>();
                    h.put("Cache-Control", "no-cache");
                    h.put("X-Content-Type-Options", "nosniff");
                    h.put("Referrer-Policy", "no-referrer");
                    return new WebResourceResponse(mime(path), "utf-8", 200, "OK", h, in);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* no app for this link */ }
                return true;
            }
        });
        setContentView(web);
        if (state != null) web.restoreState(state); else web.loadUrl(HOME);
    }

    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }

    @Override
    protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); if (web != null) web.saveState(out); }

    @Override
    public void onBackPressed() { if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }

    /** Android Picture-in-Picture: leaving the app keeps the live chart floating. */
    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try { enterPictureInPictureMode(new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).build()); } catch (Exception e) { /* PiP disabled by the user */ }
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean pip, Configuration cfg) {
        super.onPictureInPictureModeChanged(pip, cfg);
        if (web != null) web.evaluateJavascript("document.body&&document.body.classList.toggle('x17-pip'," + pip + ")", null);
    }

    @Override
    protected void onDestroy() { if (web != null) { web.destroy(); web = null; } super.onDestroy(); }
}
