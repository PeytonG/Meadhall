// SPDX-License-Identifier: AGPL-3.0-only
package io.github.peytong.meadhall;

import android.content.Context;
import android.content.SharedPreferences;

/** The background sync's sign-in and progress, in the app's private storage. Cleared on sign-out. */
final class SyncStore {
    private static final String PREFS = "meadhall_background_sync";

    final String homeserverUrl;
    final String accessToken;
    final String userId;
    final boolean showMessageText;

    private SyncStore(String homeserverUrl, String accessToken, String userId, boolean showMessageText) {
        this.homeserverUrl = homeserverUrl;
        this.accessToken = accessToken;
        this.userId = userId;
        this.showMessageText = showMessageText;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void save(Context context, String homeserverUrl, String accessToken, String userId, boolean showMessageText) {
        SharedPreferences.Editor editor = prefs(context).edit()
                .putString("homeserver", homeserverUrl)
                .putString("token", accessToken)
                .putString("user", userId)
                .putBoolean("show_text", showMessageText);
        // Starting fresh: only notifications newer than now count.
        if (!prefs(context).contains("last_ts")) {
            editor.putLong("last_ts", System.currentTimeMillis());
        }
        editor.apply();
    }

    static void updateToken(Context context, String accessToken) {
        prefs(context).edit().putString("token", accessToken).apply();
    }

    static SyncStore load(Context context) {
        SharedPreferences p = prefs(context);
        String homeserver = p.getString("homeserver", null);
        String token = p.getString("token", null);
        String user = p.getString("user", null);
        if (homeserver == null || token == null || user == null) {
            return null;
        }
        return new SyncStore(homeserver, token, user, p.getBoolean("show_text", true));
    }

    static long lastSeen(Context context) {
        return prefs(context).getLong("last_ts", System.currentTimeMillis());
    }

    static void setLastSeen(Context context, long ts) {
        prefs(context).edit().putLong("last_ts", ts).apply();
    }

    static void clear(Context context) {
        prefs(context).edit().clear().apply();
    }
}
