// SPDX-License-Identifier: AGPL-3.0-only
package io.github.peytong.meadhall;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Phone things the WebView can't do itself (window.Capacitor.Plugins.MeadhallNative):
 * - saveDownload: the WebView ignores download links, so attachments are saved to Downloads here.
 * - the system Back button/gesture goes to the web app ("backButton"), which closes what's open or goes back a screen;
 *   when there's nothing left to go back to it calls minimize, like Discord (the app goes to the background).
 */
@CapacitorPlugin(name = "MeadhallNative")
public final class MeadhallNativePlugin extends Plugin {
    @Override
    public void load() {
        getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (hasListeners("backButton")) {
                    notifyListeners("backButton", new JSObject());
                } else {
                    getActivity().moveTaskToBack(true);
                }
            }
        });
    }

    @PluginMethod
    public void minimize(PluginCall call) {
        getActivity().moveTaskToBack(true);
        call.resolve();
    }

    @PluginMethod
    public void saveDownload(PluginCall call) {
        String name = call.getString("name");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String data = call.getString("base64");
        if (name == null || data == null) {
            call.reject("name and base64 are required");
            return;
        }
        // A file name only: no folders, nothing that could leave Downloads.
        String safeName = name.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim();
        if (safeName.isEmpty() || safeName.equals(".") || safeName.equals("..")) {
            safeName = "download";
        }
        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("Not base64");
            return;
        }
        try {
            String where;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    call.reject("Couldn't create the file in Downloads");
                    return;
                }
                try (OutputStream out = resolver.openOutputStream(uri)) {
                    if (out == null) {
                        call.reject("Couldn't write the file");
                        return;
                    }
                    out.write(bytes);
                }
                where = "Downloads";
            } else {
                // Android 9 and older need a storage permission for the shared Downloads folder; use the app's own.
                File folder = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (folder == null) {
                    call.reject("No storage available");
                    return;
                }
                File file = new File(folder, safeName);
                try (FileOutputStream out = new FileOutputStream(file)) {
                    out.write(bytes);
                }
                where = folder.getAbsolutePath();
            }
            JSObject result = new JSObject();
            result.put("folder", where);
            result.put("name", safeName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Couldn't save the file: " + error.getMessage());
        }
    }
}
