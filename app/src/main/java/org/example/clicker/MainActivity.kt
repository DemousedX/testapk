package org.example.clicker

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity

class MainActivity : ComponentActivity() {

    private lateinit var wv: WebView
    private lateinit var vibrator: Vibrator
    private lateinit var soundPool: SoundPool
    private var clickSoundId: Int = 0
    private var soundLoaded = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Init vibrator
        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        // Init SoundPool
        val audioAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        soundPool = SoundPool.Builder()
            .setMaxStreams(3)
            .setAudioAttributes(audioAttrs)
            .build()
        soundPool.setOnLoadCompleteListener { _, _, status ->
            soundLoaded = status == 0
        }
        clickSoundId = generateClickSound()

        // Setup WebView
        wv = WebView(this)
        val s: WebSettings = wv.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false

        // JS bridge — called only when a button/link is tapped
        wv.addJavascriptInterface(object : Any() {
            @JavascriptInterface
            fun onButtonTap() {
                runOnUiThread { triggerFeedback() }
            }

            @JavascriptInterface
            fun goBack() {
                runOnUiThread {
                    if (wv.canGoBack()) wv.goBack()
                }
            }
        }, "Android")

        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView, request: WebResourceRequest
            ): Boolean = false

            override fun onPageFinished(view: WebView, url: String) {
                injectScripts()
            }
        }
        wv.webChromeClient = WebChromeClient()
        wv.loadUrl("https://tg-0ncg.onrender.com")

        setContentView(wv)
        enterImmersive()
    }

    private fun injectScripts() {
        wv.evaluateJavascript("""
            (function() {
                if (window.__androidInjected) return;
                window.__androidInjected = true;

                // Fire feedback only on interactive elements
                var selector = 'button, a, input[type=button], input[type=submit], ' +
                               '[role=button], [onclick], .btn, .button, label';

                document.addEventListener('touchstart', function(e) {
                    if (typeof Android === 'undefined') return;
                    var el = e.target;
                    // Walk up to 4 levels to find a button-like ancestor
                    for (var i = 0; i < 4; i++) {
                        if (!el) break;
                        if (el.matches && el.matches(selector)) {
                            Android.onButtonTap();
                            return;
                        }
                        el = el.parentElement;
                    }
                }, { passive: true });

                // Swipe right from left edge = go back
                var startX = 0, startY = 0;
                document.addEventListener('touchstart', function(e) {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                }, { passive: true });
                document.addEventListener('touchend', function(e) {
                    var dx = e.changedTouches[0].clientX - startX;
                    var dy = e.changedTouches[0].clientY - startY;
                    if (dx > 80 && Math.abs(dy) < 60 && startX < 40) {
                        if (typeof Android !== 'undefined') Android.goBack();
                    }
                }, { passive: true });
            })();
        """.trimIndent(), null)
    }

    private fun triggerFeedback() {
        // Short light vibration
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(
                VibrationEffect.createOneShot(12, 60) // 12ms, amplitude 60/255
            )
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(12)
        }
        // Soft sound
        if (soundLoaded && clickSoundId != 0) {
            soundPool.play(clickSoundId, 0.15f, 0.15f, 1, 0, 1.0f)
        }
    }

    /**
     * Soft "thud" click: low frequency (180 Hz), long fade-out, no sharp attack.
     * Much softer than a high-freq sine burst.
     */
    private fun generateClickSound(): Int {
        val sampleRate = 44100
        val durationMs = 60
        val numSamples = sampleRate * durationMs / 1000
        val freq = 180.0
        val pcm = ShortArray(numSamples)

        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            // Smooth attack (5%) then exponential decay
            val attack = if (i < numSamples * 0.05)
                i / (numSamples * 0.05)
            else 1.0
            val decay = Math.exp(-i / (numSamples * 0.3))
            val env = attack * decay
            pcm[i] = (Math.sin(2 * Math.PI * freq * t) * env * Short.MAX_VALUE * 0.45)
                .toInt().toShort()
        }

        val file = java.io.File(cacheDir, "click.wav")
        writeWav(file, pcm, sampleRate)
        return soundPool.load(file.absolutePath, 1)
    }

    private fun writeWav(file: java.io.File, pcm: ShortArray, sampleRate: Int) {
        val ch = 1; val bps = 16
        val dataSize = pcm.size * 2
        java.io.DataOutputStream(file.outputStream().buffered()).use { o ->
            o.writeBytes("RIFF"); o.writeIntLE(36 + dataSize)
            o.writeBytes("WAVE")
            o.writeBytes("fmt "); o.writeIntLE(16)
            o.writeShortLE(1); o.writeShortLE(ch)
            o.writeIntLE(sampleRate); o.writeIntLE(sampleRate * ch * bps / 8)
            o.writeShortLE(ch * bps / 8); o.writeShortLE(bps)
            o.writeBytes("data"); o.writeIntLE(dataSize)
            for (s in pcm) o.writeShortLE(s.toInt())
        }
    }

    private fun java.io.DataOutputStream.writeIntLE(v: Int) {
        write(v and 0xFF); write(v shr 8 and 0xFF)
        write(v shr 16 and 0xFF); write(v shr 24 and 0xFF)
    }
    private fun java.io.DataOutputStream.writeShortLE(v: Int) {
        write(v and 0xFF); write(v shr 8 and 0xFF)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersive()
    }

    override fun onDestroy() {
        super.onDestroy()
        soundPool.release()
    }

    // System back button — handled in JS via goBack() bridge,
    // but also handle hardware key as fallback
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (wv.canGoBack()) wv.goBack() else super.onBackPressed()
    }

    private fun enterImmersive() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { c ->
                c.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                c.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        }
    }
}
