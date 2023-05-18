import {VERSION} from 'remotion/version';

export const serviceVersionString = () => {
	return VERSION.replace(/\./g, '-').replace(/\+/g, '-').substring(0, 10);
};
