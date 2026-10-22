// SPDX-License-Identifier: AGPL-3.0-only
package io.github.peytong.meadhall;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/** The web app's handle on background notifications (window.Capacitor.Plugins.MeadhallSync). */
@CapacitorPlugin(
        name = "MeadhallSync",
        permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public final class MeadhallSyncPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        String homeserver = call.getString("homeserverUrl");
        String token = call.getString("accessToken");
        String user = call.getString("userId");
        if (homeserver == null || token == null || user == null) {
            call.reject("homeserverUrl, accessToken and userId are required");
            return;
        }
        SyncStore.save(getContext(), homeserver.replaceAll("/+$", ""), token, user, Boolean.TRUE.equals(call.getBoolean("showMessageText", true)));
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }
        SyncService.start(getContext());
        call.resolve();
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        // Run the service either way; without permission Android just hides what it posts.
        SyncService.start(getContext());
        JSObject result = new JSObject();
        result.put("notifications", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void updateToken(PluginCall call) {
        String token = call.getString("accessToken");
        if (token != null) {
            SyncStore.updateToken(getContext(), token);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        SyncStore.clear(getContext());
        SyncService.stop(getContext());
        call.resolve();
    }
}
