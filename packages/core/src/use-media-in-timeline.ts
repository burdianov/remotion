import {RefObject, useContext, useEffect, useMemo, useState} from 'react';
import {useAudioStartsAt} from './audio/use-audio-frame';
import {CompositionManager} from './CompositionManager';
import {getAssetFileName} from './get-asset-file-name';
import {useNonce} from './nonce';
import {SequenceContext} from './sequencing';
import {TimelineContext} from './timeline-position-state';
import {VideoConfig} from './video-config';
import {evaluateVolume, VolumeProp} from './volume-prop';

export const useMediaInTimeline = ({
	videoConfig,
	volume,
	mediaRef,
	src,
	mediaType,
}: {
	videoConfig: VideoConfig | null;
	volume: VolumeProp | undefined;
	mediaRef: RefObject<HTMLAudioElement | HTMLVideoElement>;
	src: string | undefined;
	mediaType: 'audio' | 'video';
}) => {
	const {rootId} = useContext(TimelineContext);
	const parentSequence = useContext(SequenceContext);
	const actualFrom = parentSequence
		? parentSequence.relativeFrom + parentSequence.cumulatedFrom
		: 0;
	const startsAt = useAudioStartsAt();
	const {registerSequence, unregisterSequence} = useContext(CompositionManager);
	const [id] = useState(() => String(Math.random()));
	const nonce = useNonce();

	const duration = (() => {
		if (!videoConfig) {
			return 0;
		}
		return parentSequence
			? Math.min(parentSequence.durationInFrames, videoConfig.durationInFrames)
			: videoConfig.durationInFrames;
	})();

	const volumes: string | number = useMemo(() => {
		if (typeof volume === 'number') {
			return volume;
		}

		const negativeShift = Math.min(0, parentSequence?.parentFrom ?? 0);
		return new Array(duration + startsAt + negativeShift)
			.fill(true)
			.map((_, i) => {
				return evaluateVolume({
					frame: i - negativeShift,
					volume,
				});
			})
			.join(',');
	}, [duration, parentSequence, startsAt, volume]);

	useEffect(() => {
		if (!mediaRef.current) {
			return;
		}
		if (!videoConfig) {
			return;
		}

		if (!src) {
			throw new Error('No src passed');
		}

		registerSequence({
			type: mediaType,
			src,
			id,
			// TODO: Cap to media duration
			duration,
			from: 0,
			parent: parentSequence?.id ?? null,
			displayName: getAssetFileName(src),
			rootId,
			volume: volumes,
			showInTimeline: true,
			nonce,
		});
		return () => unregisterSequence(id);
	}, [
		actualFrom,
		duration,
		id,
		parentSequence,
		src,
		registerSequence,
		rootId,
		unregisterSequence,
		videoConfig,
		volumes,
		nonce,
		mediaRef,
		mediaType,
	]);
};
