import {
    IConfigurationExtend,
    IEnvironmentRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
    ISetting,
    SettingType,
} from "@rocket.chat/apps-engine/definition/settings";

enum SettingsKeys {
    JIRA_DOMAIN = "jira_domain",
    JIRA_USER = "jira_user",
    JIRA_TOKEN = "jira_token",
}

export class Settings {
    private _jiraDomain: string;
    private _jiraUser: string;
    private _jiraToken: string;
    private envReader: IEnvironmentRead;

    constructor(
        configuration: IConfigurationExtend,
        envReader: IEnvironmentRead
    ) {
        this.envReader = envReader;

        configuration.settings.provideSetting({
            id: SettingsKeys.JIRA_DOMAIN,
            type: SettingType.STRING,
            required: true,
            public: false,
            i18nLabel: "settings_jira_domain_label",
            i18nDescription: "settings_jira_domain_description",
            packageValue: "", // default value
        });
        configuration.settings.provideSetting({
            id: SettingsKeys.JIRA_USER,
            type: SettingType.STRING,
            required: true,
            public: false,
            i18nLabel: "settings_jira_user_email_label",
            i18nDescription: "settings_jira_user_email_description",
            packageValue: "", // default value
        });
        configuration.settings.provideSetting({
            id: SettingsKeys.JIRA_TOKEN,
            type: SettingType.CODE,
            required: true,
            public: false,
            i18nLabel: "settings_jira_user_token_label",
            i18nDescription: "settings_jira_user_token_description",
            packageValue: "", // default value
        });

        this.getSettings();
    }

    public async getSettings(): Promise<void> {
        for (const value of enumKeys(SettingsKeys)) {
            this.onUpdate(
                await this.envReader.getSettings().getById(SettingsKeys[value])
            );
        }
    }

    public validateSetting(setting: ISetting): boolean {
        switch (setting.id) {
            case SettingsKeys.JIRA_DOMAIN:
                return (
                    setting.value &&
                    !!(setting.value as string).match(
                        /^((?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,6}$/
                    )
                );

            default:
                // return true if the setting is not required or if it's value is not empty
                return !setting.required || (setting.value && !!setting.value);
        }
    }

    public onUpdate(setting: ISetting) {
        switch (setting.id) {
            case SettingsKeys.JIRA_DOMAIN:
                this._jiraDomain = setting.value;
                break;

            case SettingsKeys.JIRA_USER:
                this._jiraUser = setting.value;
                break;

            case SettingsKeys.JIRA_TOKEN:
                this._jiraToken = setting.value;
                break;
        }
    }

    public get jiraDomain(): string {
        return this._jiraDomain;
    }

    public get jiraUser(): string {
        return this._jiraUser;
    }

    public get jiraToken(): string {
        return this._jiraToken;
    }
}

function enumKeys<O extends object, K extends keyof O = keyof O>(obj: O): K[] {
    return Object.keys(obj).filter((k) => Number.isNaN(+k)) as K[];
}
