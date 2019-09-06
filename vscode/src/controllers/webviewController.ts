"use strict";
import {
	ApiVersionCompatibility,
	ConnectionStatus,
	DidChangeApiVersionCompatibilityNotification,
	DidChangeApiVersionCompatibilityNotificationType,
	DidChangeConnectionStatusNotification,
	DidChangeConnectionStatusNotificationType,
	DidChangeDataNotification,
	DidChangeDataNotificationType,
	DidChangeDocumentMarkersNotification,
	DidChangeDocumentMarkersNotificationType,
	DidChangeVersionCompatibilityNotification,
	DidChangeVersionCompatibilityNotificationType,
	ReportingMessageType,
	VersionCompatibility
} from "@codestream/protocols/agent";
import { CodemarkType, CSApiCapabilities } from "@codestream/protocols/api";
import {
	ActiveEditorInfo,
	ApplyMarkerRequestType,
	BootstrapInHostRequestType,
	CompareMarkerRequestType,
	EditorContext,
	EditorHighlightRangeRequestType,
	EditorRevealRangeRequestType,
	EditorScrollToNotificationType,
	EditorSelectRangeRequestType,
	GetActiveEditorContextRequestType,
	HostDidChangeActiveEditorNotificationType,
	HostDidChangeConfigNotificationType,
	HostDidChangeEditorSelectionNotificationType,
	HostDidChangeEditorVisibleRangesNotificationType,
	HostDidLogoutNotificationType,
	HostDidReceiveRequestNotificationType,
	InsertTextRequestType,
	IpcRoutes,
	isIpcRequestMessage,
	isIpcResponseMessage,
	LiveShareInviteToSessionRequestType,
	LiveShareJoinSessionRequestType,
	LiveShareStartSessionRequestType,
	LogoutRequestType,
	NewCodemarkNotificationType,
	ReloadWebviewRequestType,
	ShellPromptFolderRequestType,
	ShowCodemarkNotificationType,
	UpdateConfigurationRequestType,
	WebviewContext,
	WebviewDidChangeContextNotificationType,
	WebviewDidInitializeNotificationType,
	WebviewIpcMessage,
	WebviewIpcNotificationMessage,
	WebviewIpcRequestMessage,
	WebviewPanels
} from "@codestream/protocols/webview";
import * as fs from "fs";
import { gate } from "system/decorators/gate";
import {
	ConfigurationChangeEvent,
	ConfigurationTarget,
	Disposable,
	OpenDialogOptions,
	TextEditor,
	TextEditorSelectionChangeEvent,
	TextEditorVisibleRangesChangeEvent,
	Uri,
	ViewColumn,
	window,
	workspace
} from "vscode";
import { NotificationType, RequestType } from "vscode-languageclient";
import {
	CodeStreamSession,
	SessionSignedOutReason,
	SessionStatus,
	SessionStatusChangedEvent,
	StreamThread
} from "../api/session";
import { WorkspaceState } from "../common";
import { configuration } from "../configuration";
import { Container } from "../container";
import { Editor } from "../extensions";
import { Logger } from "../logger";
import { Functions, log } from "../system";
import { CodeStreamWebviewPanel, toLoggableIpcMessage } from "../webviews/webviewPanel";

const emptyObj = {};

export interface WebviewState {
	hidden: boolean;
	teams: {
		[teamId: string]: {
			context?: WebviewContext;
		};
	};
}

export class WebviewController implements Disposable {
	// private _bootstrapPromise: Promise<BootstrapResponse> | undefined;
	private _context: WebviewContext | undefined;
	private _disposable: Disposable | undefined;
	private _disposableWebview: Disposable | undefined;
	private _webview: CodeStreamWebviewPanel | undefined;
	private _versionCompatibility: VersionCompatibility | undefined;
	private _apiVersionCompatibility: ApiVersionCompatibility | undefined;
	private _missingCapabilities: CSApiCapabilities | undefined;

	private readonly _notifyActiveEditorChangedDebounced: (e: TextEditor | undefined) => void;

	constructor(public readonly session: CodeStreamSession) {
		this._disposable = Disposable.from(
			this.session.onDidChangeSessionStatus(this.onSessionStatusChanged, this),
			window.onDidChangeActiveTextEditor(this.onActiveEditorChanged, this),
			window.onDidChangeVisibleTextEditors(this.onVisibleEditorsChanged, this)
		);

		this._lastEditor = Editor.getActiveOrVisible();

		this._notifyActiveEditorChangedDebounced = Functions.debounce(
			this.notifyActiveEditorChanged,
			500
		);
	}

