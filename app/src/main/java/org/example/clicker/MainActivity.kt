package org.example.clicker

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity

class MainActivity : ComponentActivity() {

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val wv = WebView(this)

        val s: WebSettings = wv.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.cacheMode = WebSettings.LOAD_DEFAULT

        // Keep navigation inside the app
        wv.webViewClient = WebViewClient()
        wv.webChromeClient = WebChromeClient()

        // Offline game from assets
        wv.loadUrl("file:///android_asset/index.html")

        setContentView(wv)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val wv = (this.window.decorView.rootView as? WebView)
        if (wv != null && wv.canGoBack()) {
            wv.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
