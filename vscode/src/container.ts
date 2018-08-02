"use strict";
import { ExtensionContext } from "vscode";
import { CodeStreamAgentConnection, CodeStreamAgentOptions } from "./agent/agentConnection";
import { CodeStreamSession } from "./api/session";
import { Commands } from "./commands";
import { Config, configuration } from "./configuration";
import { LinkActionsController } from "./controllers/linkActionsController";
import { LiveShareController } from "./controllers/liveShareController";
import { NotificationsController } from "./controllers/notificationsController";
import { StatusBarController } from "./controllers/statusBarController";
import { StreamViewController } from "./controllers/streamViewController";
import { GitService, IGitService } from "./git/gitService";
import { CodeStreamCodeActionProvider } from "./providers/codeActionProvider";
import { MarkerDecorationProvider } from "./providers/markerDecorationProvider";
// import { CodeStreamCodeLensProvider } from './providers/codeLensProvider';
// import { UnreadDecorationProvider } from './providers/decorationProvider';

export class Container {
	static async initialize(
		context: ExtensionContext,
		config: Config,
		agentOptions: CodeStreamAgentOptions
	) {
		this._context = context;
		this._config = config;

		this._agent = new CodeStreamAgentConnection(context, agentOptions);

		this._git = new GitService();
		context.subscriptions.push((this._session = new CodeStreamSession(config.serverUrl)));

		context.subscriptions.push((this._notifications = new NotificationsController()));
		context.subscriptions.push((this._linkActions = new LinkActionsController()));
		context.subscriptions.push((this._liveShare = new LiveShareController()));

		context.subscriptions.push((this._commands = new Commands()));
		context.subscriptions.push((this._codeActions = new CodeStreamCodeActionProvider()));
		// context.subscriptions.push(this._codeLens = new CodeStreamCodeLensProvider());
		context.subscriptions.push((this._markerDecorations = new MarkerDecorationProvider()));
		context.subscriptions.push((this._statusBar = new StatusBarController()));
		// context.subscriptions.push(this._unreadDecorator = new UnreadDecorationProvider());

		context.subscriptions.push((this._streamView = new StreamViewController(this._session)));
	}

	private static _agent: CodeStreamAgentConnection;
	static get agent() {
		return this._agent;
	}

	private static _codeActions: CodeStreamCodeActionProvider;
	static get codeActions() {
		return this._codeActions;
	}

	// private static _codeLens: CodeStreamCodeLensProvider;
	// static get codeLens() {
	//     return this._codeLens;
	// }

	private static _commands: Commands;
	static get commands() {
		return this._commands;
	}

	private static _config: Config | undefined;
	static get config() {
		if (this._config === undefined) {
			this._config = configuration.get<Config>();
		}
		return this._config;
	}

	private static _context: ExtensionContext;
	static get context() {
		return this._context;
	}

	private static _git: IGitService;
	static get git() {
		return this._git;
	}

	static overrideGit(git: IGitService) {
		this._git = git;
	}

	private static _linkActions: LinkActionsController;
	static get linkActions() {
		return this._linkActions;
	}

	private static _liveShare: LiveShareController;
	static get liveShare() {
		return this._liveShare;
	}

	private static _markerDecorations: MarkerDecorationProvider;
	static get markerDecorations() {
		return this._markerDecorations;
	}

	private static _notifications: NotificationsController;
	static get notifications() {
		return this._notifications;
	}

	private static _statusBar: StatusBarController;
	static get statusBar() {
		return this._statusBar;
	}

	private static _session: CodeStreamSession;
	static get session(): CodeStreamSession {
		return this._session;
	}

	private static _streamView: StreamViewController;
	static get streamView() {
		return this._streamView;
	}

	// private static _unreadDecorator: UnreadDecorationProvider;
	// static get unreadDecorator(): UnreadDecorationProvider {
	//     return this._unreadDecorator;
	// }

	static resetConfig() {
		this._config = undefined;
	}
}