	dispose() {
		this._disposable && this._disposable.dispose();
		this.closeWebview();
	}

	private _lastEditor: TextEditor | undefined;
	private _lastEditorUrl: string | undefined;
	private setLastEditor(editor: TextEditor | undefined) {
		if (this._lastEditor === editor) return;
		// If the new editor is not a real editor ignore it
		if (editor !== undefined && !Editor.isTextEditor(editor)) return;

		this._lastEditor = editor;
		this._notifyActiveEditorChangedDebounced(editor);
	}

	private onActiveEditorChanged(e: TextEditor | undefined) {
		this.setLastEditor(Editor.getActiveOrVisible(e));
	}

	private async onSessionStatusChanged(e: SessionStatusChangedEvent) {
		const status = e.getStatus();
		switch (status) {
			case SessionStatus.SignedOut:
				if (e.reason === SessionSignedOutReason.SignInFailure) {
					if (!this.visible) {
						this.show();
					}
					break;
				}

				if (
					this._webview !== undefined &&
					e.reason === SessionSignedOutReason.UserSignedOutFromExtension
				) {
					if (this._webview !== undefined) {
						this._webview.notify(HostDidLogoutNotificationType, {});
					}
					break;
				}

				break;

			case SessionStatus.SignedIn:
				this._lastEditor = Editor.getActiveOrVisible();

				const state = Container.context.workspaceState.get<WebviewState>(
					WorkspaceState.webviewState,
					{
						hidden: false,
						teams: {}
					}
				);
				const { context } = state.teams[this.session.team.id];
				this._context = context;

				if (!state.hidden) {
					this.show();
				}

				break;
		}
	}

	private onVisibleEditorsChanged(e: TextEditor[]) {
		// If the last editor is still in the visible list do nothing
		if (this._lastEditor !== undefined && e.includes(this._lastEditor)) return;

		this.setLastEditor(Editor.getActiveOrVisible());
	}

	get activeStreamThread() {
		if (this._context === undefined) {
			return undefined;
		}
		return {
			id: this._context.threadId,
			streamId: this._context.currentStreamId
		};
	}

	get viewColumn(): ViewColumn | undefined {
		return this._webview === undefined ? undefined : this._webview.viewColumn;
	}

	get visible() {
		return this._webview === undefined ? false : this._webview.visible;
	}

	@log()
	hide() {
		if (this._webview === undefined) return;

		this._webview.dispose();
	}

	@log()
	async newCodemarkRequest(type: CodemarkType, editor: TextEditor, source: string): Promise<void> {
		if (this.visible) {
			await this._webview!.show();
		} else {
			await this.show();
		}

		// TODO: Change this to be a request vs a notification
		this._webview!.notify(NewCodemarkNotificationType, {
			uri: editor.document.uri.toString(),
			range: Editor.toSerializableRange(editor.selection),
			type: type,
			source: source
		});
	}

	@log()
	async openCodemark(
		codemarkId: string,
		options: { onlyWhenVisible?: boolean; sourceUri?: Uri } = {}
	): Promise<void> {
		if (!this.visible) {
			if (options.onlyWhenVisible) return;

			await this.show();
		}

		// TODO: Change this to be a request vs a notification
		this._webview!.notify(ShowCodemarkNotificationType, {
			codemarkId: codemarkId,
			sourceUri: options.sourceUri && options.sourceUri.toString()
		});
	}

	@log()
	reload() {
		if (this._webview === undefined || !this.visible) return;

		return this._webview.reload();
	}

