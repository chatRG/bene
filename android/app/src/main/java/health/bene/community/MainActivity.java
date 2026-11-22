package health.bene.community;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackButtonPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
