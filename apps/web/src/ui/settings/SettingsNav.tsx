import React from "react";

import { t, useLanguage } from "../i18n";

export interface SettingsNavItem {
    id: string;
    label: string;
}

export interface SettingsNavSection {
    title: string;
    items: SettingsNavItem[];
}

interface SettingsNavProps {
    sections: SettingsNavSection[];
    activeTab: string;
    onChangeTab: (tabId: string) => void;
}

export function SettingsNav({ sections, activeTab, onChangeTab }: SettingsNavProps): React.ReactElement {
    useLanguage();
    return (
        <nav className="settings-nav" aria-label={t("Settings sections")}>
            {sections.map((section) => (
                <section className="settings-nav-section" key={section.title}>
                    <h3 className="settings-nav-title">{t(section.title)}</h3>
                    <div className="settings-nav-items">
                        {section.items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`settings-nav-item${activeTab === item.id ? " is-active" : ""}`}
                                onClick={() => onChangeTab(item.id)}
                            >
                                {t(item.label)}
                            </button>
                        ))}
                    </div>
                </section>
            ))}
        </nav>
    );
}