	@gate()
	@log()
	private async ensureWebView() {
		if (this._webview === undefined) {
			// // Kick off the bootstrap compute to be ready for later
			// this._bootstrapPromise = this.getBootstrap();

			this._webview = new CodeStreamWebviewPanel(this.session, await this.getHtml());

			const webview = this._webview;

			this._disposableWebview = Disposable.from(
				this._webview.onDidClose(this.onWebviewClosed, this),
				this._webview.onDidMessageReceive(
					(...args) => this.onWebviewMessageReceived(webview, ...args),
					this
				),
				Container.agent.onDidChangeConnectionStatus(
					(...args) => this.onConnectionStatusChanged(webview, ...args),
					this
				),
				Container.agent.onDidChangeData((...args) => this.onDataChanged(webview, ...args), this),
				Container.agent.onDidChangeDocumentMarkers(
					(...args) => this.onDocumentMarkersChanged(webview, ...args),
					this
				),
				window.onDidChangeTextEditorSelection(
					Functions.debounce<(e: TextEditorSelectionChangeEvent) => any>(
						(...args) => this.onEditorSelectionChanged(webview, ...args),
						250,
						{
							maxWait: 250
						}
					),
					this
				),
				window.onDidChangeTextEditorVisibleRanges(
					(...args) => this.onEditorVisibleRangesChanged(webview, ...args),
					this
				),
				configuration.onDidChange((...args) => this.onConfigurationChanged(webview, ...args), this),

				// Keep this at the end otherwise the above subscriptions can fire while disposing
				this._webview
			);

			Container.agent.telemetry.track("Webview Opened");
		}
	}

	@log({
		args: false
	})
	async show(streamThread?: StreamThread) {
		await this.ensureWebView();

		this.updateState();
		await this._webview!.show(streamThread);

		return this.activeStreamThread as StreamThread | undefined;
	}

	@log({
		args: false
	})
	async onVersionChanged(e: DidChangeVersionCompatibilityNotification) {
		if (e.compatibility === VersionCompatibility.UnsupportedUpgradeRequired) {
			this._versionCompatibility = e.compatibility;
		}
		if (!this.visible) {
			await this.show();
		}

		this._webview!.notify(DidChangeVersionCompatibilityNotificationType, e);
	}

	@log({
		args: false
	})
	async handleProtocol(uri: Uri) {
		if (!this.visible) {
			await this.show();
		}

		this._webview!.notify(HostDidReceiveRequestNotificationType, {
			url: uri.toString()
		});
	}

	@log()
	async onApiVersionChanged(e: DidChangeApiVersionCompatibilityNotification) {
		this._apiVersionCompatibility = e.compatibility;
		if (e.compatibility === ApiVersionCompatibility.ApiUpgradeRecommended) {
			this._missingCapabilities = e.missingCapabilities || {};
		}
		if (!this.visible) {
			await this.show();
		}

		this._webview!.notify(DidChangeApiVersionCompatibilityNotificationType, e);
	}

	@log()
	toggle() {
		return this.visible ? this.hide() : this.show();
	}

	private async onConnectionStatusChanged(
		webview: CodeStreamWebviewPanel,
		e: DidChangeConnectionStatusNotification
	) {
		if (!webview.visible) return;

		switch (e.status) {
			case ConnectionStatus.Disconnected:
				// TODO: Handle this
				break;

			case ConnectionStatus.Reconnecting:
				webview.notify(DidChangeConnectionStatusNotificationType, e);
				break;

			case ConnectionStatus.Reconnected:
				if (e.reset) {
					void (await this.reload());

					return;
				}

				webview.notify(DidChangeConnectionStatusNotificationType, e);
				break;
		}
	}

	private onConfigurationChanged(webview: CodeStreamWebviewPanel, e: ConfigurationChangeEvent) {
		if (
			configuration.changed(e, configuration.name("traceLevel").value) ||
			configuration.changed(e, configuration.name("showAvatars").value)
		) {
			webview.notify(HostDidChangeConfigNotificationType, {
				debug: Logger.isDebugging,
				showHeadshots: Container.config.showAvatars
			});
		}
	}

	private onDataChanged(webview: CodeStreamWebviewPanel, e: DidChangeDataNotification) {
		webview.notify(DidChangeDataNotificationType, e);
	}

	private onDocumentMarkersChanged(
		webview: CodeStreamWebviewPanel,
		e: DidChangeDocumentMarkersNotification
	) {
		webview.notify(DidChangeDocumentMarkersNotificationType, e);
	}

	private async onEditorSelectionChanged(
		webview: CodeStreamWebviewPanel,
		e: TextEditorSelectionChangeEvent
	) {
		if (e.textEditor !== this._lastEditor) return;

		webview.notify(HostDidChangeEditorSelectionNotificationType, {
			uri: e.textEditor.document.uri.toString(),
			selections: Editor.toEditorSelections(e.selections),
			visibleRanges: Editor.toSerializableRange(e.textEditor.visibleRanges),
			lineCount: e.textEditor.document.lineCount
		});
	}

