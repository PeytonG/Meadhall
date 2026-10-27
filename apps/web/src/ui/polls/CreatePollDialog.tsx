// SPDX-License-Identifier: AGPL-3.0-only
// Make a poll: a question, 2-20 answers, one or several picks, anonymous or not, live results or at the end, and a time limit.
import React, { useState } from "react";

import { RoomDialog } from "../components/rooms/RoomDialog";
import { MAX_POLL_ANSWERS, MAX_POLL_TEXT, type NewPoll } from "./pollModel";

const DURATIONS: Array<{ label: string; minutes: number | null }> = [
    { label: "No time limit", minutes: null },
    { label: "5 minutes", minutes: 5 },
    { label: "1 hour", minutes: 60 },
    { label: "4 hours", minutes: 240 },
    { label: "1 day", minutes: 1440 },
    { label: "3 days", minutes: 4320 },
    { label: "1 week", minutes: 10080 },
];

interface CreatePollDialogProps {
    open: boolean;
    onClose: () => void;
    onCreate: (poll: NewPoll) => Promise<void>;
}

export function CreatePollDialog({ open, onClose, onCreate }: CreatePollDialogProps): React.ReactElement | null {
    const [question, setQuestion] = useState("");
    const [answers, setAnswers] = useState<string[]>(["", ""]);
    const [multi, setMulti] = useState(false);
    const [anonymous, setAnonymous] = useState(false);
    const [disclosed, setDisclosed] = useState(true);
    const [duration, setDuration] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const filled = answers.map((answer) => answer.trim()).filter(Boolean);
    const canCreate = question.trim().length > 0 && filled.length >= 2 && !saving;

    const reset = (): void => {
        setQuestion("");
        setAnswers(["", ""]);
        setMulti(false);
        setAnonymous(false);
        setDisclosed(true);
        setDuration(null);
        setError(null);
    };

    const submit = async (): Promise<void> => {
        if (!canCreate) return;
        setSaving(true);
        setError(null);
        try {
            await onCreate({
                question,
                answers: filled,
                maxSelections: multi ? filled.length : 1,
                disclosed,
                anonymous,
                durationMinutes: duration,
            });
            reset();
            onClose();
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : "Couldn't create the poll.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <RoomDialog
            open={open}
            title="Create poll"
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="room-dialog-button room-dialog-button-secondary" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="room-dialog-button room-dialog-button-primary"
                        onClick={() => void submit()}
                        disabled={!canCreate}
                        data-testid="poll-create-submit"
                    >
                        {saving ? "Posting..." : "Post poll"}
                    </button>
                </>
            }
        >
            <label className="room-dialog-field">
                <span>Question</span>
                <input
                    className="room-dialog-input"
                    type="text"
                    value={question}
                    maxLength={MAX_POLL_TEXT}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="What should we play tonight?"
                    disabled={saving}
                    data-testid="poll-question"
                    autoFocus
                />
            </label>
            <div className="room-dialog-field poll-dialog-answers">
                <span>Answers</span>
                {answers.map((answer, index) => (
                    <div key={index} className="poll-dialog-answer">
                        <input
                            className="room-dialog-input"
                            type="text"
                            value={answer}
                            maxLength={MAX_POLL_TEXT}
                            aria-label={`Answer ${index + 1}`}
                            placeholder={`Answer ${index + 1}`}
                            onChange={(event) => setAnswers((current) => current.map((value, i) => (i === index ? event.target.value : value)))}
                            disabled={saving}
                            data-testid="poll-answer-input"
                        />
                        {answers.length > 2 ? (
                            <button
                                type="button"
                                className="poll-dialog-remove"
                                aria-label={`Remove answer ${index + 1}`}
                                onClick={() => setAnswers((current) => current.filter((_, i) => i !== index))}
                                disabled={saving}
                            >
                                x
                            </button>
                        ) : null}
                    </div>
                ))}
                {answers.length < MAX_POLL_ANSWERS ? (
                    <button
                        type="button"
                        className="room-dialog-button room-dialog-button-secondary poll-dialog-add"
                        onClick={() => setAnswers((current) => [...current, ""])}
                        disabled={saving}
                        data-testid="poll-add-answer"
                    >
                        + Add answer
                    </button>
                ) : null}
            </div>
            <label className="room-dialog-field">
                <span>Time limit</span>
                <select
                    className="room-dialog-input"
                    value={duration === null ? "" : String(duration)}
                    onChange={(event) => setDuration(event.target.value ? Number(event.target.value) : null)}
                    disabled={saving}
                    data-testid="poll-duration"
                >
                    {DURATIONS.map((option) => (
                        <option key={option.label} value={option.minutes === null ? "" : String(option.minutes)}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </label>
            <label className="room-dialog-checkbox">
                <input type="checkbox" checked={multi} onChange={(event) => setMulti(event.target.checked)} disabled={saving} data-testid="poll-multi" />
                <span>Let people pick more than one answer</span>
            </label>
            <label className="room-dialog-checkbox">
                <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} disabled={saving} data-testid="poll-anonymous" />
                <span>Anonymous: don&apos;t show who voted for what</span>
            </label>
            <label className="room-dialog-checkbox">
                <input type="checkbox" checked={!disclosed} onChange={(event) => setDisclosed(!event.target.checked)} disabled={saving} data-testid="poll-hide-results" />
                <span>Hide results until the poll closes</span>
            </label>
            <p className="room-dialog-muted">
                {anonymous
                    ? "Meadhall only shows totals. Votes are still Matrix events, so other apps (like Element) could show who voted."
                    : "Everyone sees who voted for each answer."}
                {duration ? " When time is up, the results are posted in the channel." : ""}
            </p>
            {error ? <p className="settings-inline-error">{error}</p> : null}
        </RoomDialog>
    );
}
