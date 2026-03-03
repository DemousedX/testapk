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
import android.view.MotionEvent
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
import androidx.activity.OnBackPressedCallback
import kotlin.math.abs

class MainActivity : ComponentActivity() {

    private lateinit var wv: WebView
    private lateinit var vibrator: Vibrator
    private lateinit var soundPool: SoundPool
    private var clickSoundId: Int = 0
    private var soundLoaded = false

    private var swipeStartX = 0f
    private var swipeStartY = 0f
    private val swipeThreshold = 100f

    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
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

        // JS bridge so the page can trigger native feedback
        wv.addJavascriptInterface(object : Any() {
            @JavascriptInterface
            fun onTap() {
                runOnUiThread { triggerFeedback() }
            }
        }, "Android")

        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView, request: WebResourceRequest
            ): Boolean = false

            override fun onPageFinished(view: WebView, url: String) {
                // Inject touchstart listener — fires on every tap in the page
                wv.evaluateJavascript("""
                    (function() {
                        if (window.__androidFeedbackInjected) return;
                        window.__androidFeedbackInjected = true;
                        document.addEventListener('touchstart', function() {
                            if (typeof Android !== 'undefined') Android.onTap();
                        }, { passive: true });
                    })();
                """.trimIndent(), null)
            }
        }
        wv.webChromeClient = WebChromeClient()
        wv.loadUrl("https://tg-0ncg.onrender.com")

        // Swipe-right-from-left-edge → go back
        wv.setOnTouchListener { _, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    swipeStartX = event.x
                    swipeStartY = event.y
                    false
                }
                MotionEvent.ACTION_UP -> {
                    val dx = event.x - swipeStartX
                    val dy = event.y - swipeStartY
                    // Right swipe, more horizontal than vertical, starts near left edge
                    if (dx > swipeThreshold &&
                        abs(dx) > abs(dy) * 1.5f &&
                        swipeStartX < 80f &&
                        wv.canGoBack()
                    ) {
                        wv.goBack()
                        triggerFeedback()
                        true
                    } else false
                }
                else -> false
            }
        }

        setContentView(wv)
        enterImmersive()

        // System back button
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (wv.canGoBack()) wv.goBack()
                // keep app alive if no history
            }
        })
    }

    private fun triggerFeedback() {
        // Short vibration
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(
                VibrationEffect.createOneShot(18, VibrationEffect.DEFAULT_AMPLITUDE)
            )
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(18)
        }
        // Soft click sound
        if (soundLoaded && clickSoundId != 0) {
            soundPool.play(clickSoundId, 0.35f, 0.35f, 1, 0, 1.0f)
        }
    }

    /** Generates a soft 30ms sine-burst click and saves it as a WAV in cache. */
    private fun generateClickSound(): Int {
        val sampleRate = 44100
        val durationMs = 30
        val numSamples = sampleRate * durationMs / 1000
        val freq = 1200.0
        val pcm = ShortArray(numSamples)
        for (i in 0 until numSamples) {
            val env = if (i < numSamples * 0.1)
                i / (numSamples * 0.1)
            else
                1.0 - (i - numSamples * 0.1) / (numSamples * 0.9)
            pcm[i] = (Math.sin(2 * Math.PI * freq * i / sampleRate) * env * Short.MAX_VALUE * 0.6)
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
