// SPDX-License-Identifier: AGPL-3.0-only
package io.github.peytong.meadhall;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After the phone restarts (or the app updates), reconnect in the background if you were signed in. */
public final class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        boolean relevant = Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);
        if (relevant && SyncStore.load(context) != null) {
            SyncService.start(context);
        }
    }
}
