import { DEFAULT_BRAND } from "./branding";
import type { CoreConfig } from "./configTypes";

export const DEFAULT_CORE_CONFIG: Readonly<CoreConfig> = {
    brand: DEFAULT_BRAND,
    disable_custom_urls: false,
    disable_guests: false,
    setting_defaults: {},
    features: {},
};
