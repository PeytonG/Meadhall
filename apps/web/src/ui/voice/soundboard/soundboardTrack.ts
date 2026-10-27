// SPDX-License-Identifier: AGPL-3.0-only
// The soundboard as its own audio track in a call (track name SOUNDBOARD_TRACK_NAME), separate from your voice, so
// everyone can turn other people's sounds down or off without turning their voice down (Settings → Audio, and
// per person in the call). It's muted between sounds, so it sends nothing (and LiveKit doesn't warn about a track
// "publishing silence", which is why sounds were once mixed into the microphone instead).
import { LocalAudioTrack, Track, type Room } from "livekit-client";

import { SoundboardPlayer } from "./soundboard";

export const SOUNDBOARD_TRACK_NAME = "meadhall-soundboard";
// Kept on a little after a sound ends, so its tail isn't cut and quick repeats don't flap the track.
const MUTE_AFTER_MS = 600;

export class SoundboardTrack {
    readonly player: SoundboardPlayer;
    private readonly bus: GainNode;
    private readonly track: LocalAudioTrack;
    private published = false;
    private muteTimer: number | null = null;
    private playingUntil = 0;

    constructor(private readonly room: Room) {
        const context = new AudioContext();
        this.bus = context.createGain();
        const destination = context.createMediaStreamDestination();
        this.bus.connect(destination);
        this.player = new SoundboardPlayer(context, this.bus);
        this.track = new LocalAudioTrack(destination.stream.getAudioTracks()[0]!, undefined, false);
    }

    private async ensurePublished(): Promise<void> {
        if (this.published) return;
        await this.room.localParticipant.publishTrack(this.track, {
            name: SOUNDBOARD_TRACK_NAME,
            source: Track.Source.Unknown,
            // Sounds are music-like: no voice-only tricks that would cut quiet parts.
            dtx: false,
            red: false,
        });
        this.published = true;
    }

    get mediaStreamTrack(): MediaStreamTrack {
        return this.track.mediaStreamTrack;
    }

    async play(buffer: AudioBuffer): Promise<void> {
        await this.ensurePublished();
        if (this.muteTimer !== null) window.clearTimeout(this.muteTimer);
        if (this.track.isMuted) await this.track.unmute();
        await this.player.play(buffer);
        this.playingUntil = Math.max(this.playingUntil, Date.now() + buffer.duration * 1000);
        this.muteTimer = window.setTimeout(() => {
            this.muteTimer = null;
            if (Date.now() >= this.playingUntil) void this.track.mute().catch(() => undefined);
        }, Math.max(0, this.playingUntil - Date.now()) + MUTE_AFTER_MS);
    }

    async close(): Promise<void> {
        if (this.muteTimer !== null) window.clearTimeout(this.muteTimer);
        if (this.published) await this.room.localParticipant.unpublishTrack(this.track).catch(() => undefined);
        this.track.stop();
        this.player.close();
        void this.player.context.close().catch(() => undefined);
    }
}

export function isSoundboardTrack(trackName: string | undefined): boolean {
    return trackName === SOUNDBOARD_TRACK_NAME;
}