	private onEditorVisibleRangesChanged(
		webview: CodeStreamWebviewPanel,
		e: TextEditorVisibleRangesChangeEvent
	) {
		if (e.textEditor !== this._lastEditor) return;

		const uri = e.textEditor.document.uri;
		if (uri.scheme !== "file") return;

		webview.notify(HostDidChangeEditorVisibleRangesNotificationType, {
			uri: uri.toString(),
			selections: Editor.toEditorSelections(e.textEditor.selections),
			visibleRanges: Editor.toSerializableRange(e.visibleRanges),
			lineCount: e.textEditor.document.lineCount
		});
	}

	private onWebviewClosed() {
		this.closeWebview("user");
	}

	private async onWebviewMessageReceived(webview: CodeStreamWebviewPanel, e: WebviewIpcMessage) {
		try {
			Logger.log(`Webview: Received message ${toLoggableIpcMessage(e)} from the webview`);

			if (isIpcResponseMessage(e)) {
				webview.onCompletePendingIpcRequest(e);
				return;
			}

			const target = e.method.split("/")[0];
			switch (target) {
				case IpcRoutes.Agent:
					if (isIpcRequestMessage(e)) {
						webview.onIpcRequest(new RequestType<any, any, any, any>(e.method), e, (type, params) =>
							Container.agent.sendRequest(type, params)
						);

						return;
					}

					Container.agent.sendNotification(new NotificationType<any, any>(e.method), e.params);

					return;

				case IpcRoutes.Host:
					if (isIpcRequestMessage(e)) {
						this.onWebviewRequest(webview, e);

						return;
					}

					this.onWebviewNotification(webview, e);
			}
		} catch (ex) {
			debugger;
			Container.agent.reportMessage(ReportingMessageType.Error, ex.message);
			Logger.error(ex);
		}
	}

	private onWebviewNotification(webview: CodeStreamWebviewPanel, e: WebviewIpcNotificationMessage) {
		switch (e.method) {
			case WebviewDidInitializeNotificationType.method: {
				// view is rendered and ready to receive messages
				webview.onIpcReady();

				break;
			}
			case WebviewDidChangeContextNotificationType.method: {
				webview.onIpcNotification(WebviewDidChangeContextNotificationType, e, (type, params) => {
					this._context = params.context;
					this.updateState();
				});

				break;
			}
			case EditorScrollToNotificationType.method: {
				webview.onIpcNotification(
					EditorScrollToNotificationType,
					e,
					(type, { uri, position, ...options }) => {
						Editor.scrollTo(Uri.parse(uri), Editor.fromSerializablePosition(position), options);
					}
				);

				break;
			}
			default: {
				debugger;
				throw new Error(`Unhandled webview notification: ${e.method}`);
			}
		}
	}

	@gate()
	private ensureSignedInOrOut() {
		if (
			this.session.status === SessionStatus.SignedIn ||
			this.session.status === SessionStatus.SignedOut
		) {
			return Promise.resolve(this.session.status);
		}

		return new Promise(resolve => {
			let disposable: Disposable;
			disposable = this.session.onDidChangeSessionStatus(e => {
				const status = e.getStatus();
				if (status === SessionStatus.SignedIn || status === SessionStatus.SignedOut) {
					resolve(status);
					disposable.dispose();
				}
			});
		});
	}

