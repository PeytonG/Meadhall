// SPDX-License-Identifier: AGPL-3.0-only
// The sign-in look picker: pixel or smooth, for the whole app or part by part (font, icons, shapes, emoji and your
// speaking campfire), with a live preview (the app behind it changes too). Shown once per account (the choice is
// saved to the account, appearanceSync.ts); everything can be changed later in Settings → Appearance.
import React, { useState } from "react";
import type { MatrixClient } from "matrix-js-sdk/src/matrix";

import { Avatar } from "../../components/Avatar";
import { PixelIcon } from "../../components/PixelIcon";
import { RoomDialog } from "../../components/rooms/RoomDialog";
import { PixelCampfire } from "../../components/voice/PixelCampfire";
import { saveOwnFlameStyle, useFlameStyle } from "../../voice/flameColor";
import { pixelLook, type LookPart } from "./appearanceSync";
import type { AppearanceSettings } from "./settingsStore";

interface LookPickerProps {
  client: MatrixClient;
  settings: AppearanceSettings;
  // Called on every change, so the app previews it.
  onPreview: (settings: AppearanceSettings) => void;
  onDone: (settings: AppearanceSettings) => void;
}

const PARTS: Array<{
  part: LookPart;
  label: string;
  pixel: string;
  smooth: string;
}> = [
  { part: "fontStyle", label: "Font", pixel: "Pixel", smooth: "Clean" },
  { part: "iconStyle", label: "Icons", pixel: "Pixel", smooth: "Smooth" },
  { part: "shapeStyle", label: "Shapes", pixel: "Square", smooth: "Rounded" },
  { part: "pixelEmoji", label: "Emoji", pixel: "Pixel", smooth: "Standard" },
];

function isPixel(settings: AppearanceSettings, part: LookPart): boolean {
  if (part === "pixelEmoji") return settings.pixelEmoji;
  if (part === "fontStyle") return settings.fontStyle === "pixel";
  return settings[part] === "pixel";
}

function withPart(
  settings: AppearanceSettings,
  part: LookPart,
  pixel: boolean,
): AppearanceSettings {
  if (part === "pixelEmoji") return { ...settings, pixelEmoji: pixel };
  if (part === "fontStyle")
    return { ...settings, fontStyle: pixel ? "pixel" : "system" };
  return { ...settings, [part]: pixel ? "pixel" : "smooth" };
}

export function LookPicker({
  client,
  settings,
  onPreview,
  onDone,
}: LookPickerProps): React.ReactElement {
  const userId = client.getSafeUserId();
  const flame = useFlameStyle(client, userId);
  const [draft, setDraft] = useState(settings);
  const [campfire, setCampfire] = useState(flame.enabled);
  const name = client.getUser(userId)?.displayName || userId;

  const change = (next: AppearanceSettings): void => {
    setDraft(next);
    onPreview(next);
  };
  const allPixel = PARTS.every(({ part }) => isPixel(draft, part)) && campfire;
  const allSmooth =
    PARTS.every(({ part }) => !isPixel(draft, part)) && !campfire;
  const finish = (): void => {
    if (campfire !== flame.enabled)
      void saveOwnFlameStyle(client, { ...flame, enabled: campfire }).catch(
        () => undefined,
      );
    onDone(draft);
  };

  return (
    <RoomDialog
      open
      title="Pick your look"
      onClose={finish}
      footer={
        <button
          type="button"
          className="settings-button"
          onClick={finish}
          data-testid="look-picker-done"
        >
          Done
        </button>
      }
    >
      <div className="look-picker" data-testid="look-picker">
        <p className="settings-tab-description">
          Meadhall is pixel art by default. Pick a look for everything, or part
          by part. It follows your account to every device, and you can change
          it any time in Settings → Appearance.
        </p>
        <div
          className="look-picker-presets"
          role="radiogroup"
          aria-label="Look"
        >
          <button
            type="button"
            role="radio"
            aria-checked={allPixel}
            className={`look-picker-preset${allPixel ? " is-selected" : ""}`}
            onClick={() => {
              setCampfire(true);
              change(pixelLook(draft, true));
            }}
            data-testid="look-pixel"
          >
            Pixel
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={allSmooth}
            className={`look-picker-preset${allSmooth ? " is-selected" : ""}`}
            onClick={() => {
              setCampfire(false);
              change(pixelLook(draft, false));
            }}
            data-testid="look-smooth"
          >
            Smooth
          </button>
        </div>

        {/* The preview is drawn with the app's own styles, so it shows exactly what the choices do. */}
        <div className="look-picker-preview" aria-hidden="true">
          <div className="look-picker-message">
            <Avatar
              className="look-picker-avatar"
              name={name}
              seed={userId}
              userId={userId}
              src={null}
            />
            <div>
              <strong>{name}</strong>
              <p>
                Welcome to the hall! <span className="unicode-emoji">🍺</span>
                <span className="unicode-emoji">🔥</span>
              </p>
            </div>
          </div>
          <div className="look-picker-row">
            <PixelIcon name="home" size={22} />
            <PixelIcon name="poll" size={22} />
            <PixelIcon name="gear" size={22} />
            <span className="look-picker-button settings-button">Button</span>
            <span className="look-picker-campfire">
              <span className="settings-campfire-preview">
                <Avatar
                  className="settings-campfire-avatar"
                  name={name}
                  seed={userId}
                  userId={userId}
                  src={null}
                />
                {campfire ? (
                  <PixelCampfire active color={flame.color} />
                ) : (
                  <span className="voice-room-speaking-indicator is-speaking" />
                )}
              </span>
            </span>
          </div>
        </div>

        <div className="look-picker-parts">
          {PARTS.map(({ part, label, pixel, smooth }) => (
            <div className="look-picker-part" key={part}>
              <span>{label}</span>
              <div
                className="settings-segmented"
                role="radiogroup"
                aria-label={label}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={isPixel(draft, part)}
                  className={isPixel(draft, part) ? "is-active" : ""}
                  onClick={() => change(withPart(draft, part, true))}
                >
                  {pixel}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!isPixel(draft, part)}
                  className={!isPixel(draft, part) ? "is-active" : ""}
                  onClick={() => change(withPart(draft, part, false))}
                  data-testid={`look-${part}-smooth`}
                >
                  {smooth}
                </button>
              </div>
            </div>
          ))}
          <div className="look-picker-part">
            <span>Speaking</span>
            <div
              className="settings-segmented"
              role="radiogroup"
              aria-label="Speaking"
            >
              <button
                type="button"
                role="radio"
                aria-checked={campfire}
                className={campfire ? "is-active" : ""}
                onClick={() => setCampfire(true)}
              >
                Campfire
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!campfire}
                className={!campfire ? "is-active" : ""}
                onClick={() => setCampfire(false)}
              >
                Green ring
              </button>
            </div>
          </div>
        </div>
      </div>
    </RoomDialog>
  );
}
