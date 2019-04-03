import { RequestInit, Response } from "node-fetch";
import { Disposable, Event } from "vscode-languageserver";
import {
	AccessToken,
	ArchiveStreamRequest,
	ArchiveStreamResponse,
	Capabilities,
	CloseStreamRequest,
	CloseStreamResponse,
	ConnectionStatus,
	CreateChannelStreamRequest,
	CreateChannelStreamResponse,
	CreateCodemarkPermalinkRequest,
	CreateCodemarkPermalinkResponse,
	CreateCodemarkRequest,
	CreateCodemarkResponse,
	CreateDirectStreamRequest,
	CreateDirectStreamResponse,
	CreateMarkerLocationRequest,
	CreateMarkerLocationResponse,
	CreatePostRequest,
	CreatePostResponse,
	CreateRepoRequest,
	CreateRepoResponse,
	DeleteCodemarkRequest,
	DeleteCodemarkResponse,
	DeletePostRequest,
	DeletePostResponse,
	EditPostRequest,
	EditPostResponse,
	FetchCodemarksRequest,
	FetchCodemarksResponse,
	FetchFileStreamsRequest,
	FetchFileStreamsResponse,
	FetchMarkerLocationsRequest,
	FetchMarkerLocationsResponse,
	FetchMarkersRequest,
	FetchMarkersResponse,
	FetchPostRepliesRequest,
	FetchPostRepliesResponse,
	FetchPostsRequest,
	FetchPostsResponse,
	FetchReposRequest,
	FetchReposResponse,
	FetchStreamsRequest,
	FetchStreamsResponse,
	FetchTeamsRequest,
	FetchTeamsResponse,
	FetchUnreadStreamsRequest,
	FetchUnreadStreamsResponse,
	FetchUsersRequest,
	FetchUsersResponse,
	GetCodemarkRequest,
	GetCodemarkResponse,
	GetMarkerRequest,
	GetMarkerResponse,
	GetMeResponse,
	GetPostRequest,
	GetPostResponse,
	GetPreferencesResponse,
	GetRepoRequest,
	GetRepoResponse,
	GetStreamRequest,
	GetStreamResponse,
	GetTeamRequest,
	GetTeamResponse,
	GetUnreadsRequest,
	GetUnreadsResponse,
	GetUserRequest,
	GetUserResponse,
	InviteUserRequest,
	InviteUserResponse,
	JoinStreamRequest,
	JoinStreamResponse,
	LeaveStreamRequest,
	LeaveStreamResponse,
	MarkPostUnreadRequest,
	MarkPostUnreadResponse,
	MarkStreamReadRequest,
	MarkStreamReadResponse,
	MuteStreamRequest,
	MuteStreamResponse,
	OpenStreamRequest,
	OpenStreamResponse,
	ReactToPostRequest,
	ReactToPostResponse,
	RenameStreamRequest,
	RenameStreamResponse,
	SetCodemarkPinnedRequest,
	SetCodemarkPinnedResponse,
	SetCodemarkStatusRequest,
	SetCodemarkStatusResponse,
	SetStreamPurposeRequest,
	SetStreamPurposeResponse,
	ThirdPartyProviderConfig,
	UnarchiveStreamRequest,
	UnarchiveStreamResponse,
	Unreads,
	UpdateCodemarkRequest,
	UpdateCodemarkResponse,
	UpdateMarkerRequest,
	UpdateMarkerResponse,
	UpdatePreferencesRequest,
	UpdatePreferencesResponse,
	UpdatePresenceRequest,
	UpdatePresenceResponse,
	UpdateStreamMembershipRequest,
	UpdateStreamMembershipResponse
} from "../protocol/agent.protocol";
import {
	CSChannelStream,
	CSCodemark,
	CSDirectStream,
	CSLoginResponse,
	CSMarker,
	CSMarkerLocations,
	CSMe,
	CSMePreferences,
	CSPost,
	CSRepository,
	CSTeam,
	CSUser
} from "../protocol/api.protocol";

interface BasicLoginOptions {
	team?: string;
	teamId?: string;
}

export interface CredentialsLoginOptions extends BasicLoginOptions {
	type: "credentials";
	email: string;
	password: string;
}

export interface OneTimeCodeLoginOptions extends BasicLoginOptions {
	type: "otc";
	code: string;
}

export interface TokenLoginOptions extends BasicLoginOptions {
	type: "token";
	token: AccessToken;
}

