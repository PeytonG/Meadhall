// SPDX-License-Identifier: AGPL-3.0-only
// What a new member goes through before talking in a server with onboarding (Server Settings → Onboarding): the
// intro, the rules to accept, and the questions. Shown in place of the message box until it's done.
import React, { useEffect, useMemo, useState } from "react";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import { parseOnboardingResponse, type OnboardingConfig } from "../../core/bots/botProtocol";
import { readOnboarding, submitOnboarding } from "../../core/bots/serverBots";
import { RoomDialog } from "../components/rooms/RoomDialog";

interface OnboardingDialogProps {
    client: MatrixClient;
    space: Room;
    open: boolean;
    onClose: () => void;
    // Admins skip onboarding; Space Settings → Onboarding lets them see it as a newcomer would (nothing is saved).
    preview?: boolean;
}

export function OnboardingDialog({ client, space, open, onClose, preview = false }: OnboardingDialogProps): React.ReactElement | null {
    const config: OnboardingConfig = useMemo(() => readOnboarding(space), [space, open]);
    const [accepted, setAccepted] = useState(false);
    const [answers, setAnswers] = useState<Record<string, string[]>>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setAccepted(false);
            setAnswers({});
            setError(null);
        }
    }, [open]);

    const response = { accepted_rules: accepted || config.rules.length === 0, answers, at: Date.now() };
    const complete = parseOnboardingResponse(response, config) !== null;

    const toggle = (questionId: string, answerId: string, multiple: boolean): void =>
        setAnswers((current) => {
            const picked = current[questionId] ?? [];
            const next = multiple ? (picked.includes(answerId) ? picked.filter((id) => id !== answerId) : [...picked, answerId]) : [answerId];
            return { ...current, [questionId]: next };
        });

    const submit = async (): Promise<void> => {
        const parsed = parseOnboardingResponse(response, config);
        if (!parsed) return;
        if (preview) {
            onClose();
            return;
        }
        setBusy(true);
        setError(null);
        try {
            await submitOnboarding(client, space, parsed);
            onClose();
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Couldn't send your answers.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <RoomDialog
            open={open}
            title={`Welcome to ${space.name || "the space"}${preview ? " (preview)" : ""}`}
            onClose={onClose}
            footer={
                <>
                    <button type="button" className="settings-button settings-button-secondary" onClick={onClose}>
                        Later
                    </button>
                    <button type="button" className="settings-button" onClick={() => void submit()} disabled={!complete || busy} data-testid="onboarding-finish">
                        {busy ? "Sending…" : "Finish"}
                    </button>
                </>
            }
        >
            <div className="onboarding-dialog" data-testid="onboarding-dialog">
                {config.intro ? <p className="onboarding-intro">{config.intro}</p> : null}
                {config.rules.length > 0 ? (
                    <section className="onboarding-section">
                        <h3>Rules</h3>
                        <ol className="onboarding-rules">
                            {config.rules.map((rule, index) => (
                                <li key={index}>{rule}</li>
                            ))}
                        </ol>
                        <label className="settings-toggle">
                            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} data-testid="onboarding-accept" />
                            I&apos;ve read the rules and agree to them
                        </label>
                    </section>
                ) : null}
                {config.questions.map((question) => (
                    <fieldset key={question.id} className="onboarding-section onboarding-question-card">
                        <legend>
                            {question.prompt}
                            {question.required ? null : <small> (optional)</small>}
                            {question.multiple ? <small> · pick any</small> : null}
                        </legend>
                        <div className="onboarding-choices">
                            {question.answers.map((answer) => {
                                const picked = answers[question.id]?.includes(answer.id) ?? false;
                                return (
                                    <button
                                        key={answer.id}
                                        type="button"
                                        className={`onboarding-choice${picked ? " is-picked" : ""}`}
                                        aria-pressed={picked}
                                        onClick={() => toggle(question.id, answer.id, question.multiple)}
                                    >
                                        {answer.label}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>
                ))}
                <p className="settings-inline-note">Your answers are saved in the space, where its members can see them.</p>
                {error ? <p className="settings-inline-error">{error}</p> : null}
            </div>
        </RoomDialog>
    );
}

interface OnboardingGateProps {
    client: MatrixClient;
    space: Room;
}

// In place of the message box until you've finished the server's onboarding. Opens the dialog by itself the first
// time you come in.
const openedFor = new Set<string>();

export function OnboardingGate({ client, space }: OnboardingGateProps): React.ReactElement {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!openedFor.has(space.roomId)) {
            openedFor.add(space.roomId);
            setOpen(true);
        }
    }, [space.roomId]);
    return (
        <div className="onboarding-gate" data-testid="onboarding-gate">
            <span>Finish joining {space.name || "this space"} to chat: read the rules and answer a few questions.</span>
            <button type="button" className="settings-button" onClick={() => setOpen(true)} data-testid="onboarding-start">
                Get started
            </button>
            <OnboardingDialog client={client} space={space} open={open} onClose={() => setOpen(false)} />
        </div>
    );
}
