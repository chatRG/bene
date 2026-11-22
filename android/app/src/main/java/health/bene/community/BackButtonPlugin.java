package health.bene.community;

import com.getcapacitor.Bridge;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the web app own the Android back gesture. No decision is made here: the
 * router calls {@code armed} to say whether a back press still has a screen to
 * return to, and the plugin only steps out of the way once it does not.
 */
@CapacitorPlugin(name = "BackButton")
public class BackButtonPlugin extends Plugin {

    private boolean armed = false;

    @PluginMethod
    public void armed(PluginCall call) {
        armed = call.getBoolean("value", false);
        call.resolve();
    }

    @PluginMethod
    public void state(PluginCall call) {
        JSObject result = new JSObject();
        result.put("armed", armed);
        call.resolve(result);
    }

    @Override
    public boolean handleOnBackPressed() {
        if (!armed) return false;
        Bridge bridge = getBridge();
        return bridge != null && bridge.getWebView() != null && bridge.getWebView().canGoBack();
    }
}