	private async onWebviewRequest(webview: CodeStreamWebviewPanel, e: WebviewIpcRequestMessage) {
		switch (e.method) {
			case BootstrapInHostRequestType.method: {
				Logger.log(`WebviewPanel: Bootstrapping webview...`, `SignedIn=${this.session.signedIn}`);
				webview.onIpcRequest(BootstrapInHostRequestType, e, async (type, params) => {
					return await this.getBootstrap();
				});
				break;
			}
			case LogoutRequestType.method: {
				webview.onIpcRequest(LogoutRequestType, e, async (type, params) => {
					await Container.commands.signOut(SessionSignedOutReason.UserSignedOutFromWebview);
					return emptyObj;
				});

				break;
			}
			case GetActiveEditorContextRequestType.method: {
				webview.onIpcRequest(GetActiveEditorContextRequestType, e, async (type, params) => {
					return { editorContext: this.getActiveEditorContext() };
				});
				break;
			}
			case EditorHighlightRangeRequestType.method: {
				webview.onIpcRequest(EditorHighlightRangeRequestType, e, async (type, params) => {
					const success = await Editor.highlightRange(
						Uri.parse(params.uri),
						Editor.fromSerializableRange(params.range),
						!params.highlight
					);
					return { success: success };
				});

				break;
			}
			case EditorRevealRangeRequestType.method: {
				webview.onIpcRequest(EditorRevealRangeRequestType, e, async (type, params) => {
					const success = await Editor.revealRange(
						Uri.parse(params.uri),
						Editor.fromSerializableRange(params.range),
						{
							preserveFocus: params.preserveFocus,
							atTop: params.atTop
						}
					);
					return { success: success };
				});

				break;
			}
			case EditorSelectRangeRequestType.method: {
				webview.onIpcRequest(EditorSelectRangeRequestType, e, async (type, params) => {
					const success = await Editor.selectRange(
						Uri.parse(params.uri),
						Editor.fromSerializableRange(params.selection),
						{
							preserveFocus: params.preserveFocus
						}
					);
					return { success: success };
				});

				break;
			}
			case InsertTextRequestType.method: {
				webview.onIpcRequest(InsertTextRequestType, e, async (type, params) => {
					void (await Container.commands.insertText({ marker: params.marker, text: params.text }));
					return emptyObj;
				});

				break;
			}
			case ApplyMarkerRequestType.method: {
				webview.onIpcRequest(ApplyMarkerRequestType, e, async (type, params) => {
					void (await Container.commands.applyMarker({ marker: params.marker }));
					return emptyObj;
				});

				break;
			}
			case CompareMarkerRequestType.method: {
				webview.onIpcRequest(CompareMarkerRequestType, e, async (type, params) => {
					void (await Container.commands.showMarkerDiff({ marker: params.marker }));
					return emptyObj;
				});

				break;
			}
			case ReloadWebviewRequestType.method: {
				webview.onIpcRequest(ReloadWebviewRequestType, e, async (type, params) => this.reload());

				break;
			}
			case ShellPromptFolderRequestType.method: {
				webview.onIpcRequest(ShellPromptFolderRequestType, e, async (type, params) => {
					const fileUri = await window.showOpenDialog({
						canSelectMany: false,
						canSelectFiles: false,
						canSelectFolders: true
					});

					let path: string | undefined = undefined;
					if (fileUri && fileUri[0]) {
						path = fileUri[0].fsPath;
					}
					return {
						path: path
					};
				});

				break;
			}
			case UpdateConfigurationRequestType.method: {
				webview.onIpcRequest(UpdateConfigurationRequestType, e, async (type, params) => {
					await configuration.update(params.name, params.value, ConfigurationTarget.Global);
					return emptyObj;
				});

				break;
			}
			case LiveShareInviteToSessionRequestType.method: {
				webview.onIpcRequest(LiveShareInviteToSessionRequestType, e, async (type, params) => {
					await Container.vsls.processRequest({
						type: "invite",
						userId: params.userId,
						createNewStream: params.createNewStream
					});
					return emptyObj;
				});

				break;
			}
			case LiveShareJoinSessionRequestType.method: {
				webview.onIpcRequest(LiveShareJoinSessionRequestType, e, async (type, params) => {
					await Container.vsls.processRequest({
						type: "join",
						url: params.url
					});
					return emptyObj;
				});

				break;
			}
			case LiveShareStartSessionRequestType.method: {
				webview.onIpcRequest(LiveShareStartSessionRequestType, e, async (type, params) => {
					await Container.vsls.processRequest({
						type: "start",
						streamId: params.streamId,
						threadId: params.threadId,
						createNewStream: params.createNewStream
					});
					return emptyObj;
				});

				break;
			}
			default: {
				debugger;
				throw new Error(`Unhandled webview request: ${e.method}`);
			}
		}
	}

	private closeWebview(reason?: "user") {
		try {
			if (reason === "user") {
				Container.agent.telemetry.track("Webview Closed");
			}
			this.updateState(reason === "user");
		} finally {
			if (this._disposableWebview !== undefined) {
				try {
					this._disposableWebview.dispose();
				} catch {}
				this._disposableWebview = undefined;
			}
			this._webview = undefined;
		}
	}

