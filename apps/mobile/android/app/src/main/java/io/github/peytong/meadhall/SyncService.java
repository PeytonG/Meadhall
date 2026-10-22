// SPDX-License-Identifier: AGPL-3.0-only
package io.github.peytong.meadhall;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps Meadhall connected in the background so messages and calls notify without Google services or extra apps.
 * Android requires a visible "Meadhall is connected" notification for this (set to minimum importance).
 */
public final class SyncService extends Service {
    static final String CHANNEL_CONNECTED = "connected";
    private static final int ONGOING_ID = 0x4d48; // "MH"
    private static final long POLL_MS = 30_000;

    private HandlerThread thread;
    private Handler handler;
    private MatrixNotificationPoller poller;

    static void start(Context context) {
        ContextCompat.startForegroundService(context, new Intent(context, SyncService.class));
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, SyncService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        MatrixNotificationPoller.createChannels(this);
        poller = new MatrixNotificationPoller(this);
        thread = new HandlerThread("meadhall-background-sync");
        thread.start();
        handler = new Handler(thread.getLooper());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int pendingFlags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        Notification ongoing = new NotificationCompat.Builder(this, CHANNEL_CONNECTED)
                .setSmallIcon(R.drawable.ic_stat_meadhall)
                .setContentTitle("Meadhall is connected")
                .setContentText("So messages and calls reach you")
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setContentIntent(PendingIntent.getActivity(this, 0, open, pendingFlags))
                .build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ONGOING_ID, ongoing, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING);
        } else {
            startForeground(ONGOING_ID, ongoing);
        }
        handler.removeCallbacksAndMessages(null);
        handler.post(this::tick);
        return START_STICKY;
    }

    private void tick() {
        if (poller.poll()) {
            handler.postDelayed(this::tick, POLL_MS);
        } else {
            // Signed out or the sign-in expired: stop until the app starts us again.
            stopSelf();
        }
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        thread.quitSafely();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