export type LoginOptions = CredentialsLoginOptions | OneTimeCodeLoginOptions | TokenLoginOptions;

export enum MessageType {
	Connection = "connection",
	Codemarks = "codemarks",
	MarkerLocations = "markerLocations",
	Markers = "markers",
	Posts = "posts",
	Preferences = "preferences",
	Repositories = "repos",
	Streams = "streams",
	Teams = "teams",
	Unreads = "unreads",
	Users = "users"
}

export interface CodemarksRTMessage {
	type: MessageType.Codemarks;
	data: CSCodemark[];
}

export interface ConnectionRTMessage {
	type: MessageType.Connection;
	data: { reset?: boolean; status: ConnectionStatus };
}

export interface MarkerLocationsRTMessage {
	type: MessageType.MarkerLocations;
	data: CSMarkerLocations[];
}

export interface MarkersRTMessage {
	type: MessageType.Markers;
	data: CSMarker[];
}

export interface PostsRTMessage {
	type: MessageType.Posts;
	data: CSPost[];
}

export interface PreferencesRTMessage {
	type: MessageType.Preferences;
	data: CSMePreferences;
}

export interface RepositoriesRTMessage {
	type: MessageType.Repositories;
	data: CSRepository[];
}

export interface StreamsRTMessage {
	type: MessageType.Streams;
	data: (CSChannelStream | CSDirectStream)[];
}

export interface TeamsRTMessage {
	type: MessageType.Teams;
	data: CSTeam[];
}

export interface UnreadsRTMessage {
	type: MessageType.Unreads;
	data: Unreads;
}

export interface UsersRTMessage {
	type: MessageType.Users;
	data: CSUser[];
}

export interface RawRTMessage {
	type: MessageType;
	data?: any;
}

export type RTMessage =
	| CodemarksRTMessage
	| ConnectionRTMessage
	| MarkerLocationsRTMessage
	| MarkersRTMessage
	| PostsRTMessage
	| PreferencesRTMessage
	| RepositoriesRTMessage
	| StreamsRTMessage
	| TeamsRTMessage
	| UnreadsRTMessage
	| UsersRTMessage;

export interface ApiProvider {
	onDidReceiveMessage: Event<RTMessage>;

	readonly teamId: string;
	readonly userId: string;
	readonly capabilities: Capabilities;

	fetch<R extends object>(url: string, init?: RequestInit, token?: string): Promise<R>;
	useMiddleware(middleware: CodeStreamApiMiddleware): Disposable;
	dispose(): Promise<void>;

	login(options: LoginOptions): Promise<CSLoginResponse & { teamId: string }>;
	subscribe(types?: MessageType[]): Promise<void>;

	grantPubNubChannelAccess(token: string, channel: string): Promise<{}>;

	getMe(): Promise<GetMeResponse>;
	getUnreads(request: GetUnreadsRequest): Promise<GetUnreadsResponse>;
	updatePreferences(request: UpdatePreferencesRequest): Promise<UpdatePreferencesResponse>;
	getPreferences(): Promise<GetPreferencesResponse>;
	updatePresence(request: UpdatePresenceRequest): Promise<UpdatePresenceResponse>;
	getTelemetryKey(): Promise<string>;

	// createFileStream(request: CreateFileStreamRequest): Promise<CreateFileStreamResponse>;
	fetchFileStreams(request: FetchFileStreamsRequest): Promise<FetchFileStreamsResponse>;

	createCodemark(request: CreateCodemarkRequest): Promise<CreateCodemarkResponse>;
	deleteCodemark(request: DeleteCodemarkRequest): Promise<DeleteCodemarkResponse>;
	fetchCodemarks(request: FetchCodemarksRequest): Promise<FetchCodemarksResponse>;
	getCodemark(request: GetCodemarkRequest): Promise<GetCodemarkResponse>;
	setCodemarkPinned(request: SetCodemarkPinnedRequest): Promise<SetCodemarkPinnedResponse>;
	setCodemarkStatus(request: SetCodemarkStatusRequest): Promise<SetCodemarkStatusResponse>;
	updateCodemark(request: UpdateCodemarkRequest): Promise<UpdateCodemarkResponse>;

	createCodemarkPermalink(
		request: CreateCodemarkPermalinkRequest
	): Promise<CreateCodemarkPermalinkResponse>;

