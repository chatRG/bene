package health.bene.community;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // True while the web layer is answering a press. A second press that arrives
    // before the answer would pop two screens for one gesture.
    private boolean asking = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // The back gesture belongs to the app, not to the web view. Capacitor's
        // default would walk the web view's history, which is browser history:
        // it includes every tab the person has visited, so back from Home went
        // to whichever tab was open before instead of closing the app.
        //
        // The web layer owns the rule — it knows whether a sheet is open, and how
        // deep the current screen is — so each press is asked one question:
        // "handled, or leave?" Only this class can leave, because leaving means
        // finishing the activity.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    leave();
                    return;
                }
                if (asking) {
                    return;
                }
                asking = true;
                // The answer is the string 'handled' or 'exit'. A missing bridge
                // (the page has not loaded yet) reads as 'exit', which is the same
                // thing the platform would do.
                webView.evaluateJavascript(
                        "(function(){var f=window.__beneBack;return f?f():'exit';})()",
                        value -> {
                            asking = false;
                            if (value == null || !value.contains("handled")) {
                                leave();
                            }
                        });
            }

            private void leave() {
                // Disabling this callback hands the press back to the platform, so
                // the app closes with the system's own exit, exactly as it would
                // from any other app. Re-enabling afterwards keeps the activity
                // usable if it is still alive (it is finishing, so this is a no-op
                // in practice).
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
