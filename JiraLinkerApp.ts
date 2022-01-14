import {
    HttpStatusCode,
    IAppAccessors,
    IConfigurationExtend,
    IConfigurationModify,
    IEnvironmentRead,
    IHttp,
    IHttpResponse,
    ILogger,
    IMessageBuilder,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { App } from "@rocket.chat/apps-engine/definition/App";
import {
    IMessage,
    IPostMessageSent,
    IPreMessageUpdatedModify,
} from "@rocket.chat/apps-engine/definition/messages";
import { IAppInfo } from "@rocket.chat/apps-engine/definition/metadata";
import { ISetting } from "@rocket.chat/apps-engine/definition/settings";
import { ISettingUpdateContext } from "@rocket.chat/apps-engine/definition/settings/ISettingUpdateContext";
import { Settings } from "./src/Settings";

export class JiraCloudIssueLinkerApp
    extends App
    implements IPreMessageUpdatedModify, IPostMessageSent
{
    private _settings: Settings;

    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async extendConfiguration(
        configuration: IConfigurationExtend,
        environmentRead: IEnvironmentRead
    ): Promise<void> {
        this._settings = new Settings(configuration, environmentRead);
    }

    public async onPreSettingUpdate(
        context: ISettingUpdateContext,
        _configurationModify: IConfigurationModify,
        _read: IRead,
        _http: IHttp
    ): Promise<ISetting> {
        const valid = this._settings.validateSetting(context.newSetting);
        return valid ? context.newSetting : context.oldSetting; // TODO: is there a better way?
    }

    public async onSettingUpdated(
        setting: ISetting,
        _configurationModify: IConfigurationModify,
        _read: IRead,
        _http: IHttp
    ): Promise<void> {
        this.getLogger().debug("updating setting", setting.id, setting.value);
        this._settings.onUpdate(setting);
    }

    public async checkPreMessageUpdatedModify(
        message: IMessage
    ): Promise<boolean> {
        return this.checkPreMessageModify(message);
    }

    public async executePreMessageUpdatedModify(
        message: IMessage,
        builder: IMessageBuilder,
        read: IRead,
        http: IHttp,
        persistence: IPersistence
    ): Promise<IMessage> {
        return this.onMessage(message, builder, read, http, persistence);
    }

    public async checkPostMessageSent(message: IMessage): Promise<boolean> {
        const matches = this.extractIssueKeys(message);
        return matches.length > 0;
    }

    public async executePostMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<void> {
        if (!message.id) return;

        // const editor = (await read.getUserReader().getAppUser()) || message.sender;
        const editor = message.sender;
        const builder = await modify.getUpdater().message(message.id, editor);

        message = await this.onMessage(
            message,
            builder,
            read,
            http,
            persistence
        );
        if (!message.text || !message.id) return;

        builder.setText(message.text);
        builder.setEditor(editor);

        await modify.getUpdater().finish(builder);
    }

    public async checkPreMessageModify(message: IMessage): Promise<boolean> {
        const matches = this.extractIssueKeys(message);
        return matches.length > 0;
    }

    private async onMessage(
        message: IMessage,
        builder: IMessageBuilder,
        _read: IRead,
        http: IHttp,
        _persistence: IPersistence
    ): Promise<IMessage> {
        this.getLogger().debug(
            "processing message",
            message.id,
            message.sender,
            message.room,
            message.text
        );

        if (!message.text || !message.id) return builder.getMessage();

        this.getLogger().debug("looking for jira issue keys", message.text);
        const matches = this.extractIssueKeys(message);
        this.getLogger().debug("found possible jira issues", matches);

        const jiraDomain = this._settings.jiraDomain;
        const jiraUser = this._settings.jiraUser;
        const jiraToken = this._settings.jiraToken;

        const responses = matches.map((issueKey) =>
            this.checkIfIssueExists(
                issueKey,
                jiraDomain,
                jiraUser,
                jiraToken,
                http
            )
        );
        for await (const response of responses) {
            if (
                !response ||
                response.statusCode != HttpStatusCode.OK ||
                !response.data
            ) {
                this.getLogger().debug(
                    `issue lookup was unsuccessful`,
                    response ? response.url : "<url not available>",
                    {
                        auth: `${jiraUser}:${jiraToken}`,
                    },
                    response
                        ? response.statusCode.toString()
                        : "<statusCode not available>"
                );
                continue;
            }

            const { key: issueKey } = response.data;
            message.text = message.text.replace(
                issueKey,
                `[${issueKey}](https://${jiraDomain}/browse/${issueKey})`
            );
        }

        builder.setText(message.text);
        return builder.getMessage();
    }

    private extractIssueKeys(message: IMessage): string[] {
        if (!message.text) return [];

        const matches = message.text
            .replace(/(?:__|[*#])|\[(.*?)\]\(.*?\)/g, "") // ignore issues that are already linked
            .match(/[A-Z]+-[0-9]+/g); // match possible issue keys

        return matches ? matches.concat() : [];
    }

    private async checkIfIssueExists(
        issueKey: string,
        jiraDomain: string,
        jiraUser: string,
        jiraToken: string,
        http: IHttp
    ): Promise<IHttpResponse> {
        return http.get(`https://${jiraDomain}/rest/api/3/issue/${issueKey}`, {
            auth: `${jiraUser}:${jiraToken}`,
        });
    }
}
