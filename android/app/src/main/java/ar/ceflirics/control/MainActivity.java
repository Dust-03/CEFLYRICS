package ar.ceflirics.control;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

// La app es una cáscara: encuentra la PC y abre la pantalla de control que sirve CEFLYRICS. Así,
// actualizar el programa de la PC actualiza el control sin reinstalar nada.
public class MainActivity extends Activity {
    private static final String START_PAGE = "file:///android_asset/inicio.html";
    private static final String ADDRESS_KEY = "direccion";
    private static final int DEFAULT_PORT = 8787;
    private static final int THREADS = 48;
    private static final int PICK_FILES = 1;

    private WebView web;
    private SharedPreferences preferences;
    private ValueCallback<Uri[]> pickedFiles;

    @Override
    protected void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        // En pleno culto la pantalla no se puede apagar sola.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.parseColor("#0F1420"));
        getWindow().setNavigationBarColor(Color.parseColor("#0F1420"));
        preferences = getSharedPreferences("control", MODE_PRIVATE);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0F1420"));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        web.addJavascriptInterface(new Bridge(), "CefApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Si la PC está apagada o cambió de IP se vuelve a buscarla.
                if (request.isForMainFrame()) view.loadUrl(START_PAGE);
            }
        });
        // "Exportar todo": la copia queda en Descargas, con aviso cuando termina.
        web.setDownloadListener((url, userAgent, disposition, mimeType, length) -> {
            String name = URLUtil.guessFileName(url, disposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                .setTitle(name)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            // Antes de Android 10, la carpeta pública pide un permiso: ahí queda en la de la app.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            } else {
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, name);
            }
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(request);
        });
        // "Subir fotos o videos" abre la galería; "Importar todo", cualquier archivo, de a uno.
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pickedFiles != null) pickedFiles.onReceiveValue(null);
                pickedFiles = callback;
                boolean media = String.join(",", params.getAcceptTypes()).matches("[^.]*(image|video)[^.]*");
                // Con GET_CONTENT algunos celulares ofrecen solo la galería: los archivos van por el explorador.
                Intent intent = new Intent(media ? Intent.ACTION_GET_CONTENT : Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                if (media) intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "image/*", "video/*" });
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(Intent.createChooser(intent, null), PICK_FILES);
                } catch (Exception error) {
                    pickedFiles = null;
                    return false;
                }
                return true;
            }
        });
        setContentView(web);

        String address = preferences.getString(ADDRESS_KEY, null);
        web.loadUrl(address == null ? START_PAGE : controlUrl(address));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != PICK_FILES || pickedFiles == null) return;
        Uri[] files = null;
        if (resultCode == RESULT_OK && data != null) {
            ClipData clip = data.getClipData();
            if (clip != null) {
                files = new Uri[clip.getItemCount()];
                for (int i = 0; i < files.length; i++) files[i] = clip.getItemAt(i).getUri();
            } else if (data.getData() != null) {
                files = new Uri[] { data.getData() };
            }
        }
        pickedFiles.onReceiveValue(files);
        pickedFiles = null;
    }

    @Override
    public void onBackPressed() {
        // Un toque de más no tiene que cerrar el control.
        moveTaskToBack(true);
    }

    private static String controlUrl(String address) {
        return "http://" + address + "/control/";
    }

    private static boolean isCeflyrics(String address) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL("http://" + address + "/api/ceflyrics").openConnection();
            connection.setConnectTimeout(500);
            connection.setReadTimeout(800);
            if (connection.getResponseCode() != 200) return false;
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()))) {
                String line = reader.readLine();
                return line != null && line.contains("ceflyrics");
            }
        } catch (Exception error) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    // Los tres primeros números de la IP del celular, para recorrer su red.
    private static String networkPrefix() throws Exception {
        String found = null;
        for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!network.isUp() || network.isLoopback()) continue;
            for (InetAddress address : Collections.list(network.getInetAddresses())) {
                if (!(address instanceof Inet4Address) || !address.isSiteLocalAddress()) continue;
                String ip = address.getHostAddress();
                String prefix = ip.substring(0, ip.lastIndexOf('.') + 1);
                if (network.getName().startsWith("wlan")) return prefix;
                found = prefix;
            }
        }
        return found;
    }

    private String searchNetwork() throws Exception {
        String prefix = networkPrefix();
        if (prefix == null) return null;
        AtomicReference<String> found = new AtomicReference<>();
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        for (int host = 1; host < 255; host++) {
            String address = prefix + host + ":" + DEFAULT_PORT;
            pool.execute(() -> {
                if (found.get() == null && isCeflyrics(address)) found.compareAndSet(null, address);
            });
        }
        pool.shutdown();
        pool.awaitTermination(10, TimeUnit.SECONDS);
        return found.get();
    }

    private void finishSearch(String address) {
        String argument = address == null ? "null" : "'" + address + "'";
        runOnUiThread(() -> web.evaluateJavascript("searchFinished(" + argument + ")", null));
    }

    private class Bridge {
        @JavascriptInterface
        public void search() {
            new Thread(() -> {
                String address = null;
                try {
                    address = searchNetwork();
                } catch (Exception error) {
                    // Sin red, la página ofrece escribir la dirección.
                }
                finishSearch(address);
            }).start();
        }

        @JavascriptInterface
        public void connect(String address) {
            preferences.edit().putString(ADDRESS_KEY, address).apply();
            runOnUiThread(() -> web.loadUrl(controlUrl(address)));
        }

        @JavascriptInterface
        public void reset() {
            preferences.edit().remove(ADDRESS_KEY).apply();
            runOnUiThread(() -> web.loadUrl(START_PAGE));
        }
    }
}
