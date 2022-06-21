/**
 * Copyright 2020 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import https, {RequestOptions} from 'https';
import ProgressBar from 'progress';
import {puppeteer} from './node';
import {Product} from './Product';
import {PuppeteerNode} from './PuppeteerNode';
import {PUPPETEER_REVISIONS} from './revisions';

const supportedProducts = {
	chrome: 'Chromium',
	firefox: 'Firefox Nightly',
} as const;

export async function downloadBrowser(product: Product): Promise<void> {
	const browserFetcher = puppeteer.createBrowserFetcher({
		product,
		path: null,
		platform: null,
	});
	const revision = await getRevision();
	await fetchBinary(revision);

	function getRevision(): Promise<string> {
		if (product === 'chrome') {
			return Promise.resolve(
				process.env.PUPPETEER_CHROMIUM_REVISION ||
					process.env.npm_config_puppeteer_chromium_revision ||
					PUPPETEER_REVISIONS.chromium
			);
		}

		if (product === 'firefox') {
			(puppeteer as PuppeteerNode)._preferredRevision =
				PUPPETEER_REVISIONS.firefox;
			return getFirefoxNightlyVersion().catch((error) => {
				console.error(error);
				process.exit(1);
			});
		}

		throw new Error(`Unsupported product ${product}`);
	}

	function fetchBinary(_revision: string) {
		const revisionInfo = browserFetcher.revisionInfo(_revision);

		// Do nothing if the revision is already downloaded.
		if (revisionInfo.local) {
			logPolitely(
				`${supportedProducts[product]} is already in ${revisionInfo.folderPath}; skipping download.`
			);
			return;
		}

		function onSuccess(localRevisions: string[]): void {
			logPolitely(
				`${supportedProducts[product]} (${revisionInfo.revision}) downloaded to ${revisionInfo.folderPath}`
			);
			localRevisions = localRevisions.filter((__revision) => {
				return __revision !== revisionInfo.revision;
			});
			const cleanupOldVersions = localRevisions.map((__revision) => {
				return browserFetcher.remove(__revision);
			});
			Promise.all([...cleanupOldVersions]);
		}

		function onError(error: Error) {
			console.error(
				`ERROR: Failed to set up ${supportedProducts[product]} r${_revision}! Set "PUPPETEER_SKIP_DOWNLOAD" env variable to skip download.`
			);
			console.error(error);
			process.exit(1);
		}

		let progressBar: ProgressBar | null = null;
		let lastDownloadedBytes = 0;
		function onProgress(downloadedBytes: number, totalBytes: number) {
			if (!progressBar) {
				progressBar = new ProgressBar(
					`Downloading ${
						supportedProducts[product]
					} r${_revision} - ${toMegabytes(totalBytes)} [:bar] :percent :etas `,
					{
						complete: '=',
						incomplete: ' ',
						width: 20,
						total: totalBytes,
					}
				);
			}

			const delta = downloadedBytes - lastDownloadedBytes;
			lastDownloadedBytes = downloadedBytes;
			progressBar.tick(delta);
		}

		return browserFetcher
			.download(revisionInfo.revision, onProgress)
			.then(() => {
				return browserFetcher.localRevisions();
			})
			.then(onSuccess)
			.catch(onError);
	}

	function toMegabytes(bytes: number) {
		const mb = bytes / 1024 / 1024;
		return `${Math.round(mb * 10) / 10} Mb`;
	}

	function getFirefoxNightlyVersion(): Promise<string> {
		const firefoxVersionsUrl =
			'https://product-details.mozilla.org/1.0/firefox_versions.json';

		const requestOptions: RequestOptions = {};

		const promise = new Promise<string>((resolve, reject) => {
			let data = '';
			logPolitely(
				`Requesting latest Firefox Nightly version from ${firefoxVersionsUrl}`
			);
			https
				.get(firefoxVersionsUrl, requestOptions, (r) => {
					if (r.statusCode && r.statusCode >= 400) {
						return reject(new Error(`Got status code ${r.statusCode}`));
					}

					r.on('data', (chunk) => {
						data += chunk;
					});
					r.on('end', () => {
						try {
							const versions = JSON.parse(data);
							return resolve(versions.FIREFOX_NIGHTLY);
						} catch {
							return reject(new Error('Firefox version not found'));
						}
					});
				})
				.on('error', reject);
		});
		return promise;
	}
}

function logPolitely(toBeLogged: unknown): void {
	const logLevel = process.env.npm_config_loglevel || '';
	const logLevelDisplay = ['silent', 'error', 'warn'].indexOf(logLevel) > -1;

	// eslint-disable-next-line no-console
	if (!logLevelDisplay) {
		console.log(toBeLogged);
	}
}
