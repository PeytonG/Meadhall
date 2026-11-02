// SPDX-License-Identifier: AGPL-3.0-only
// Server Settings → Onboarding: what new members see before they can talk, like Discord's membership screening and
// onboarding: an intro, the rules to accept, questions whose answers can give roles, and a welcome message.
// "Ask first" is checked by Meadhall; "Require it" has the homeserver enforce it (channels only let the member role
// talk) and needs a bot that gives the role once someone finishes.
import React, { useMemo, useState } from "react";
import type { MatrixClient, Room } from "matrix-js-sdk/src/matrix";

import type { ToastState } from "../../../components/Toast";
import { ONBOARDING_EVENT, type OnboardingConfig, type OnboardingQuestion } from "../../../../core/bots/botProtocol";
import { OnboardingDialog } from "../../../bots/OnboardingDialog";
import { BOT_STATE_TYPES, readBots, readOnboarding, saveOnboarding, useSpaceState } from "../../../../core/bots/serverBots";
import { readRoles } from "../../../../core/roles/applyRoles";
import { CloseIcon } from "../../../components/CloseIcon";

interface OnboardingTabProps {
    client: MatrixClient;
    spaceRoom: Room;
    channels: Room[];
    onToast: (toast: Omit<ToastState, "id">) => void;
}

