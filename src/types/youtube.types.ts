/**
 * Context of the floating YouTube player.
 *
 * It lives in its own module because both the player component and the
 * store need it, and neither of them should depend on the other.
 */
export type YouTubePlayerContext = {
	mediaDirectory: string;
	thumbnailImage: string;
	thumbnailImageSrc: string;
	videoId: string;
	url: string;
};
