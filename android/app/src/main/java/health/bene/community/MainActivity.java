package health.bene.community;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // The web view's own canGoBack() is not the question we need answered.
        // It reports true for the entry the router is already sitting on, so
        // pressing back popped a no-op and the screen did not change: the first
        // press did nothing visible and the second one left. The web layer
        // publishes a function that reads the router's real position, and it is
        // asked on every press rather than cached, since a press can land
        // before any state refresh.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    fallThrough();
                    return;
                }
                webView.evaluateJavascript(
                        "(function(){var f=window.__beneCanGoBack;return f&&f()?'1':'0';})()",
                        value -> {
                            if ("\"1\"".equals(value)) {
                                webView.evaluateJavascript("history.back()", null);
                            } else {
                                fallThrough();
                            }
                        });
            }

            private void fallThrough() {
                // Nothing behind this screen: hand the press back to the system
                // so the app closes the way it always did.
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
