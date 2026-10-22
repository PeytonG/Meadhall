package io.github.peytong.meadhall;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // While Meadhall is on screen it shows notifications itself; the background service stays quiet.
    private static volatile boolean onScreen = false;

    static boolean isOnScreen() {
        return onScreen;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(MeadhallSyncPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        onScreen = true;
    }

    @Override
    public void onPause() {
        onScreen = false;
        super.onPause();
    }
}