	createMarkerLocation(request: CreateMarkerLocationRequest): Promise<CreateMarkerLocationResponse>;
	fetchMarkerLocations(request: FetchMarkerLocationsRequest): Promise<FetchMarkerLocationsResponse>;

	fetchMarkers(request: FetchMarkersRequest): Promise<FetchMarkersResponse>;
	getMarker(request: GetMarkerRequest): Promise<GetMarkerResponse>;
	updateMarker(request: UpdateMarkerRequest): Promise<UpdateMarkerResponse>;

	createPost(request: CreatePostRequest): Promise<CreatePostResponse>;
	deletePost(request: DeletePostRequest): Promise<DeletePostResponse>;
	editPost(request: EditPostRequest): Promise<EditPostResponse>;
	fetchPostReplies(request: FetchPostRepliesRequest): Promise<FetchPostRepliesResponse>;
	fetchPosts(request: FetchPostsRequest): Promise<FetchPostsResponse>;
	getPost(request: GetPostRequest): Promise<GetPostResponse>;
	markPostUnread(request: MarkPostUnreadRequest): Promise<MarkPostUnreadResponse>;
	reactToPost(request: ReactToPostRequest): Promise<ReactToPostResponse>;

	createRepo(request: CreateRepoRequest): Promise<CreateRepoResponse>;
	fetchRepos(request: FetchReposRequest): Promise<FetchReposResponse>;
	getRepo(request: GetRepoRequest): Promise<GetRepoResponse>;

	createChannelStream(request: CreateChannelStreamRequest): Promise<CreateChannelStreamResponse>;
	createDirectStream(request: CreateDirectStreamRequest): Promise<CreateDirectStreamResponse>;
	fetchStreams(request: FetchStreamsRequest): Promise<FetchStreamsResponse>;
	fetchUnreadStreams(request: FetchUnreadStreamsRequest): Promise<FetchUnreadStreamsResponse>;
	getStream(request: GetStreamRequest): Promise<GetStreamResponse>;
	archiveStream(request: ArchiveStreamRequest): Promise<ArchiveStreamResponse>;
	closeStream(request: CloseStreamRequest): Promise<CloseStreamResponse>;
	joinStream(request: JoinStreamRequest): Promise<JoinStreamResponse>;
	leaveStream(request: LeaveStreamRequest): Promise<LeaveStreamResponse>;
	markStreamRead(request: MarkStreamReadRequest): Promise<MarkStreamReadResponse>;
	muteStream(request: MuteStreamRequest): Promise<MuteStreamResponse>;
	openStream(request: OpenStreamRequest): Promise<OpenStreamResponse>;
	renameStream(request: RenameStreamRequest): Promise<RenameStreamResponse>;
	setStreamPurpose(request: SetStreamPurposeRequest): Promise<SetStreamPurposeResponse>;
	unarchiveStream(request: UnarchiveStreamRequest): Promise<UnarchiveStreamResponse>;
	updateStreamMembership(
		request: UpdateStreamMembershipRequest
	): Promise<UpdateStreamMembershipResponse>;

	fetchTeams(request: FetchTeamsRequest): Promise<FetchTeamsResponse>;
	getTeam(request: GetTeamRequest): Promise<GetTeamResponse>;

	fetchUsers(request: FetchUsersRequest): Promise<FetchUsersResponse>;
	getUser(request: GetUserRequest): Promise<GetUserResponse>;
	inviteUser(request: InviteUserRequest): Promise<InviteUserResponse>;

	connectThirdPartyProvider(request: {
		providerName: string;
		apiKey?: string;
		host?: string;
	}): Promise<{ code: string }>;

	disconnectThirdPartyProvider(request: { providerName: string; host?: string }): Promise<void>;

	refreshThirdPartyProvider(request: {
		provider: ThirdPartyProviderConfig;
		refreshToken: string;
	}): Promise<CSMe>;
}

export interface CodeStreamApiMiddlewareContext {
	url: string;
	method: string;
	request: RequestInit | undefined;
	response?: Response;
}

export interface CodeStreamApiMiddleware {
	readonly name: string;
	onRequest?(context: Readonly<CodeStreamApiMiddlewareContext>): Promise<void>;
	onProvideResponse?<R>(context: Readonly<CodeStreamApiMiddlewareContext>): Promise<R>;
	onResponse?<R>(
		context: Readonly<CodeStreamApiMiddlewareContext>,
		responseJson: Promise<R> | undefined
	): Promise<void>;
}