const newId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function OnboardingTab({ client, spaceRoom, channels, onToast }: OnboardingTabProps): React.ReactElement {
    const revision = useSpaceState(spaceRoom, BOT_STATE_TYPES);
    const saved = useMemo(() => readOnboarding(spaceRoom), [spaceRoom, revision]);
    const roles = useMemo(() => readRoles(spaceRoom), [spaceRoom, revision]);
    const hasBot = readBots(spaceRoom).length > 0;
    const canEdit = spaceRoom.currentState.maySendStateEvent(ONBOARDING_EVENT, client.getSafeUserId());
    const [draft, setDraft] = useState<OnboardingConfig>(saved);
    const [rulesText, setRulesText] = useState(saved.rules.join("\n"));
    const [giveExisting, setGiveExisting] = useState(true);
    const [busy, setBusy] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const textChannels = channels.filter((channel) => !channel.isSpaceRoom());

    const update = (patch: Partial<OnboardingConfig>): void => setDraft((current) => ({ ...current, ...patch }));
    const updateQuestion = (index: number, patch: Partial<OnboardingQuestion>): void =>
        setDraft((current) => ({ ...current, questions: current.questions.map((question, at) => (at === index ? { ...question, ...patch } : question)) }));

    const save = async (): Promise<void> => {
        const config: OnboardingConfig = {
            ...draft,
            rules: rulesText.split("\n").map((rule) => rule.trim()).filter(Boolean),
            questions: draft.questions
                .map((question) => ({ ...question, prompt: question.prompt.trim(), answers: question.answers.filter((answer) => answer.label.trim()) }))
                .filter((question) => question.prompt && question.answers.length > 0),
        };
        if (config.enabled && config.gate === "enforced" && !config.memberRoleId) {
            onToast({ type: "error", message: "Pick the role members get, so channels know who may talk." });
            return;
        }
        setBusy(true);
        try {
            await saveOnboarding(client, spaceRoom, textChannels, config, { giveExistingMembersRole: giveExisting });
            onToast({ type: "success", message: "Onboarding saved." });
        } catch (error) {
            onToast({ type: "error", message: error instanceof Error ? error.message : "Couldn't save onboarding." });
        } finally {
            setBusy(false);
        }
    };

    const disabled = busy || !canEdit;
    return (
        <div className="settings-tab" data-testid="onboarding-tab">
            <h2 className="settings-tab-title">Onboarding</h2>
            <p className="settings-tab-description">New members read the rules and answer a few questions before they talk. Answers can give roles.</p>

            <div className="settings-section-card">
                <label className="settings-toggle">
                    <input type="checkbox" checked={draft.enabled} onChange={(event) => update({ enabled: event.target.checked })} disabled={disabled} data-testid="onboarding-enabled" />
                    Turn on onboarding
                </label>
                <label className="settings-field">
                    <span>Introduction</span>
                    <textarea value={draft.intro} onChange={(event) => update({ intro: event.target.value })} rows={3} maxLength={1000} disabled={disabled} placeholder="Welcome! Here's how this hall works." />
                </label>
                <label className="settings-field">
                    <span>Rules (one per line)</span>
                    <textarea value={rulesText} onChange={(event) => setRulesText(event.target.value)} rows={5} disabled={disabled} aria-label="Rules" placeholder={"Be kind\nNo spam or advertising"} />
                </label>
            </div>

            <div className="settings-section-card">
                <h3>Questions</h3>
                {draft.questions.map((question, index) => (
                    <fieldset key={question.id} className="settings-fieldset onboarding-question" data-testid="onboarding-question">
                        <legend>Question {index + 1}</legend>
                        <label className="settings-field">
                            <span>Question</span>
                            <input value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} maxLength={200} disabled={disabled} aria-label="Question" />
                        </label>
                        <label className="settings-toggle">
                            <input type="checkbox" checked={question.multiple} onChange={(event) => updateQuestion(index, { multiple: event.target.checked })} disabled={disabled} />
                            Members can pick more than one answer
                        </label>
                        <label className="settings-toggle">
                            <input type="checkbox" checked={!question.required} onChange={(event) => updateQuestion(index, { required: !event.target.checked })} disabled={disabled} />
                            Optional
                        </label>
                        {question.answers.map((answer, answerIndex) => (
                            <div key={answer.id} className="onboarding-answer-row">
                                <input
                                    value={answer.label}
                                    onChange={(event) => updateQuestion(index, { answers: question.answers.map((item, at) => (at === answerIndex ? { ...item, label: event.target.value } : item)) })}
                                    maxLength={80}
                                    disabled={disabled}
                                    aria-label={`Answer ${answerIndex + 1}`}
                                    placeholder="Answer"
                                />
                                <select
                                    value={answer.roleId ?? ""}
                                    onChange={(event) =>
                                        updateQuestion(index, {
                                            answers: question.answers.map((item, at) => (at === answerIndex ? { id: item.id, label: item.label, ...(event.target.value ? { roleId: event.target.value } : {}) } : item)),
                                        })
                                    }
                                    disabled={disabled}
                                    aria-label={`Role for answer ${answerIndex + 1}`}
                                >
                                    <option value="">No role</option>
                                    {roles.map((role) => (
                                        <option key={role.id} value={role.id}>
                                            Gives {role.name}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="settings-button settings-button-secondary"
                                    onClick={() => updateQuestion(index, { answers: question.answers.filter((_, at) => at !== answerIndex) })}
                                    disabled={disabled}
                                    aria-label={`Remove answer ${answerIndex + 1}`}
                                >
                                    <CloseIcon size={14} />
                                </button>
                            </div>
                        ))}
                        <div className="settings-actions-row">
                            <button
                                type="button"
                                className="settings-button settings-button-secondary"
                                onClick={() => updateQuestion(index, { answers: [...question.answers, { id: newId("a"), label: "" }] })}
                                disabled={disabled || question.answers.length >= 12}
                            >
                                Add answer
                            </button>
                            <button
                                type="button"
                                className="settings-button settings-button-danger"
                                onClick={() => update({ questions: draft.questions.filter((_, at) => at !== index) })}
                                disabled={disabled}
                            >
                                Remove question
                            </button>
                        </div>
                    </fieldset>
                ))}
                <button
                    type="button"
                    className="settings-button settings-button-secondary"
                    onClick={() => update({ questions: [...draft.questions, { id: newId("q"), prompt: "", multiple: false, required: true, answers: [{ id: newId("a"), label: "" }] }] })}
                    disabled={disabled || draft.questions.length >= 10}
                    data-testid="onboarding-add-question"
                >
                    Add question
                </button>
            </div>

            <div className="settings-section-card">
                <h3>Who can talk</h3>
                <label className="settings-field">
                    <span>Role members get when they finish</span>
                    <select value={draft.memberRoleId ?? ""} onChange={(event) => update({ memberRoleId: event.target.value || null })} disabled={disabled} aria-label="Member role">
                        <option value="">None</option>
                        {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                                {role.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="settings-toggle">
                    <input type="radio" name="onboarding-gate" checked={draft.gate === "soft"} onChange={() => update({ gate: "soft" })} disabled={disabled} />
                    Ask first: Meadhall shows onboarding before new members write (other apps aren&apos;t stopped)
                </label>
                <label className="settings-toggle">
                    <input type="radio" name="onboarding-gate" checked={draft.gate === "enforced"} onChange={() => update({ gate: "enforced" })} disabled={disabled} data-testid="onboarding-enforced" />
                    Require it: only members with the role can talk in any channel (enforced by the homeserver)
                </label>
                {draft.gate === "enforced" ? (
                    <>
                        <label className="settings-toggle">
                            <input type="checkbox" checked={giveExisting} onChange={(event) => setGiveExisting(event.target.checked)} disabled={disabled} />
                            Give the role to everyone already here, so they can keep talking
                        </label>
                        {!hasBot ? (
                            <p className="settings-inline-error">
                                No bot in this space: a moderator&apos;s Meadhall gives the role when someone finishes, but only while a moderator is
                                online, so new members may wait. Add a bot (Space Settings → Bots) to give it straight away.
                            </p>
                        ) : null}
                    </>
                ) : null}
            </div>

            <div className="settings-section-card">
                <h3>Welcome message</h3>
                <label className="settings-toggle">
                    <input type="checkbox" checked={draft.welcome.enabled} onChange={(event) => update({ welcome: { ...draft.welcome, enabled: event.target.checked } })} disabled={disabled} />
                    The bot welcomes new members
                </label>
                <label className="settings-field">
                    <span>Channel</span>
                    <select
                        value={draft.welcome.channelId ?? ""}
                        onChange={(event) => update({ welcome: { ...draft.welcome, channelId: event.target.value || null } })}
                        disabled={disabled}
                        aria-label="Welcome channel"
                    >
                        <option value="">Pick a channel</option>
                        {textChannels.map((channel) => (
                            <option key={channel.roomId} value={channel.roomId}>
                                #{channel.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="settings-field">
                    <span>Message ({"{user}"} is their name)</span>
                    <input value={draft.welcome.message} onChange={(event) => update({ welcome: { ...draft.welcome, message: event.target.value } })} maxLength={500} disabled={disabled} aria-label="Welcome message" />
                </label>
            </div>

            <p className="settings-inline-note">Members&apos; answers are stored in the space, so its members can see them.</p>
            <p className="settings-inline-note">Admins and moderators (power 50 and up) skip onboarding, so you won&apos;t see it yourself: use Preview.</p>
            <div className="settings-actions-row">
                <button type="button" className="settings-button settings-button-secondary" onClick={() => setPreviewOpen(true)} disabled={!saved.enabled} data-testid="onboarding-preview">
                    Preview as a newcomer
                </button>
                <button type="button" className="settings-button" onClick={() => void save()} disabled={disabled} data-testid="onboarding-save">
                    {busy ? "Saving…" : "Save onboarding"}
                </button>
            </div>
            <OnboardingDialog client={client} space={spaceRoom} open={previewOpen} onClose={() => setPreviewOpen(false)} preview />
        </div>
    );
}
