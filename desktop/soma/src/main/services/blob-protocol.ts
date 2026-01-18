import { protocol } from "electron";
import type { DaemonClient } from "./daemon-client";

export class BlobProtocolRegistrar {
	constructor(
		private readonly daemon: DaemonClient,
	) {}

	register(): void {
		protocol.registerBufferProtocol(
			"soma-blob",
			async (
				request,
				callback,
			) => {
				const url =
					request.url.replace(
						"soma-blob://",
						"",
					);
				const [
					,
					spaceId,
					cid,
				] =
					url.split(
						"/",
					);
				if (
					!spaceId ||
					!cid
				) {
					callback(
						{
							error:
								-324,
						},
					); // ERR_INVALID_URL
					return;
				}

				try {
					const res =
						await this.daemon.readBlob(
							spaceId,
							cid,
						);
					if (
						!res?.data ||
						!res
							.data
							.length
					) {
						callback(
							{
								error:
									-6,
							},
						); // ERR_FILE_NOT_FOUND
						return;
					}
					const data =
						Buffer.from(
							res.data,
						);
					callback(
						{
							data,
							mimeType:
								res.mime ||
								"application/octet-stream",
						},
					);
				} catch (error) {
					callback(
						{
							error:
								-2,
						},
					); // ERR_FAILED
				}
			},
		);
	}
}
