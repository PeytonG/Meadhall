// SPDX-License-Identifier: AGPL-3.0-only
package io.github.peytong.meadhall;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.HashMap;
import java.util.Map;

/**
 * Asks the homeserver for new notifications (GET /_matrix/client/v3/notifications: what your push rules say
 * should notify, like DMs and mentions) and shows them as Android notifications.
 *
 * Deliberately not a second /sync: a sync on the same device consumes its to-device messages, which carry the
 * encryption keys the app needs, so the app could no longer decrypt. Encrypted messages therefore show as
 * "New message" here; the app shows the text once opened.
 */
final class MatrixNotificationPoller {
    static final String CHANNEL_MESSAGES = "messages";
    static final String CHANNEL_CALLS = "calls";
    private static final int TIMEOUT_MS = 20_000;

    private final Context context;
    private final Map<String, String> nameCache = new HashMap<>();

    MatrixNotificationPoller(Context context) {
        this.context = context;
    }

    /** Returns false when the sign-in no longer works (expired or signed out), so the service can stop. */
    boolean poll() {
        SyncStore store = SyncStore.load(context);
        if (store == null) {
            return false;
        }
        try {
            JSONObject response = get(store, "/_matrix/client/v3/notifications?limit=20");
            JSONArray list = response.optJSONArray("notifications");
            long lastSeen = SyncStore.lastSeen(context);
            long newest = lastSeen;
            if (list != null) {
                // The server lists newest first; show oldest first.
                for (int index = list.length() - 1; index >= 0; index--) {
                    JSONObject item = list.getJSONObject(index);
                    long ts = item.optLong("ts", 0);
                    if (ts <= lastSeen || item.optBoolean("read", false)) {
                        continue;
                    }
                    newest = Math.max(newest, ts);
                    if (!MainActivity.isOnScreen()) {
                        show(store, item);
                    }
                }
            }
            if (newest > lastSeen) {
                SyncStore.setLastSeen(context, newest);
            }
            return true;
        } catch (HttpStatusException error) {
            return error.status != 401 && error.status != 403;
        } catch (Exception error) {
            return true; // offline or a hiccup: try again next time
        }
    }

    private void show(SyncStore store, JSONObject item) throws Exception {
        JSONObject event = item.getJSONObject("event");
        String roomId = item.optString("room_id");
        String type = event.optString("type");
        String sender = event.optString("sender");
        String senderName = displayName(store, sender);
        String roomName = roomName(store, roomId);
        boolean isCall = type.equals("org.matrix.msc4075.rtc.notification") || type.equals("org.matrix.msc4075.call.notify");

        String title = roomName == null || roomName.equals(senderName) ? senderName : senderName + " (" + roomName + ")";
        String text;
        if (isCall) {
            title = senderName + " is calling";
            text = roomName != null ? "Call in " + roomName : "Open Meadhall to join";
        } else if (type.equals("m.room.encrypted")) {
            text = "New message";
        } else if (type.equals("m.sticker")) {
            text = "Sent a sticker";
        } else {
            JSONObject content = event.optJSONObject("content");
            String body = content != null ? content.optString("body", "") : "";
            text = store.showMessageText && !body.isEmpty() ? body : "New message";
        }

        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra("roomId", roomId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent tap = PendingIntent.getActivity(context, roomId.hashCode(), open, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, isCall ? CHANNEL_CALLS : CHANNEL_MESSAGES)
                .setSmallIcon(R.drawable.ic_stat_meadhall)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setContentIntent(tap)
                .setAutoCancel(true)
                .setCategory(isCall ? NotificationCompat.CATEGORY_CALL : NotificationCompat.CATEGORY_MESSAGE)
                .setPriority(isCall ? NotificationCompat.PRIORITY_MAX : NotificationCompat.PRIORITY_HIGH)
                .setGroup(roomId);
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        if (manager.areNotificationsEnabled()) {
            try {
                manager.notify(event.optString("event_id", roomId).hashCode(), builder.build());
            } catch (SecurityException denied) {
                // Notification permission withdrawn: nothing to show.
            }
        }
    }

    private String displayName(SyncStore store, String userId) {
        String cached = nameCache.get(userId);
        if (cached != null) return cached;
        String name = userId.startsWith("@") ? userId.substring(1).split(":")[0] : userId;
        try {
            name = get(store, "/_matrix/client/v3/profile/" + enc(userId) + "/displayname").optString("displayname", name);
        } catch (Exception ignored) {
            // Keep the username.
        }
        nameCache.put(userId, name);
        return name;
    }

    private String roomName(SyncStore store, String roomId) {
        String key = "room:" + roomId;
        if (nameCache.containsKey(key)) return nameCache.get(key);
        String name = null;
        try {
            String value = get(store, "/_matrix/client/v3/rooms/" + enc(roomId) + "/state/m.room.name/").optString("name", "");
            name = value.isEmpty() ? null : value;
        } catch (Exception ignored) {
            // DMs usually have no name.
        }
        nameCache.put(key, name);
        return name;
    }

    private static String enc(String value) throws Exception {
        return URLEncoder.encode(value, "UTF-8").replace("+", "%20");
    }

    private static JSONObject get(SyncStore store, String path) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(store.homeserverUrl + path).openConnection();
        connection.setConnectTimeout(TIMEOUT_MS);
        connection.setReadTimeout(TIMEOUT_MS);
        connection.setRequestProperty("Authorization", "Bearer " + store.accessToken);
        try {
            int status = connection.getResponseCode();
            if (status >= 400) {
                throw new HttpStatusException(status);
            }
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                return new JSONObject(output.toString("UTF-8"));
            }
        } finally {
            connection.disconnect();
        }
    }

    static final class HttpStatusException extends Exception {
        final int status;

        HttpStatusException(int status) {
            super("HTTP " + status);
            this.status = status;
        }
    }

    static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH));
        manager.createNotificationChannel(new NotificationChannel(CHANNEL_CALLS, "Calls", NotificationManager.IMPORTANCE_HIGH));
        NotificationChannel connected = new NotificationChannel(SyncService.CHANNEL_CONNECTED, "Connected in the background", NotificationManager.IMPORTANCE_MIN);
        connected.setShowBadge(false);
        manager.createNotificationChannel(connected);
    }
}