	private async getBootstrap() {
		await this.ensureSignedInOrOut();

		const userId = this.session.signedIn ? this.session.userId : undefined;
		const currentTeamId = this.session.signedIn ? this.session.team.id : undefined;
		return {
			session: {
				userId: userId
			},
			capabilities: this.session.capabilities,
			configs: {
				debug: Logger.isDebugging,
				email: Container.config.email,
				serverUrl: this.session.serverUrl,
				showHeadshots: Container.config.showAvatars,
				team: Container.config.team
			},
			env: this.session.environment,
			ide: {
				name: "VSC"
			},
			context: this._context
				? { ...this._context, currentTeamId: currentTeamId }
				: {
						currentTeamId: currentTeamId
				  },
			version: Container.versionFormatted,
			versionCompatibility: this._versionCompatibility,
			apiVersionCompatibility: this._apiVersionCompatibility,
			missingCapabilities: this._missingCapabilities
		};
	}

	private getActiveEditorContext(): EditorContext {
		let editorContext: EditorContext = {};
		if (this._lastEditor !== undefined) {
			editorContext = {
				activeFile: workspace.asRelativePath(this._lastEditor.document.uri),
				metrics: Editor.getMetrics(),
				textEditorUri: this._lastEditor.document.uri.toString(),
				textEditorVisibleRanges: Editor.toSerializableRange(this._lastEditor.visibleRanges),
				textEditorSelections: Editor.toEditorSelections(this._lastEditor.selections),
				textEditorLineCount: this._lastEditor.document.lineCount
			};
		}
		return editorContext;
	}

	private _html: string | undefined;
	private async getHtml(): Promise<string> {
		let content;
		// When we are debugging avoid any caching so that we can change the html and have it update without reloading
		if (Logger.isDebugging) {
			content = await new Promise<string>((resolve, reject) => {
				fs.readFile(Container.context.asAbsolutePath("webview.html"), "utf8", (err, data) => {
					if (err) {
						reject(err);
					} else {
						resolve(data);
					}
				});
			});
		} else {
			if (this._html !== undefined) return this._html;

			const doc = await workspace.openTextDocument(
				Container.context.asAbsolutePath("webview.html")
			);
			content = doc.getText();
		}

		this._html = content.replace(
			/{{root}}/g,
			Uri.file(Container.context.asAbsolutePath("."))
				.with({ scheme: "vscode-resource" })
				.toString()
		);
		return this._html;
	}

	private notifyActiveEditorChanged(e: TextEditor | undefined) {
		if (this._webview === undefined) return;

		let editor: ActiveEditorInfo | undefined;

		if (e != null) {
			const originalUri = e.document.uri;
			let uri;
			switch (originalUri.scheme) {
				case "file":
				case "untitled":
					uri = originalUri;
					break;
				case "git":
				case "gitlens":
				case "codestream-patch":
					uri = originalUri.with({ scheme: "file", authority: "", query: "" });
					break;
			}

			if (uri !== undefined) {
				// Only tell the webview if the uri really is different
				const url = uri.toString();
				if (this._lastEditorUrl === url) {
					return;
				}

				this._lastEditorUrl = url;

				editor = {
					uri: this._lastEditorUrl,
					fileName: workspace.asRelativePath(uri),
					languageId: e.document.languageId,
					metrics: Editor.getMetrics(),
					selections: Editor.toEditorSelections(e.selections),
					visibleRanges: Editor.toSerializableRange(e.visibleRanges),
					lineCount: e.document.lineCount
				};
			}
		}

		this._webview.notify(HostDidChangeActiveEditorNotificationType, { editor: editor });
	}

	private updateState(hidden: boolean = false) {
		try {
			if (!this.session.signedIn) return;

			const prevState = Container.context.workspaceState.get<WebviewState>(
				WorkspaceState.webviewState,
				{
					hidden: hidden,
					teams: {}
				}
			);

			const teams = prevState.teams || {};
			teams[this.session.team.id] = {
				context: this._context
			};

			Container.context.workspaceState.update(WorkspaceState.webviewState, {
				hidden: hidden,
				teams: teams
			});

			if (
				!hidden &&
				this._context &&
				this._context.panelStack &&
				this._context.panelStack[0] === WebviewPanels.CodemarksForFile
			) {
				Container.markerDecorations.suspend();
			} else {
				Container.markerDecorations.resume();
			}
		} catch {}
	}
}
