package app.flashcards.offline;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Shows the bundled Flashcards Offline web app full screen.
 *
 * The page is served from the app's own assets under https://appassets.androidplatform.net,
 * so it has a real origin (IndexedDB needs one) and never needs network access.
 * Navigation is restricted to the HTTPS app-assets path. The only native method exposed
 * to the page is AndroidBridge.shareText, used to export a JSON backup through Android's share sheet.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + HOST + "/assets/www/index.html";
    private static final int FILE_CHOOSER_REQUEST = 4101;
    private static final int MAX_EXPORT_CHARS = 5 * 1024 * 1024;

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private ValueCallback<Uri[]> pendingFileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setGeolocationEnabled(false);
        settings.setSupportMultipleWindows(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Permit only the HTTPS origin and asset path that serve the bundled app.
                Uri target = request.getUrl();
                return !"https".equals(target.getScheme())
                        || !HOST.equals(target.getHost())
                        || target.getPath() == null
                        || !target.getPath().startsWith("/assets/");
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (pendingFileCallback != null) {
                    pendingFileCallback.onReceiveValue(null);
                }
                pendingFileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (IllegalArgumentException e) {
                    pendingFileCallback.onReceiveValue(null);
                    pendingFileCallback = null;
                    return false;
                }
                return true;
            }
        });

        webView.addJavascriptInterface(new ExportBridge(), "AndroidBridge");

        setContentView(webView);
        webView.loadUrl(START_URL);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST && pendingFileCallback != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            pendingFileCallback.onReceiveValue(results);
            pendingFileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("AndroidBridge");
            webView.destroy();
        }
        super.onDestroy();
    }

    /** Keeps only letters, digits, dot, underscore and dash, and makes sure the name ends in .json. */
    static String sanitizeFilename(String name) {
        String base = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (base.length() > 80) {
            base = base.substring(0, 80);
        }
        if (base.isEmpty() || base.startsWith(".")) {
            base = "flashcards-backup.json";
        }
        if (!base.toLowerCase().endsWith(".json")) {
            base = base + ".json";
        }
        return base;
    }

    /** The single native method available to the web page. */
    private final class ExportBridge {
        @JavascriptInterface
        public boolean shareText(String filename, String text) {
            if (text == null || text.length() > MAX_EXPORT_CHARS) {
                return false;
            }
            try {
                File dir = new File(getCacheDir(), "exports");
                if (!dir.isDirectory() && !dir.mkdirs()) {
                    return false;
                }
                File file = new File(dir, sanitizeFilename(filename));
                try (OutputStream out = new FileOutputStream(file)) {
                    out.write(text.getBytes(StandardCharsets.UTF_8));
                }
                Uri uri = FileProvider.getUriForFile(
                        MainActivity.this, getPackageName() + ".fileprovider", file);

                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("application/json");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                final Intent chooser = Intent.createChooser(send, "Save backup");

                runOnUiThread(() -> startActivity(chooser));
                return true;
            } catch (IOException | IllegalArgumentException e) {
                return false;
            }
        }
    }
}
