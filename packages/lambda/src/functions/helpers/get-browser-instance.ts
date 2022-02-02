import {openBrowser} from '@remotion/renderer';
import {ChromiumOptions} from '@remotion/renderer/src/open-browser';
import {Await} from '../../shared/await';
import {executablePath} from './get-chromium-executable-path';

let _browserInstance: Await<ReturnType<typeof openBrowser>> | null;

let launching = false;

const waitForLaunched = () => {
	return new Promise<void>((resolve, reject) => {
		const check = () =>
			setTimeout(() => {
				if (launching) {
					resolve();
				} else {
					check();
				}
			}, 16);

		setTimeout(() => reject(new Error('Timeout launching browser')), 5000);
		check();
	});
};

export const getBrowserInstance = async (
	shouldDumpIo: boolean,
	chromiumOptions: ChromiumOptions
): ReturnType<typeof openBrowser> => {
	if (launching) {
		await waitForLaunched();
		if (!_browserInstance) {
			throw new Error('expected to launch');
		}

		return _browserInstance;
	}

	if (_browserInstance) {
		return _browserInstance;
	}

	launching = true;

	const execPath = await executablePath();
	_browserInstance = await openBrowser('chrome', {
		browserExecutable: execPath,
		shouldDumpIo,
		chromiumOptions,
	});
	_browserInstance.on('disconnected', () => {
		console.log('Browser disconnected / crashed');
		_browserInstance?.close().catch(() => undefined);
		_browserInstance = null;
	});
	launching = false;
	return _browserInstance;
};

export const killBrowserInstancesForIntegrationTest = (): Promise<void> => {
	if (_browserInstance) {
		return _browserInstance.close();
	}

	return Promise.resolve();
};
